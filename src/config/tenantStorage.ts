import { AsyncLocalStorage } from 'async_hooks';
import mongoose from 'mongoose';
import SiteSetting from '../models/SiteSetting';

export type TenantStorageContext = {
  institutionId: string;
  // primary running MongoDB URI for tenant (read/write)
  mongoUri?: string;
  // optional array of archive/previous MongoDB URIs (read-only fallback)
  archiveMongoUris?: string[];
};

const schoolDataModels = new Set([
  'AdmissionApplication', 'Attendance', 'AuditLog', 'BackupConfig', 'Class', 'Committee', 'Document', 'Exam', 'Fee', 'IDCard', 'Message', 'Notice', 'Notification', 'Parent', 'Payment', 'Result', 'Salary', 'Section', 'SmsLog', 'Staff', 'Student', 'Subject', 'Teacher', 'User',
]);
const primaryMirrorModels = new Set(['User', 'Institution']);
const tenantStorage = new AsyncLocalStorage<TenantStorageContext | null>();
const tenantConnections = new Map<string, Promise<mongoose.Connection | null>>();
const tenantConnectionLastAccess = new Map<string, number>();
const tenantConnectionFailures = new Map<string, number>();
const tenantConnectionRetryMs = Number(process.env.TENANT_MONGO_RETRY_AFTER_MS || 5000);
const tenantConnectionHardTimeoutMs = Number(process.env.TENANT_MONGO_HARD_TIMEOUT_MS || 15000);
const tenantQueryMaxTimeMs = Number(process.env.TENANT_MONGO_QUERY_MAX_TIME_MS || 25000);
const tenantQueryHardTimeoutMs = Number(process.env.TENANT_MONGO_QUERY_HARD_TIMEOUT_MS || 15000);
const tenantStrictStorage = String(process.env.TENANT_MONGO_STRICT || 'true').toLowerCase() !== 'false';
let patchesInstalled = false;

