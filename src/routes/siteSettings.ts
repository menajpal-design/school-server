import express from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth';
import SiteSetting from '../models/SiteSetting';
import SettingsAuditLog from '../models/SettingsAuditLog';

const router = express.Router();
const SITE_CONFIG_KEY = 'site_config';
const APP_CONTROL_KEY = 'app_control_settings';
const MONGO_WARNING_MB = 475;
const allowedRoles = ['admin', 'super_admin', 'head'];
const secretKeyPattern = /(password|pass|secret|token|api[_-]?key|apikey|key|uri|url|mongodb|mongo|imgbb|sms|email_pass|access[_-]?token|refresh[_-]?token)/i;
const nonSecretUrlKeys = new Set(['appBaseUrl', 'apiBaseUrl', 'website', 'frontendUrl']);

const nowIso = () => new Date().toISOString();
const maskValue = (value?: string) => (value ? '********' : '');
const shortSecret = (value?: string) => {
  if (!value) return '';
  if (value.length <= 10) return '********';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};
const scopedQuery = (req: any, key: string) => ({ key, institutionId: req.user.institutionId });
const settingsGuard = (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: 'Access denied. Site settings are restricted to Head/Admin only.' });
  return next();
};
const audit = async (req: any, settingKey: string, action: 'read' | 'update', changedFields: string[] = []) => {
  try {
    if (action === 'read') return;
    await SettingsAuditLog.create({ settingKey, action, changedBy: req.user._id, institutionId: req.user.institutionId, role: req.user.role, changedFields });
  } catch (error) {
    console.warn('Settings audit log failed:', (error as any)?.message || error);
  }
};
const changedFields = (body: any = {}) => Object.keys(body || {}).filter((key) => key !== '_id');
const isMasked = (value: any) => typeof value === 'string' && /^\*{4,}$/.test(value);

const maskRecursive = (value: any, keyName = ''): any => {
  if (Array.isArray(value)) return value.map((item) => maskRecursive(item, keyName));
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && secretKeyPattern.test(keyName) && !nonSecretUrlKeys.has(keyName)) return shortSecret(value);
    return value;
  }
  return Object.entries(value).reduce((acc: any, [key, item]) => {
    if (secretKeyPattern.test(key) && !nonSecretUrlKeys.has(key)) acc[key] = typeof item === 'string' ? shortSecret(item) : maskRecursive(item, key);
    else acc[key] = maskRecursive(item, key);
    return acc;
  }, {});
};

const mergePreservingMaskedSecrets = (incoming: any = {}, current: any = {}) => {
  if (Array.isArray(incoming)) return incoming.map((item, index) => mergePreservingMaskedSecrets(item, current?.[index] || {}));
  if (!incoming || typeof incoming !== 'object') return isMasked(incoming) ? current : incoming;
  const output: any = { ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (isMasked(value)) output[key] = current?.[key];
    else if (value && typeof value === 'object') output[key] = mergePreservingMaskedSecrets(value, current?.[key]);
    else output[key] = value;
  }
  return output;
};

const normalizeMongoItems = (config: any = {}) => {
  const existing = Array.isArray(config.mongodbUris) ? config.mongodbUris : [];
  const items = existing.map((item: any, index: number) => ({ id: item.id || `mongo-${index + 1}`, label: item.label || `MongoDB ${index + 1}`, uri: item.uri || item.mongodbUrl || '', addedAt: item.addedAt || config.createdAt || nowIso(), isActive: item.isActive === true, usedMb: Number(item.usedMb || 0), note: item.note || '' })).filter((item: any) => item.uri);
  if (config.mongodbUrl && !items.some((item: any) => item.uri === config.mongodbUrl)) items.push({ id: `mongo-${items.length + 1}`, label: 'MongoDB 1', uri: config.mongodbUrl, addedAt: config.createdAt || nowIso(), isActive: true, usedMb: Number(config.mongodbUsedMb || 0), note: 'Imported from previous MongoDB URL field.' });
  if (items.length && !items.some((item: any) => item.isActive)) items[items.length - 1].isActive = true;
  return items.map((item: any) => ({ ...item, warning: Number(item.usedMb || 0) >= MONGO_WARNING_MB }));
};

