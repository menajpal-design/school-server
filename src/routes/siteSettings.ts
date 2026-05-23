import express from 'express';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../middleware/auth';
import SiteSetting from '../models/SiteSetting';

const router = express.Router();

const SITE_CONFIG_KEY = 'site_config';
const APP_CONTROL_KEY = 'app_control_settings';
const MONGO_WARNING_MB = 475;
const IMGBB_WARNING_MB = 1950;

const nowIso = () => new Date().toISOString();
const maskValue = (value?: string) => value ? '********' : '';
const shortSecret = (value?: string) => {
  if (!value) return '';
  if (value.length <= 10) return '********';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const normalizeMongoItems = (config: any = {}) => {
  const existing = Array.isArray(config.mongodbUris) ? config.mongodbUris : [];
  const items = existing.map((item: any, index: number) => ({
    id: item.id || `mongo-${index + 1}`,
    label: item.label || `MongoDB ${index + 1}`,
    uri: item.uri || item.mongodbUrl || '',
    addedAt: item.addedAt || config.createdAt || nowIso(),
    isActive: item.isActive === true,
    usedMb: Number(item.usedMb || 0),
    note: item.note || '',
  })).filter((item: any) => item.uri);

  if (config.mongodbUrl && !items.some((item: any) => item.uri === config.mongodbUrl)) {
    items.push({
      id: `mongo-${items.length + 1}`,
      label: 'MongoDB 1',
      uri: config.mongodbUrl,
      addedAt: config.createdAt || nowIso(),
      isActive: true,
      usedMb: Number(config.mongodbUsedMb || 0),
      note: 'Imported from previous MongoDB URL field.',
    });
  }

  if (items.length && !items.some((item: any) => item.isActive)) {
    items[items.length - 1].isActive = true;
  }

  return items.map((item: any) => ({ ...item, warning: Number(item.usedMb || 0) >= MONGO_WARNING_MB }));
};

const normalizeImgbbItems = (config: any = {}) => {
  const existing = Array.isArray(config.imgbbKeys) ? config.imgbbKeys : [];
  const items = existing.map((item: any, index: number) => ({
    id: item.id || `imgbb-${index + 1}`,
    label: item.label || `ImgBB ${index + 1}`,
    apiKey: item.apiKey || item.key || '',
    addedAt: item.addedAt || config.createdAt || nowIso(),
    isActive: item.isActive === true,
    usedMb: Number(item.usedMb || 0),
    note: item.note || '',
  })).filter((item: any) => item.apiKey);

  if (config.imgbbApiKey && !items.some((item: any) => item.apiKey === config.imgbbApiKey)) {
    items.push({
      id: `imgbb-${items.length + 1}`,
      label: 'ImgBB 1',
      apiKey: config.imgbbApiKey,
      addedAt: config.createdAt || nowIso(),
      isActive: true,
      usedMb: Number(config.imgbbUsedMb || 0),
      note: 'Imported from previous ImgBB API key field.',
    });
  }

  if (items.length && !items.some((item: any) => item.isActive)) {
    items[items.length - 1].isActive = true;
  }

  return items.map((item: any) => ({ ...item, warning: Number(item.usedMb || 0) >= IMGBB_WARNING_MB }));
};

const sanitizeConfigForSave = (body: any = {}, current: any = {}) => {
  const currentMongoItems = normalizeMongoItems(current);
  const currentImgbbItems = normalizeImgbbItems(current);
  const nextMongoItems = [...currentMongoItems];
  const nextImgbbItems = [...currentImgbbItems];

  const newMongoUrl = body.mongodbUrl && !String(body.mongodbUrl).includes('********') ? String(body.mongodbUrl).trim() : '';
  if (newMongoUrl && !nextMongoItems.some((item) => item.uri === newMongoUrl)) {
    nextMongoItems.forEach((item) => { item.isActive = false; });
    nextMongoItems.push({
      id: `mongo-${Date.now()}`,
      label: body.mongodbLabel || `MongoDB ${nextMongoItems.length + 1}`,
      uri: newMongoUrl,
      addedAt: nowIso(),
      isActive: true,
      usedMb: Number(body.mongodbUsedMb || 0),
      note: body.mongodbNote || 'Added from settings. Old MongoDB URI kept for old data.',
      warning: Number(body.mongodbUsedMb || 0) >= MONGO_WARNING_MB,
    });
  } else if (body.activeMongoId) {
    nextMongoItems.forEach((item) => { item.isActive = item.id === body.activeMongoId; });
  }

  const newImgbbKey = body.imgbbApiKey && !String(body.imgbbApiKey).includes('********') ? String(body.imgbbApiKey).trim() : '';
  if (newImgbbKey && !nextImgbbItems.some((item) => item.apiKey === newImgbbKey)) {
    nextImgbbItems.forEach((item) => { item.isActive = false; });
    nextImgbbItems.push({
      id: `imgbb-${Date.now()}`,
      label: body.imgbbLabel || `ImgBB ${nextImgbbItems.length + 1}`,
      apiKey: newImgbbKey,
      addedAt: nowIso(),
      isActive: true,
      usedMb: Number(body.imgbbUsedMb || 0),
      note: body.imgbbNote || 'Added from settings. Old ImgBB key kept for old files.',
      warning: Number(body.imgbbUsedMb || 0) >= IMGBB_WARNING_MB,
    });
  } else if (body.activeImgbbId) {
    nextImgbbItems.forEach((item) => { item.isActive = item.id === body.activeImgbbId; });
  }

  const activeMongo = nextMongoItems.find((item) => item.isActive) || nextMongoItems[nextMongoItems.length - 1];
  const activeImgbb = nextImgbbItems.find((item) => item.isActive) || nextImgbbItems[nextImgbbItems.length - 1];

  return {
    ...current,
    siteName: body.siteName ?? current.siteName ?? 'Easy School',
    appBaseUrl: body.appBaseUrl ?? current.appBaseUrl ?? '',
    apiBaseUrl: body.apiBaseUrl ?? current.apiBaseUrl ?? '',
    imgbbUploadUrl: body.imgbbUploadUrl ?? current.imgbbUploadUrl ?? 'https://api.imgbb.com/1/upload',
    mongodbUris: nextMongoItems,
    imgbbKeys: nextImgbbItems,
    mongodbUrl: activeMongo?.uri || current.mongodbUrl || '',
    imgbbApiKey: activeImgbb?.apiKey || current.imgbbApiKey || '',
    mongodbUsedMb: Number(body.mongodbUsedMb ?? activeMongo?.usedMb ?? current.mongodbUsedMb ?? 0),
    imgbbUsedMb: Number(body.imgbbUsedMb ?? activeImgbb?.usedMb ?? current.imgbbUsedMb ?? 0),
    // allow personal Mongo fallback when central storage billing not available
    allowPersonalMongo: body.allowPersonalMongo ?? current.allowPersonalMongo ?? false,
    allowPersonalStorage: body.allowPersonalStorage ?? current.allowPersonalStorage ?? false,
  };
};

const maskHistoryConfig = (config: any = {}) => {
  const mongodbUris = normalizeMongoItems(config);
  const imgbbKeys = normalizeImgbbItems(config);
  return {
    ...config,
    mongodbUrl: maskValue(config.mongodbUrl),
    imgbbApiKey: maskValue(config.imgbbApiKey),
    mongodbUris: mongodbUris.map((item: any) => ({
      id: item.id,
      label: item.label,
      uri: shortSecret(item.uri),
      addedAt: item.addedAt,
      isActive: item.isActive,
      usedMb: Number(item.usedMb || 0),
      warning: Number(item.usedMb || 0) >= MONGO_WARNING_MB,
      note: item.note || '',
    })),
    imgbbKeys: imgbbKeys.map((item: any) => ({
      id: item.id,
      label: item.label,
      apiKey: shortSecret(item.apiKey),
      addedAt: item.addedAt,
      isActive: item.isActive,
      usedMb: Number(item.usedMb || 0),
      warning: Number(item.usedMb || 0) >= IMGBB_WARNING_MB,
      note: item.note || '',
    })),
  };
};

const testMongoConnection = async (mongodbUrl?: string) => {
  if (!mongodbUrl) return { connected: false, status: 'missing', message: 'MongoDB URL not saved.', usedMb: 0, warning: false };
  let connection: mongoose.Connection | null = null;
  try {
    connection = await mongoose.createConnection(mongodbUrl, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 1,
    }).asPromise();
    await connection.db.admin().ping();
    let usedMb = 0;
    try {
      const stats: any = await connection.db.stats();
      usedMb = Math.round(Number(stats.storageSize || stats.dataSize || 0) / 1024 / 1024);
    } catch (_) {
      usedMb = 0;
    }
    return {
      connected: true,
      status: 'connected',
      usedMb,
      warning: usedMb >= MONGO_WARNING_MB,
      warningAtMb: MONGO_WARNING_MB,
      message: usedMb >= MONGO_WARNING_MB ? `MongoDB data is ${usedMb}MB. Storage is low, add a new MongoDB URI.` : `MongoDB connected successfully. Used ${usedMb}MB.`,
    };
  } catch (error: any) {
    return { connected: false, status: 'error', usedMb: 0, warning: false, warningAtMb: MONGO_WARNING_MB, message: error?.message || 'MongoDB connection failed.' };
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
};

router.use(authenticate);

router.get('/site-config', authorize('head'), async (req: any, res) => {
  try {
    const setting = await SiteSetting.findOne({ key: SITE_CONFIG_KEY }).lean();
    const value = setting?.value || {};
    res.json({
      config: maskHistoryConfig(value),
      hasMongoUrl: Boolean(value.mongodbUrl || normalizeMongoItems(value).length),
      hasImgbbKey: Boolean(value.imgbbApiKey || normalizeImgbbItems(value).length),
      warningLimits: { mongoMb: MONGO_WARNING_MB, imgbbMb: IMGBB_WARNING_MB },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load site config', error });
  }
});

router.get('/storage-status', authorize('head'), async (req: any, res) => {
  try {
    const setting = await SiteSetting.findOne({ key: SITE_CONFIG_KEY }).lean();
    const value = setting?.value || {};
    const mongoItems = normalizeMongoItems(value);
    const imgbbItems = normalizeImgbbItems(value);
    const activeMongo = mongoItems.find((item: any) => item.isActive) || mongoItems[mongoItems.length - 1];
    const activeImgbb = imgbbItems.find((item: any) => item.isActive) || imgbbItems[imgbbItems.length - 1];

    const primaryMongo = {
      connected: mongoose.connection.readyState === 1,
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      readyState: mongoose.connection.readyState,
      message: mongoose.connection.readyState === 1 ? 'Primary server MongoDB connected.' : 'Primary server MongoDB disconnected.',
    };
    const configuredMongo = await testMongoConnection(activeMongo?.uri || value.mongodbUrl);
    res.json({
      primaryMongo,
      configuredMongo,
      mongodbUris: mongoItems.map((item: any) => ({
        id: item.id,
        label: item.label,
        uri: shortSecret(item.uri),
        isActive: item.isActive,
        addedAt: item.addedAt,
        usedMb: item.id === activeMongo?.id && configuredMongo.connected ? configuredMongo.usedMb : Number(item.usedMb || 0),
        warning: item.id === activeMongo?.id && configuredMongo.connected ? configuredMongo.warning : Number(item.usedMb || 0) >= MONGO_WARNING_MB,
        note: item.note || '',
      })),
      imgbb: {
        connected: Boolean(activeImgbb?.apiKey || value.imgbbApiKey),
        status: activeImgbb?.apiKey || value.imgbbApiKey ? 'configured' : 'missing',
        usedMb: Number(activeImgbb?.usedMb || value.imgbbUsedMb || 0),
        warning: Number(activeImgbb?.usedMb || value.imgbbUsedMb || 0) >= IMGBB_WARNING_MB,
        warningAtMb: IMGBB_WARNING_MB,
        message: Number(activeImgbb?.usedMb || value.imgbbUsedMb || 0) >= IMGBB_WARNING_MB
          ? `ImgBB usage is ${Number(activeImgbb?.usedMb || value.imgbbUsedMb || 0)}MB. Storage is low, add a new ImgBB key.`
          : (activeImgbb?.apiKey || value.imgbbApiKey ? 'ImgBB API key saved.' : 'ImgBB API key not saved.'),
      },
      imgbbKeys: imgbbItems.map((item: any) => ({
        id: item.id,
        label: item.label,
        apiKey: shortSecret(item.apiKey),
        isActive: item.isActive,
        addedAt: item.addedAt,
        usedMb: Number(item.usedMb || 0),
        warning: Number(item.usedMb || 0) >= IMGBB_WARNING_MB,
        note: item.note || '',
      })),
      hasMongoUrl: Boolean(activeMongo?.uri || value.mongodbUrl),
      hasImgbbKey: Boolean(activeImgbb?.apiKey || value.imgbbApiKey),
      warningLimits: { mongoMb: MONGO_WARNING_MB, imgbbMb: IMGBB_WARNING_MB },
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to check storage status', error });
  }
});

router.put('/site-config', authorize('head'), async (req: any, res) => {
  try {
    const existing = await SiteSetting.findOne({ key: SITE_CONFIG_KEY });
    const current = existing?.value || {};
    const next = sanitizeConfigForSave(req.body, current);

    const setting = await SiteSetting.findOneAndUpdate(
      { key: SITE_CONFIG_KEY },
      { value: next, isSecret: true, updatedBy: req.user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({
      config: maskHistoryConfig(setting.value || {}),
      hasMongoUrl: Boolean(next.mongodbUrl || normalizeMongoItems(next).length),
      hasImgbbKey: Boolean(next.imgbbApiKey || normalizeImgbbItems(next).length),
      warningLimits: { mongoMb: MONGO_WARNING_MB, imgbbMb: IMGBB_WARNING_MB },
      message: 'Site config saved to MongoDB. Old MongoDB URI and ImgBB key were kept in history.',
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save site config', error });
  }
});

router.get('/app-controls', authorize('head'), async (req: any, res) => {
  try {
    const setting = await SiteSetting.findOne({ key: APP_CONTROL_KEY }).lean();
    res.json({ settings: setting?.value || {} });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load app controls', error });
  }
});

router.put('/app-controls', authorize('head'), async (req: any, res) => {
  try {
    const setting = await SiteSetting.findOneAndUpdate(
      { key: APP_CONTROL_KEY },
      { value: req.body || {}, isSecret: false, updatedBy: req.user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ settings: setting.value || {}, message: 'App control settings saved to MongoDB.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save app controls', error });
  }
});

export default router;