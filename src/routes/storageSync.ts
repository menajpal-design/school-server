import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import SiteSetting from '../models/SiteSetting';
import Institution from '../models/Institution';

const router = express.Router();

const getActiveMongo = (value: any = {}) => {
  const items = Array.isArray(value.mongodbUris) ? value.mongodbUris : [];
  const active = items.find((item: any) => item?.isActive) || items[items.length - 1];
  return String(active?.uri || value.mongodbUrl || '').trim();
};

const getActiveImgbb = (value: any = {}) => {
  const items = Array.isArray(value.imgbbKeys) ? value.imgbbKeys : [];
  const active = items.find((item: any) => item?.isActive) || items[items.length - 1];
  return String(active?.apiKey || value.imgbbApiKey || '').trim();
};

router.post('/apply-to-institution', authenticate, authorize('head'), async (req: any, res) => {
  try {
    const setting: any = await SiteSetting.findOne({ key: 'site_config' }).lean();
    const value = setting?.value || {};
    const mongodbUri = String(req.body?.mongodbUri || getActiveMongo(value)).trim();
    const imgbbApiKey = String(req.body?.imgbbApiKey || getActiveImgbb(value)).trim();

    if (!mongodbUri) {
      return res.status(400).json({ message: 'MongoDB URI missing. Save MongoDB URI in settings first.' });
    }

    const institution = await Institution.findByIdAndUpdate(
      req.user.institutionId,
      {
        $set: {
          'settings.mongodbUri': mongodbUri,
          'settings.imgbbApiKey': imgbbApiKey,
          'billing.useEasySchoolStorage': false,
        },
      },
      { new: true }
    ).select('name settings billing');

    if (!institution) return res.status(404).json({ message: 'Institution not found.' });

    res.json({
      message: 'Storage config applied to institution. School data will use own MongoDB.',
      institution,
      hasMongoUrl: Boolean(mongodbUri),
      hasImgbbKey: Boolean(imgbbApiKey),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to apply storage config to institution.', error });
  }
});

export default router;