const sanitizeConfigForSave = (body: any = {}, current: any = {}) => {
  const safeBody = mergePreservingMaskedSecrets(body, current);
  const currentMongoItems = normalizeMongoItems(current);
  const nextMongoItems = [...currentMongoItems];
  const newMongoUrl = safeBody.mongodbUrl && !String(safeBody.mongodbUrl).includes('********') ? String(safeBody.mongodbUrl).trim() : '';
  if (newMongoUrl && !nextMongoItems.some((item) => item.uri === newMongoUrl)) {
    nextMongoItems.forEach((item) => { item.isActive = false; });
    nextMongoItems.push({ id: `mongo-${Date.now()}`, label: safeBody.mongodbLabel || `MongoDB ${nextMongoItems.length + 1}`, uri: newMongoUrl, addedAt: nowIso(), isActive: true, usedMb: Number(safeBody.mongodbUsedMb || 0), note: safeBody.mongodbNote || 'Added from settings. Old MongoDB URI kept for old data.', warning: Number(safeBody.mongodbUsedMb || 0) >= MONGO_WARNING_MB });
  } else if (safeBody.activeMongoId) {
    nextMongoItems.forEach((item) => { item.isActive = item.id === safeBody.activeMongoId; });
  }
  const activeMongo = nextMongoItems.find((item) => item.isActive) || nextMongoItems[nextMongoItems.length - 1];
  return { ...current, siteName: safeBody.siteName ?? current.siteName ?? 'Easy School', appBaseUrl: safeBody.appBaseUrl ?? current.appBaseUrl ?? '', apiBaseUrl: safeBody.apiBaseUrl ?? current.apiBaseUrl ?? '', mongodbUris: nextMongoItems, mongodbUrl: activeMongo?.uri || current.mongodbUrl || '', mongodbUsedMb: Number(safeBody.mongodbUsedMb ?? activeMongo?.usedMb ?? current.mongodbUsedMb ?? 0), allowPersonalMongo: safeBody.allowPersonalMongo ?? current.allowPersonalMongo ?? false, allowPersonalStorage: safeBody.allowPersonalStorage ?? current.allowPersonalStorage ?? false, imgbbApiKey: safeBody.imgbbApiKey ?? current.imgbbApiKey, smsApiKey: safeBody.smsApiKey ?? current.smsApiKey, smsPassword: safeBody.smsPassword ?? current.smsPassword, smsToken: safeBody.smsToken ?? current.smsToken };
};

const maskHistoryConfig = (config: any = {}) => {
  const mongodbUris = normalizeMongoItems(config);
  return maskRecursive({ ...config, mongodbUrl: maskValue(config.mongodbUrl), mongodbUris: mongodbUris.map((item: any) => ({ id: item.id, label: item.label, uri: shortSecret(item.uri), addedAt: item.addedAt, isActive: item.isActive, usedMb: Number(item.usedMb || 0), warning: Number(item.usedMb || 0) >= MONGO_WARNING_MB, note: item.note || '' })) });
};

const testMongoConnection = async (mongodbUrl?: string) => {
  if (!mongodbUrl) return { connected: false, status: 'missing', message: 'MongoDB URL not saved.', usedMb: 0, warning: false, warningAtMb: MONGO_WARNING_MB };
  let connection: mongoose.Connection | null = null;
  try {
    connection = await mongoose.createConnection(mongodbUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, maxPoolSize: 1 }).asPromise();
    await connection.db.admin().ping();
    let usedMb = 0;
    try { const stats: any = await connection.db.stats(); usedMb = Math.round(Number(stats.storageSize || stats.dataSize || 0) / 1024 / 1024); } catch (_) { usedMb = 0; }
    return { connected: true, status: 'connected', usedMb, warning: usedMb >= MONGO_WARNING_MB, warningAtMb: MONGO_WARNING_MB, message: usedMb >= MONGO_WARNING_MB ? `MongoDB data is ${usedMb}MB. Storage is low, add a new MongoDB URI.` : `MongoDB connected successfully. Used ${usedMb}MB.` };
  } catch (error: any) {
    return { connected: false, status: 'error', usedMb: 0, warning: false, warningAtMb: MONGO_WARNING_MB, message: error?.message || 'MongoDB connection failed.' };
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
};

