import { AsyncLocalStorage } from 'async_hooks';
import mongoose from 'mongoose';
import SiteSetting from '../models/SiteSetting';

export type TenantStorageContext = {
  institutionId: string;
  mongoUri?: string;
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

const isValidMongoUri = (value: any) => /^mongodb(\+srv)?:\/\//i.test(String(value || '').trim());
const cleanMongoUri = (value: any) => { const uri = String(value || '').trim(); return isValidMongoUri(uri) ? uri : ''; };
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
        timeout = setTimeout(() => { onTimeout(); resolve(null); }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const getTenantConnection = async (context: TenantStorageContext) => {
  const uri = cleanMongoUri(context.mongoUri);
  if (!uri) return null;
  const key = `${context.institutionId}:${uri}`;
  const failedAt = tenantConnectionFailures.get(key) || 0;
  if (failedAt && Date.now() - failedAt < tenantConnectionRetryMs) return null;
  if (!tenantConnections.has(key)) {
    tenantConnections.set(key, mongoose.createConnection(uri, {
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
  const connection = await withTimeout(tenantConnections.get(key)!, tenantConnectionHardTimeoutMs, () => console.warn('Tenant Mongo connection timed out. Primary fallback is disabled for school data.'));
  if (!connection) return null;
  tenantConnectionLastAccess.set(key, Date.now());
  return connection;
};
const getTenantModel = async (baseModel: any, context: TenantStorageContext | null | undefined, forRead = false) => {
  if (!context || !baseModel?.modelName || !schoolDataModels.has(baseModel.modelName)) return null;
  if (baseModel.db !== mongoose.connection) return null;
  const primaryUri = cleanMongoUri(context.mongoUri);
  if (primaryUri) {
    const primaryConnection = await getTenantConnection({ ...context, mongoUri: primaryUri });
    if (primaryConnection) {
      registerAllModels(primaryConnection);
      return registerModel(primaryConnection, baseModel);
    }
  }
  if (forRead && Array.isArray(context.archiveMongoUris)) {
    for (const raw of context.archiveMongoUris) {
      const uri = cleanMongoUri(raw);
      if (!uri) continue;
      const archiveConnection = await getTenantConnection({ ...context, mongoUri: uri });
      if (archiveConnection) return registerModel(archiveConnection, baseModel);
    }
  }
  return null;
};

const mirrorPrimaryDocument = async (baseModel: any, doc: any, context: TenantStorageContext | null | undefined) => {
  if (String(process.env.TENANT_MONGO_MIRROR_ENABLED || '').toLowerCase() !== 'true') return;
  const uri = cleanMongoUri(context?.mongoUri);
  if (!uri || !baseModel?.modelName || !primaryMirrorModels.has(baseModel.modelName) || !doc?._id) return;
  if (baseModel.db !== mongoose.connection) return;
  const connection = await getTenantConnection({ ...context!, mongoUri: uri });
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
  const uri = cleanMongoUri(context?.mongoUri);
  if (!uri || !context) return;
  await Promise.all([
    user ? mirrorPrimaryDocument(mongoose.models.User, user, { ...context, mongoUri: uri }) : Promise.resolve(),
    institution ? mirrorPrimaryDocument(mongoose.models.Institution, institution, { ...context, mongoUri: uri }) : Promise.resolve(),
  ]);
};

const mirrorToArchives = async (baseModel: any, doc: any, context: TenantStorageContext | null | undefined) => {
  if (!context || !Array.isArray(context.archiveMongoUris) || !context.archiveMongoUris.length) return;
  try {
    const payload = getDocumentObject(doc);
    for (const raw of context.archiveMongoUris) {
      const uri = cleanMongoUri(raw);
      if (!uri) continue;
      try {
        const conn = await getTenantConnection({ ...context, mongoUri: uri });
        if (!conn) continue;
        const model = registerModel(conn, baseModel);
        if (!model) continue;
        await model.collection.updateOne({ _id: payload._id }, { $set: payload }, { upsert: true });
      } catch (err) { console.warn('Archive mirror failed for uri', uri, (err as any)?.message || String(err)); }
    }
  } catch (err) { console.warn('mirrorToArchives error:', (err as any)?.message || String(err)); }
};

const emitChangeWebhook = async (modelName: string, doc: any, context: TenantStorageContext | null | undefined) => {
  try {
    const setting = await SiteSetting.findOne({ key: 'site_config' }).lean();
    const cfg: any = setting?.value || {};
    const url = String(cfg?.eventWebhookUrl || cfg?.webhookUrl || process.env.EVENT_WEBHOOK_URL || '').trim();
    if (!url) return;
    const body = { model: modelName, document: getDocumentObject(doc), institutionId: context?.institutionId, timestamp: new Date().toISOString() };
    try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); } catch (err) { console.warn('emitChangeWebhook failed:', (err as any)?.message || String(err)); }
  } catch (err) { console.warn('emitChangeWebhook error:', (err as any)?.message || String(err)); }
};

const scheduleArchiveMirrorAndWebhook = (baseModel: any, doc: any, context: TenantStorageContext | null | undefined) => {
  if (!doc) return;
  void (async () => {
    try { await mirrorToArchives(baseModel, doc, context); } catch (e) { console.warn('scheduleArchiveMirror error', (e as any)?.message || String(e)); }
    try { await emitChangeWebhook(baseModel?.modelName || baseModel, doc, context); } catch (e) { console.warn('scheduleWebhook error', (e as any)?.message || String(e)); }
  })();
};

export const getTenantStorageContext = () => tenantStorage.getStore() || null;
export const runWithTenantStorage = <T>(context: TenantStorageContext | null, callback: () => T, user?: any, institution?: any) => {
  const safeContext = context?.mongoUri ? { ...context, mongoUri: cleanMongoUri(context.mongoUri), archiveMongoUris: (context.archiveMongoUris || []).map(cleanMongoUri).filter(Boolean) } : context;
  return tenantStorage.run(safeContext?.mongoUri ? safeContext : null, () => {
    if (safeContext?.mongoUri && String(process.env.TENANT_MONGO_MIRROR_ENABLED || '').toLowerCase() === 'true') {
      mirrorContextReferences(safeContext, user, institution).catch((error) => console.warn('Tenant reference mirror failed:', error?.message || error));
    }
    return callback();
  });
};

export const resolveTenantStorageContext = (institution: any): TenantStorageContext | null => {
  const billing = institution?.billing || {};
  const settings = institution?.settings || {};
  const activeAcademicYear = Array.isArray(settings.academicYears) ? settings.academicYears.find((item: any) => item?.isActive || item?.year === settings.activeAcademicYear) : null;
  const usesEasySchoolStorage = billing.useEasySchoolStorage !== false;
  const directMongoUri = cleanMongoUri(settings.mongodbUri);
  const legacyMongoUrl = cleanMongoUri(settings.mongodbUrl);
  const mongoItems = Array.isArray(settings.mongodbUris) ? settings.mongodbUris : [];
  const normalized = mongoItems.map((it: any) => cleanMongoUri(it?.uri || it?.mongodbUrl)).filter(Boolean);
  if (directMongoUri && !normalized.includes(directMongoUri)) normalized.push(directMongoUri);
  if (legacyMongoUrl && !normalized.includes(legacyMongoUrl)) normalized.push(legacyMongoUrl);
  const activeItem = Array.isArray(settings.mongodbUris) ? settings.mongodbUris.find((i: any) => i?.isActive && cleanMongoUri(i?.uri || i?.mongodbUrl)) : null;
  const activeUri = activeItem ? cleanMongoUri(activeItem.uri || activeItem.mongodbUrl) : (directMongoUri || legacyMongoUrl || cleanMongoUri(activeAcademicYear?.mongodbUri));
  let primaryUri = '';
  const allowPersonalWhenNoStorage = Boolean(settings.allowPersonalMongo === true || settings.allowPersonalStorage === true);
  const hasPersonalConfigured = Boolean(activeUri || normalized.length);
  const billingAllowsStorage = billing && billing.billingStatus === 'active' && (Number(billing.storageAmount || 0) > 0);
  if (!usesEasySchoolStorage) primaryUri = activeUri || normalized[0] || '';
  else if (usesEasySchoolStorage && !billingAllowsStorage && hasPersonalConfigured && allowPersonalWhenNoStorage) primaryUri = activeUri || normalized[0] || '';
  primaryUri = cleanMongoUri(primaryUri);
  const archiveUris = normalized.filter((u: string) => u && u !== primaryUri);
  if (!primaryUri) return null;
  return { institutionId: String(institution?._id || institution?.id || ''), mongoUri: primaryUri, archiveMongoUris: archiveUris.length ? archiveUris : undefined };
};

export const installTenantStoragePatches = () => {
  if (patchesInstalled) return;
  patchesInstalled = true;
  const originalQueryExec = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = async function patchedTenantQueryExec(this: any, ...args: any[]) {
    const context = getTenantStorageContext();
    const primaryQuery = typeof this.clone === 'function' ? this.clone() : null;
    const shouldUseTenant = Boolean(cleanMongoUri(context?.mongoUri) && isPrimarySchoolModel(this.model));
    const op = String(this.op || '').toLowerCase();
    const readOps = ['find', 'findone', 'count', 'estimateddocumentcount', 'distinct', 'aggregate', 'countdocuments'];
    const forRead = readOps.some((o) => op.startsWith(o) || String(this.op).toLowerCase() === o) || this.op == null;
    const tenantModel = await getTenantModel(this.model, context, forRead);
    if (tenantModel) {
      this.model = tenantModel;
      this.mongooseCollection = tenantModel.collection;
      this._collection = tenantModel.collection;
      this.maxTimeMS(tenantQueryMaxTimeMs);
      const result = await withTimeout(originalQueryExec.apply(this, args as any), tenantQueryHardTimeoutMs, () => console.warn(`Tenant query timed out for ${tenantModel.modelName}. Primary fallback disabled.`));
      if (result !== null) return result;
      if (tenantStrictStorage) throw storageUnavailableError(tenantModel.modelName, `Tenant query timed out after ${tenantQueryHardTimeoutMs}ms`);
      if (primaryQuery) return originalQueryExec.apply(primaryQuery, args as any);
      throw storageUnavailableError(tenantModel.modelName);
    }
    if (shouldUseTenant && tenantStrictStorage) throw storageUnavailableError(this.model?.modelName || 'SchoolData', `Tenant model connection failed after ${tenantConnectionHardTimeoutMs}ms`);
    const result = await originalQueryExec.apply(this, args as any);
    const opName = String(this.op || '').toLowerCase();
    if (context && ['save', 'findoneandupdate', 'updateone', 'insertmany'].includes(opName)) scheduleArchiveMirrorAndWebhook(this.model, result, context);
    return result;
  };
};
