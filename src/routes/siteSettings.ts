import express from 'express';
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

router.use(authenticate);

router.get('/site-config', authorize('head'), async (req: any, res) => {
  try {
    const setting = await SiteSetting.findOne({ key: SITE_CONFIG_KEY }).lean();
    res.json({ config: maskSecrets(setting?.value || {}), hasMongoUrl: Boolean(setting?.value?.mongodbUrl), hasImgbbKey: Boolean(setting?.value?.imgbbApiKey) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load site config', error });
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