const getDocumentObject = (doc: any) => {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject({ depopulate: true, versionKey: false });
  return doc;
};
const modelCollectionName = (model: any) => model?.collection?.name || model?.modelName;
const isPrimarySchoolModel = (model: any) => Boolean(model?.modelName && model?.db === mongoose.connection && schoolDataModels.has(model.modelName));
const storageUnavailableError = (modelName: string, reason = 'Personal MongoDB connection/query failed or timed out') => {
  const error: any = new Error(`School data storage unavailable for ${modelName}. ${reason}. Please check the school Personal MongoDB URI/network access. Primary database fallback is disabled for school data.`);
  error.statusCode = 503;
  error.code = 'TENANT_STORAGE_UNAVAILABLE';
  error.reason = reason;
  return error;
};
const registerModel = (connection: mongoose.Connection, baseModel: any) => {
  if (!baseModel?.modelName || !baseModel?.schema) return null;
  if (connection.models[baseModel.modelName]) return connection.models[baseModel.modelName];
  return connection.model(baseModel.modelName, baseModel.schema, modelCollectionName(baseModel));
};
const registerBridgeModels = (connection: mongoose.Connection) => {
  for (const modelName of primaryMirrorModels) {
    const baseModel = mongoose.models[modelName];
    if (baseModel) registerModel(connection, baseModel);
  }
};
const registerAllModels = (connection: mongoose.Connection) => {
  for (const modelName of Object.keys(mongoose.models)) {
    const baseModel = mongoose.models[modelName];
    if (baseModel) registerModel(connection, baseModel);
  }
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T | null> => {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
          onTimeout();
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const getTenantConnection = async (context: TenantStorageContext) => {
  if (!context.mongoUri) return null;
  const key = `${context.institutionId}:${context.mongoUri}`;
  const failedAt = tenantConnectionFailures.get(key) || 0;
  if (failedAt && Date.now() - failedAt < tenantConnectionRetryMs) return null;
  if (!tenantConnections.has(key)) {
    tenantConnections.set(key, mongoose.createConnection(context.mongoUri, {
      maxPoolSize: Number(process.env.TENANT_MONGO_POOL_SIZE || 5),
      serverSelectionTimeoutMS: Number(process.env.TENANT_MONGO_SERVER_SELECTION_TIMEOUT_MS || 12000),
      connectTimeoutMS: Number(process.env.TENANT_MONGO_CONNECT_TIMEOUT_MS || 12000),
      socketTimeoutMS: Number(process.env.TENANT_MONGO_SOCKET_TIMEOUT_MS || 30000),
      retryWrites: true,
    }).asPromise().then((connection) => {
      tenantConnectionFailures.delete(key);
      registerBridgeModels(connection);
      registerAllModels(connection);
      connection.collection('users').dropIndex('email_1').catch(() => {});
      connection.collection('users').dropIndex('username_1').catch(() => {});
      return connection;
    }).catch((error) => {
      tenantConnections.delete(key);
      tenantConnectionFailures.set(key, Date.now());
      console.warn('Tenant Mongo connection failed:', error?.message || error);
      return null;
    }));
  }
  tenantConnectionLastAccess.set(key, Date.now());
  const connection = await withTimeout(tenantConnections.get(key)!, tenantConnectionHardTimeoutMs, () => {
    console.warn('Tenant Mongo connection timed out. Primary fallback is disabled for school data.');
  });
  if (!connection) return null;
  tenantConnectionLastAccess.set(key, Date.now());
  return connection;
};
const getTenantModel = async (baseModel: any, context: TenantStorageContext | null | undefined, forRead = false) => {
  if (!context || !baseModel?.modelName || !schoolDataModels.has(baseModel.modelName)) return null;
  if (baseModel.db !== mongoose.connection) return null;
  // Prefer primary running mongoUri for read/write
  if (context.mongoUri) {
    const primaryContext = { ...context, mongoUri: context.mongoUri } as TenantStorageContext;
    const primaryConnection = await getTenantConnection(primaryContext);
    if (primaryConnection) {
      registerAllModels(primaryConnection);
      return registerModel(primaryConnection, baseModel);
    }
  }
  // If this is a read operation, try archive URIs (allow reading historical data)
  if (forRead && Array.isArray(context.archiveMongoUris)) {
    for (const uri of context.archiveMongoUris) {
      if (!uri) continue;
      const archiveContext = { ...context, mongoUri: uri } as TenantStorageContext;
      const archiveConnection = await getTenantConnection(archiveContext);
      if (archiveConnection) return registerModel(archiveConnection, baseModel);
    }
  }
  return null;
};

const mirrorPrimaryDocument = async (baseModel: any, doc: any, context: TenantStorageContext | null | undefined) => {
  if (String(process.env.TENANT_MONGO_MIRROR_ENABLED || '').toLowerCase() !== 'true') return;
  if (!context?.mongoUri || !baseModel?.modelName || !primaryMirrorModels.has(baseModel.modelName) || !doc?._id) return;
  if (baseModel.db !== mongoose.connection) return;
  const connection = await getTenantConnection(context);
  if (!connection) return;
  const mirrorModel = registerModel(connection, baseModel);
  if (!mirrorModel) return;
  await mirrorModel.collection.updateOne({ _id: doc._id }, { $set: getDocumentObject(doc) }, { upsert: true });
};
const schedulePrimaryMirror = (baseModel: any, doc: any, context: TenantStorageContext | null | undefined) => {
  if (Array.isArray(doc)) { doc.forEach((item) => schedulePrimaryMirror(baseModel, item, context)); return; }
  mirrorPrimaryDocument(baseModel, doc, context).catch((error) => console.warn('Tenant primary mirror failed:', (error as any)?.message || String(error)));
};
const mirrorContextReferences = async (context: TenantStorageContext | null | undefined, user?: any, institution?: any) => {
  if (!context?.mongoUri) return;
  await Promise.all([
    user ? mirrorPrimaryDocument(mongoose.models.User, user, context) : Promise.resolve(),
    institution ? mirrorPrimaryDocument(mongoose.models.Institution, institution, context) : Promise.resolve(),
  ]);
};

const mirrorToArchives = async (baseModel: any, doc: any, context: TenantStorageContext | null | undefined) => {
  if (!context || !Array.isArray(context.archiveMongoUris) || !context.archiveMongoUris.length) return;
  try {
    const payload = getDocumentObject(doc);
    for (const uri of context.archiveMongoUris) {
      if (!uri) continue;
      try {
        const archiveContext = { ...context, mongoUri: uri } as TenantStorageContext;
        const conn = await getTenantConnection(archiveContext);
        if (!conn) continue;
        const model = registerModel(conn, baseModel);
        if (!model) continue;
        await model.collection.updateOne({ _id: payload._id }, { $set: payload }, { upsert: true });
      } catch (err) {
        console.warn('Archive mirror failed for uri', uri, (err as any)?.message || String(err));
      }
    }
  } catch (err) {
    console.warn('mirrorToArchives error:', (err as any)?.message || String(err));
  }
};

const emitChangeWebhook = async (modelName: string, doc: any, context: TenantStorageContext | null | undefined) => {
  try {
    const setting = await SiteSetting.findOne({ key: 'site_config' }).lean();
    const cfg: any = setting?.value || {};
    const url = String(cfg?.eventWebhookUrl || cfg?.webhookUrl || process.env.EVENT_WEBHOOK_URL || '').trim();
    if (!url) return;
    const body = { model: modelName, document: getDocumentObject(doc), institutionId: context?.institutionId, timestamp: new Date().toISOString() };
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (err) {
      console.warn('emitChangeWebhook failed:', (err as any)?.message || String(err));
    }
  } catch (err) {
    console.warn('emitChangeWebhook error:', (err as any)?.message || String(err));
  }
};

const scheduleArchiveMirrorAndWebhook = (baseModel: any, doc: any, context: TenantStorageContext | null | undefined) => {
  if (!doc) return;
  // run in background
  void (async () => {
    try {
      await mirrorToArchives(baseModel, doc, context);
    } catch (e) { console.warn('scheduleArchiveMirror error', (e as any)?.message || String(e)); }
    try {
      await emitChangeWebhook(baseModel?.modelName || baseModel, doc, context);
    } catch (e) { console.warn('scheduleWebhook error', (e as any)?.message || String(e)); }
  })();
};

export const getTenantStorageContext = () => tenantStorage.getStore() || null;
export const runWithTenantStorage = <T>(context: TenantStorageContext | null, callback: () => T, user?: any, institution?: any) => tenantStorage.run(context, () => {
  if (context?.mongoUri && String(process.env.TENANT_MONGO_MIRROR_ENABLED || '').toLowerCase() === 'true') {
    mirrorContextReferences(context, user, institution).catch((error) => console.warn('Tenant reference mirror failed:', error?.message || error));
  }
  return callback();
});

export const resolveTenantStorageContext = (institution: any): TenantStorageContext | null => {
  const billing = institution?.billing || {};
  const settings = institution?.settings || {};
  const activeAcademicYear = Array.isArray(settings.academicYears) ? settings.academicYears.find((item: any) => item?.isActive || item?.year === settings.activeAcademicYear) : null;
  const usesEasySchoolStorage = billing.useEasySchoolStorage !== false;
  const directMongoUri = String(settings.mongodbUri || '').trim();
  const legacyMongoUrl = String(settings.mongodbUrl || '').trim();
  // Collect configured MongoDB URIs (site settings may contain multiple URIs in history)
  const mongoItems = Array.isArray(settings.mongodbUris) ? settings.mongodbUris : [];
  const normalized = mongoItems.map((it: any) => String(it?.uri || it?.mongodbUrl || '').trim()).filter(Boolean);
  if (directMongoUri && !normalized.includes(directMongoUri)) normalized.push(directMongoUri);
  if (legacyMongoUrl && !normalized.includes(legacyMongoUrl)) normalized.push(legacyMongoUrl);
  // pick active primary from settings (site controls ensure one is active), else use first
  const activeItem = (Array.isArray(settings.mongodbUris) ? settings.mongodbUris.find((i: any) => i?.isActive) : null) || mongoItems[0];
  const activeUri = activeItem ? String(activeItem.uri || activeItem.mongodbUrl || '').trim() : (directMongoUri || legacyMongoUrl || activeAcademicYear?.mongodbUri || '').trim();

  // If the school is configured to use central EasySchool storage and has active billing/storage, don't set tenant mongo by default
  let primaryUri = '';
  const allowPersonalWhenNoStorage = Boolean(settings.allowPersonalMongo === true || settings.allowPersonalStorage === true);
  const hasPersonalConfigured = Boolean(activeUri || normalized.length);
  const billingAllowsStorage = billing && billing.billingStatus === 'active' && (Number(billing.storageAmount || 0) > 0);

  if (!usesEasySchoolStorage) {
    // school chose to use personal storage explicitly
    primaryUri = activeUri || (normalized.length ? normalized[0] : '');
  } else if (usesEasySchoolStorage && !billingAllowsStorage && hasPersonalConfigured && allowPersonalWhenNoStorage) {
    // school uses central storage by default, but billing doesn't allow storage; allow personal fallback if configured and permitted
    primaryUri = activeUri || (normalized.length ? normalized[0] : '');
  }

  const archiveUris = normalized.filter((u: string) => u && u !== primaryUri);
  if (!primaryUri) return null;
  return { institutionId: String(institution?._id || institution?.id || ''), mongoUri: primaryUri || undefined, archiveMongoUris: archiveUris.length ? archiveUris : undefined };
};

export const installTenantStoragePatches = () => {
  if (patchesInstalled) return;
  patchesInstalled = true;

  const originalQueryExec = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = async function patchedTenantQueryExec(this: any, ...args: any[]) {
    const context = getTenantStorageContext();
    const primaryQuery = typeof this.clone === 'function' ? this.clone() : null;
      const shouldUseTenant = Boolean(context?.mongoUri && isPrimarySchoolModel(this.model));
      const op = String(this.op || '').toLowerCase();
      const readOps = ['find', 'findone', 'count', 'estimateddocumentcount', 'distinct', 'aggregate', 'countdocuments'];
      const forRead = readOps.some((o) => op.startsWith(o) || String(this.op).toLowerCase() === o) || this.op == null;
      const tenantModel = await getTenantModel(this.model, context, forRead);
    if (tenantModel) {
      this.model = tenantModel;
      this.mongooseCollection = tenantModel.collection;
      this._collection = tenantModel.collection;
      this.maxTimeMS(tenantQueryMaxTimeMs);
      const result = await withTimeout(originalQueryExec.apply(this, args as any), tenantQueryHardTimeoutMs, () => {
        console.warn(`Tenant query timed out for ${tenantModel.modelName}. Primary fallback disabled.`);
      });
      if (result !== null) return result;
      if (tenantStrictStorage) throw storageUnavailableError(tenantModel.modelName, `Tenant query timed out after ${tenantQueryHardTimeoutMs}ms`);
      if (primaryQuery) return originalQueryExec.apply(primaryQuery, args as any);
      throw storageUnavailableError(tenantModel.modelName);
    }
    if (shouldUseTenant && tenantStrictStorage) throw storageUnavailableError(this.model?.modelName || 'SchoolData', `Tenant model connection failed after ${tenantConnectionHardTimeoutMs}ms`);
    const result = await originalQueryExec.apply(this, args as any);
    // If primary DB result and tenant context exists, handle mirroring and webhook
    if (!tenantModel && context?.mongoUri && this.model?.db === mongoose.connection && this.model?.modelName) {
      if (primaryMirrorModels.has(this.model.modelName)) schedulePrimaryMirror(this.model, result, context);
      // detect write ops to schedule archive mirror (for historical storage) and webhook
      const writeOps = ['update', 'updateone', 'updatemany', 'findoneandupdate', 'findoneandreplace', 'findoneanddelete', 'findoneandremove', 'remove', 'deleteone', 'deletemany', 'insertmany', 'insert'];
      const opName = String(this.op || '').toLowerCase();
      const isWrite = writeOps.some((w) => opName.includes(w));
      if (isWrite && schoolDataModels.has(this.model.modelName)) scheduleArchiveMirrorAndWebhook(this.model, result, context);
    }
    return result;
  };

  const originalAggregateExec = mongoose.Aggregate.prototype.exec;
  mongoose.Aggregate.prototype.exec = async function patchedTenantAggregateExec(this: any, ...args: any[]) {
    const context = getTenantStorageContext();
    const primaryAggregate = typeof this.model === 'function' && this._model ? this._model.aggregate(this.pipeline()) : null;
    const shouldUseTenant = Boolean(context?.mongoUri && isPrimarySchoolModel(this._model));
    const forRead = true; // aggregates are read-only by nature
    const tenantModel = await getTenantModel(this._model, context, forRead);
    if (tenantModel) {
      this._model = tenantModel;
      this.option({ maxTimeMS: tenantQueryMaxTimeMs });
      const result = await withTimeout(originalAggregateExec.apply(this, args as any), tenantQueryHardTimeoutMs, () => {
        console.warn(`Tenant aggregate timed out for ${tenantModel.modelName}. Primary fallback disabled.`);
      });
      if (result !== null) return result;
      if (tenantStrictStorage) throw storageUnavailableError(tenantModel.modelName, `Tenant aggregate timed out after ${tenantQueryHardTimeoutMs}ms`);
      if (primaryAggregate) return originalAggregateExec.apply(primaryAggregate, args as any);
      throw storageUnavailableError(tenantModel.modelName);
    }
    if (shouldUseTenant && tenantStrictStorage) throw storageUnavailableError(this._model?.modelName || 'SchoolData', `Tenant model connection failed after ${tenantConnectionHardTimeoutMs}ms`);
    return originalAggregateExec.apply(this, args as any);
  };

  const originalSave = mongoose.Model.prototype.save;
  mongoose.Model.prototype.save = async function patchedTenantSave(this: any, ...args: any[]) {
    const context = getTenantStorageContext();
    const shouldUseTenant = Boolean(context?.mongoUri && isPrimarySchoolModel(this.constructor));
    const tenantModel = await getTenantModel(this.constructor, context);
    if (tenantModel) {
      const tenantDoc = new tenantModel(getDocumentObject(this));
      tenantDoc.isNew = this.isNew;
      const saved = await originalSave.apply(tenantDoc, args as any);
      this.set(getDocumentObject(saved));
      this.isNew = false;
      return this;
    }
    if (shouldUseTenant && tenantStrictStorage) throw storageUnavailableError(this.constructor?.modelName || 'SchoolData', `Tenant model connection failed after ${tenantConnectionHardTimeoutMs}ms`);
    const saved = await originalSave.apply(this, args as any);
    if (context?.mongoUri && this.constructor?.db === mongoose.connection) {
      if (primaryMirrorModels.has(this.constructor?.modelName)) schedulePrimaryMirror(this.constructor, saved, context);
      if (schoolDataModels.has(this.constructor?.modelName)) scheduleArchiveMirrorAndWebhook(this.constructor, saved, context);
    }
    return saved;
  };
};

installTenantStoragePatches();

const evictIdleConnections = async () => {
  const idleTimeoutMs = Number(process.env.TENANT_MONGO_IDLE_TIMEOUT_MS || 3600000); // default 1 hour
  const now = Date.now();
  for (const [key, promise] of tenantConnections.entries()) {
    const lastAccess = tenantConnectionLastAccess.get(key) || 0;
    if (now - lastAccess > idleTimeoutMs) {
      tenantConnections.delete(key);
      tenantConnectionLastAccess.delete(key);
      try {
        const conn = await promise;
        if (conn) {
          await conn.close();
          console.log(`[TenantStorage] Evicted and closed idle connection: ${key}`);
        }
      } catch (err) {
        console.warn(`[TenantStorage] Error closing idle connection ${key}:`, err);
      }
    }
  }
};

// Run connection eviction check periodically (default every 5 minutes)
const evictionIntervalMs = Number(process.env.TENANT_MONGO_EVICT_INTERVAL_MS || 300000);
const evictionTimer = setInterval(() => {
  evictIdleConnections().catch((err) => {
    console.error('[TenantStorage] Connection eviction error:', err);
  });
}, evictionIntervalMs);

// Unref the timer so it doesn't block process exit (especially useful for tests and clean shutdowns)
if (evictionTimer && typeof evictionTimer.unref === 'function') {
  evictionTimer.unref();
}
