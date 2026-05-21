import { AsyncLocalStorage } from 'async_hooks';
import mongoose from 'mongoose';

export type TenantStorageContext = {
  institutionId: string;
  mongoUri?: string;
  imgbbApiKey?: string;
};

const schoolDataModels = new Set([
  'AdmissionApplication',
  'Attendance',
  'AuditLog',
  'BackupConfig',
  'Class',
  'Committee',
  'Document',
  'Exam',
  'Fee',
  'IDCard',
  'Message',
  'Notice',
  'Notification',
  'Parent',
  'Payment',
  'Result',
  'Salary',
  'Section',
  'SmsLog',
  'Staff',
  'Student',
  'Subject',
  'Teacher',
]);

const primaryMirrorModels = new Set(['User', 'Institution']);
const tenantStorage = new AsyncLocalStorage<TenantStorageContext | null>();
const tenantConnections = new Map<string, Promise<mongoose.Connection | null>>();
const tenantConnectionFailures = new Map<string, number>();
const tenantConnectionRetryMs = Number(process.env.TENANT_MONGO_RETRY_AFTER_MS || 60000);
const tenantConnectionHardTimeoutMs = Number(process.env.TENANT_MONGO_HARD_TIMEOUT_MS || 2500);
const tenantQueryMaxTimeMs = Number(process.env.TENANT_MONGO_QUERY_MAX_TIME_MS || 8000);
const tenantQueryHardTimeoutMs = Number(process.env.TENANT_MONGO_QUERY_HARD_TIMEOUT_MS || 2500);
const tenantStrictStorage = String(process.env.TENANT_MONGO_STRICT || 'true').toLowerCase() !== 'false';
let patchesInstalled = false;

const getDocumentObject = (doc: any) => {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject({ depopulate: true, versionKey: false });
  return doc;
};
const modelCollectionName = (model: any) => model?.collection?.name || model?.modelName;
const isPrimarySchoolModel = (model: any) => Boolean(model?.modelName && model?.db === mongoose.connection && schoolDataModels.has(model.modelName));
const storageUnavailableError = (modelName: string) => {
  const error: any = new Error(`School data storage unavailable for ${modelName}. Personal MongoDB is required; primary database fallback is disabled for school data.`);
  error.statusCode = 503;
  error.code = 'TENANT_STORAGE_UNAVAILABLE';
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
      serverSelectionTimeoutMS: Number(process.env.TENANT_MONGO_SERVER_SELECTION_TIMEOUT_MS || 3000),
      connectTimeoutMS: Number(process.env.TENANT_MONGO_CONNECT_TIMEOUT_MS || 3000),
      socketTimeoutMS: Number(process.env.TENANT_MONGO_SOCKET_TIMEOUT_MS || 15000),
      retryWrites: true,
    }).asPromise().then((connection) => {
      tenantConnectionFailures.delete(key);
      registerBridgeModels(connection);
      return connection;
    }).catch((error) => {
      tenantConnections.delete(key);
      tenantConnectionFailures.set(key, Date.now());
      console.warn('Tenant Mongo connection failed:', error?.message || error);
      return null;
    }));
  }
  const connection = await withTimeout(tenantConnections.get(key)!, tenantConnectionHardTimeoutMs, () => {
    tenantConnectionFailures.set(key, Date.now());
    console.warn('Tenant Mongo connection timed out. Primary fallback is disabled for school data.');
  });
  if (!connection) return null;
  return connection;
};

const getTenantModel = async (baseModel: any, context: TenantStorageContext | null | undefined) => {
  if (!context?.mongoUri || !baseModel?.modelName || !schoolDataModels.has(baseModel.modelName)) return null;
  if (baseModel.db !== mongoose.connection) return null;
  const connection = await getTenantConnection(context);
  if (!connection) return null;
  return registerModel(connection, baseModel);
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
  mirrorPrimaryDocument(baseModel, doc, context).catch((error) => console.warn('Tenant primary mirror failed:', error?.message || error));
};
const mirrorContextReferences = async (context: TenantStorageContext | null | undefined, user?: any, institution?: any) => {
  if (!context?.mongoUri) return;
  await Promise.all([
    user ? mirrorPrimaryDocument(mongoose.models.User, user, context) : Promise.resolve(),
    institution ? mirrorPrimaryDocument(mongoose.models.Institution, institution, context) : Promise.resolve(),
  ]);
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
  const activeAcademicYear = Array.isArray(settings.academicYears)
    ? settings.academicYears.find((item: any) => item?.isActive || item?.year === settings.activeAcademicYear)
    : null;
  const usesEasySchoolStorage = billing.useEasySchoolStorage !== false;
  const mongoUri = !usesEasySchoolStorage ? String(activeAcademicYear?.mongodbUri || settings.mongodbUri || '').trim() : '';
  const imgbbApiKey = !usesEasySchoolStorage ? String(activeAcademicYear?.imgbbApiKey || settings.imgbbApiKey || '').trim() : '';
  if (!mongoUri && !imgbbApiKey) return null;
  return { institutionId: String(institution?._id || institution?.id || ''), mongoUri: mongoUri || undefined, imgbbApiKey: imgbbApiKey || undefined };
};