router.use(authenticate);
router.use(settingsGuard);

router.get('/site-config', async (req: any, res) => {
  try {
    const setting = await SiteSetting.findOne(scopedQuery(req, SITE_CONFIG_KEY)).lean();
    const value = setting?.value || {};
    res.json({ config: maskHistoryConfig(value), hasMongoUrl: Boolean(value.mongodbUrl || normalizeMongoItems(value).length), warningLimits: { mongoMb: MONGO_WARNING_MB } });
  } catch (error) { res.status(500).json({ message: 'Failed to load site config', error }); }
});

router.get('/storage-status', async (req: any, res) => {
  try {
    const setting = await SiteSetting.findOne(scopedQuery(req, SITE_CONFIG_KEY)).lean();
    const value = setting?.value || {};
    const mongoItems = normalizeMongoItems(value);
    const activeMongo = mongoItems.find((item: any) => item.isActive) || mongoItems[mongoItems.length - 1];
    const primaryMongo = { connected: mongoose.connection.readyState === 1, status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', readyState: mongoose.connection.readyState, message: mongoose.connection.readyState === 1 ? 'Primary server MongoDB connected.' : 'Primary server MongoDB disconnected.' };
    const configuredMongo = await testMongoConnection(activeMongo?.uri || value.mongodbUrl);
    res.json({ primaryMongo, configuredMongo, mongodbUris: mongoItems.map((item: any) => ({ id: item.id, label: item.label, uri: shortSecret(item.uri), isActive: item.isActive, addedAt: item.addedAt, usedMb: item.id === activeMongo?.id && configuredMongo.connected ? configuredMongo.usedMb : Number(item.usedMb || 0), warning: item.id === activeMongo?.id && configuredMongo.connected ? configuredMongo.warning : Number(item.usedMb || 0) >= MONGO_WARNING_MB, note: item.note || '' })), hasMongoUrl: Boolean(activeMongo?.uri || value.mongodbUrl), warningLimits: { mongoMb: MONGO_WARNING_MB }, checkedAt: new Date().toISOString() });
  } catch (error) { res.status(500).json({ message: 'Failed to check storage status', error }); }
});

router.put('/site-config', async (req: any, res) => {
  try {
    const existing = await SiteSetting.findOne(scopedQuery(req, SITE_CONFIG_KEY));
    const current = existing?.value || {};
    const next = sanitizeConfigForSave(req.body, current);
    const setting = await SiteSetting.findOneAndUpdate(scopedQuery(req, SITE_CONFIG_KEY), { value: next, isSecret: true, institutionId: req.user.institutionId, updatedBy: req.user._id }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await audit(req, SITE_CONFIG_KEY, 'update', changedFields(req.body));
    res.json({ config: maskHistoryConfig(setting.value || {}), hasMongoUrl: Boolean(next.mongodbUrl || normalizeMongoItems(next).length), warningLimits: { mongoMb: MONGO_WARNING_MB }, message: 'Site config saved securely. Secrets are masked in responses.' });
  } catch (error) { res.status(500).json({ message: 'Failed to save site config', error }); }
});

router.get('/app-controls', async (req: any, res) => {
  try {
    const setting = await SiteSetting.findOne(scopedQuery(req, APP_CONTROL_KEY)).lean();
    res.json({ settings: maskRecursive(setting?.value || {}) });
  } catch (error) { res.status(500).json({ message: 'Failed to load app controls', error }); }
});

router.put('/app-controls', async (req: any, res) => {
  try {
    const existing = await SiteSetting.findOne(scopedQuery(req, APP_CONTROL_KEY));
    const current = existing?.value || {};
    const next = mergePreservingMaskedSecrets(req.body || {}, current);
    const setting = await SiteSetting.findOneAndUpdate(scopedQuery(req, APP_CONTROL_KEY), { value: next, isSecret: false, institutionId: req.user.institutionId, updatedBy: req.user._id }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await audit(req, APP_CONTROL_KEY, 'update', changedFields(req.body));
    res.json({ settings: maskRecursive(setting.value || {}), message: 'App control settings saved securely.' });
  } catch (error) { res.status(500).json({ message: 'Failed to save app controls', error }); }
});

export default router;
