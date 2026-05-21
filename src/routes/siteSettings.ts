import express from 'express';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../middleware/auth';
import SiteSetting from '../models/SiteSetting';

const router = express.Router();

const SITE_CONFIG_KEY = 'site_config';
const APP_CONTROL_KEY = 'app_control_settings';

const maskSecrets = (config: any = {}) => ({
  ...config,
  mongodbUrl: config.mongodbUrl ? '********' : '',
  imgbbApiKey: config.imgbbApiKey ? '********' : '',
});

const testMongoConnection = async (mongodbUrl?: string) => {
  if (!mongodbUrl) return { connected: false, status: 'missing', message: 'MongoDB URL not saved.' };
  let connection: mongoose.Connection | null = null;
  try {
    connection = await mongoose.createConnection(mongodbUrl, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 1,
    }).asPromise();
    await connection.db.admin().ping();
    return { connected: true, status: 'connected', message: 'MongoDB connected successfully.' };
  } catch (error: any) {
    return { connected: false, status: 'error', message: error?.message || 'MongoDB connection failed.' };
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
};

router.use(authenticate);

router.get('/site-config', authorize('head'), async (req: any, res) => {
  try {
    const setting = await SiteSetting.findOne({ key: SITE_CONFIG_KEY }).lean();
    res.json({ config: maskSecrets(setting?.value || {}), hasMongoUrl: Boolean(setting?.value?.mongodbUrl), hasImgbbKey: Boolean(setting?.value?.imgbbApiKey) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load site config', error });
  }
});

router.get('/storage-status', authorize('head'), async (req: any, res) => {
  try {
    const setting = await SiteSetting.findOne({ key: SITE_CONFIG_KEY }).lean();
    const value = setting?.value || {};
    const primaryMongo = {
      connected: mongoose.connection.readyState === 1,
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      readyState: mongoose.connection.readyState,
      message: mongoose.connection.readyState === 1 ? 'Primary server MongoDB connected.' : 'Primary server MongoDB disconnected.',
    };
    const configuredMongo = await testMongoConnection(value.mongodbUrl);
    res.json({
      primaryMongo,
      configuredMongo,
      imgbb: {
        connected: Boolean(value.imgbbApiKey),
        status: value.imgbbApiKey ? 'configured' : 'missing',
        message: value.imgbbApiKey ? 'ImgBB API key saved.' : 'ImgBB API key not saved.',
      },
      hasMongoUrl: Boolean(value.mongodbUrl),
      hasImgbbKey: Boolean(value.imgbbApiKey),
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
    const next = {
      ...current,
      siteName: req.body.siteName ?? current.siteName ?? 'Easy School',
      appBaseUrl: req.body.appBaseUrl ?? current.appBaseUrl ?? '',
      apiBaseUrl: req.body.apiBaseUrl ?? current.apiBaseUrl ?? '',
      mongodbUrl: req.body.mongodbUrl && !String(req.body.mongodbUrl).includes('********') ? req.body.mongodbUrl : current.mongodbUrl || '',
      imgbbApiKey: req.body.imgbbApiKey && !String(req.body.imgbbApiKey).includes('********') ? req.body.imgbbApiKey : current.imgbbApiKey || '',
      imgbbUploadUrl: req.body.imgbbUploadUrl ?? current.imgbbUploadUrl ?? 'https://api.imgbb.com/1/upload',
    };

    const setting = await SiteSetting.findOneAndUpdate(
      { key: SITE_CONFIG_KEY },
      { value: next, isSecret: true, updatedBy: req.user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ config: maskSecrets(setting.value || {}), hasMongoUrl: Boolean(next.mongodbUrl), hasImgbbKey: Boolean(next.imgbbApiKey), message: 'Site config saved to MongoDB.' });
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