export const installTenantStoragePatches = () => {
  if (patchesInstalled) return;
  patchesInstalled = true;

  const originalQueryExec = mongoose.Query.prototype.exec;
  mongoose.Query.prototype.exec = async function patchedTenantQueryExec(this: any, ...args: any[]) {
    const context = getTenantStorageContext();
    const primaryQuery = typeof this.clone === 'function' ? this.clone() : null;
    const shouldUseTenant = Boolean(context?.mongoUri && isPrimarySchoolModel(this.model));
    const tenantModel = await getTenantModel(this.model, context);
    if (tenantModel) {
      this.model = tenantModel;
      this.mongooseCollection = tenantModel.collection;
      this._collection = tenantModel.collection;
      this.maxTimeMS(tenantQueryMaxTimeMs);
      const result = await withTimeout(originalQueryExec.apply(this, args as any), tenantQueryHardTimeoutMs, () => {
        if (context?.institutionId) tenantConnectionFailures.set(`${context.institutionId}:${context.mongoUri}`, Date.now());
        console.warn(`Tenant query timed out for ${tenantModel.modelName}. Primary fallback disabled.`);
      });
      if (result !== null) return result;
      if (tenantStrictStorage) throw storageUnavailableError(tenantModel.modelName);
      if (primaryQuery) return originalQueryExec.apply(primaryQuery, args as any);
      throw storageUnavailableError(tenantModel.modelName);
    }
    if (shouldUseTenant && tenantStrictStorage) throw storageUnavailableError(this.model?.modelName || 'SchoolData');
    const result = await originalQueryExec.apply(this, args as any);
    if (!tenantModel && context?.mongoUri && this.model?.db === mongoose.connection && this.model?.modelName && primaryMirrorModels.has(this.model.modelName)) schedulePrimaryMirror(this.model, result, context);
    return result;
  };

  const originalAggregateExec = mongoose.Aggregate.prototype.exec;
  mongoose.Aggregate.prototype.exec = async function patchedTenantAggregateExec(this: any, ...args: any[]) {
    const context = getTenantStorageContext();
    const primaryAggregate = typeof this.model === 'function' && this._model ? this._model.aggregate(this.pipeline()) : null;
    const shouldUseTenant = Boolean(context?.mongoUri && isPrimarySchoolModel(this._model));
    const tenantModel = await getTenantModel(this._model, context);
    if (tenantModel) {
      this._model = tenantModel;
      this.option({ maxTimeMS: tenantQueryMaxTimeMs });
      const result = await withTimeout(originalAggregateExec.apply(this, args as any), tenantQueryHardTimeoutMs, () => {
        if (context?.institutionId) tenantConnectionFailures.set(`${context.institutionId}:${context.mongoUri}`, Date.now());
        console.warn(`Tenant aggregate timed out for ${tenantModel.modelName}. Primary fallback disabled.`);
      });
      if (result !== null) return result;
      if (tenantStrictStorage) throw storageUnavailableError(tenantModel.modelName);
      if (primaryAggregate) return originalAggregateExec.apply(primaryAggregate, args as any);
      throw storageUnavailableError(tenantModel.modelName);
    }
    if (shouldUseTenant && tenantStrictStorage) throw storageUnavailableError(this._model?.modelName || 'SchoolData');
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
    if (shouldUseTenant && tenantStrictStorage) throw storageUnavailableError(this.constructor?.modelName || 'SchoolData');
    const saved = await originalSave.apply(this, args as any);
    if (context?.mongoUri && this.constructor?.db === mongoose.connection && primaryMirrorModels.has(this.constructor?.modelName)) schedulePrimaryMirror(this.constructor, saved, context);
    return saved;
  };
};

installTenantStoragePatches();
