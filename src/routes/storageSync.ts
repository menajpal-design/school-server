import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import SiteSetting from '../models/SiteSetting';
import Institution from '../models/Institution';
import User from '../models/User';
import { resolveTenantStorageContext, runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();

const getActiveMongo = (value: any = {}) => {
  const items = Array.isArray(value.mongodbUris) ? value.mongodbUris : [];
  const active = items.find((item: any) => item?.isActive) || items[items.length - 1];
  return String(active?.uri || value.mongodbUrl || '').trim();
};

const syncInstitutionToTenant = async (institution: any, tenantContext: any) => {
  if (!tenantContext?.mongoUri || !institution?._id) return;

  const payload = typeof institution.toObject === 'function'
    ? institution.toObject({ depopulate: true, versionKey: false })
    : institution;

  await runWithTenantStorage(tenantContext, async () => {
    await Institution.findOneAndUpdate(
      { _id: payload._id },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).maxTimeMS(5000).exec();
  });
};

const syncUsersToTenant = async (institutionId: string, tenantContext: any) => {
  if (!tenantContext?.mongoUri || !institutionId) return 0;

  const users = await User.find({ institutionId }).lean().maxTimeMS(5000);
  let migrated = 0;

  await runWithTenantStorage(tenantContext, async () => {
    for (const user of users) {
      const payload = {
        ...user,
        _id: user._id,
        institutionId: String(user.institutionId),
      };

      await User.findOneAndUpdate(
        { _id: payload._id },
        { $set: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).maxTimeMS(5000).exec();
      migrated += 1;
    }
  });

  return migrated;
};

router.post('/apply-to-institution', authenticate, authorize('admin', 'super_admin', 'head'), async (req: any, res) => {
  try {
    const setting: any = await SiteSetting.findOne({ key: 'site_config' }).lean();
    const value = setting?.value || {};
    const mongodbUri = String(req.body?.mongodbUri || getActiveMongo(value)).trim();

    if (!mongodbUri) {
      return res.status(400).json({ message: 'MongoDB URI missing. Save MongoDB URI in settings first.' });
    }

    const institution = await Institution.findByIdAndUpdate(
      req.user.institutionId,
      {
        $set: {
          'settings.mongodbUri': mongodbUri,
          'billing.useEasySchoolStorage': false,
        },
      },
      { new: true }
    ).select('name settings billing');

    if (!institution) return res.status(404).json({ message: 'Institution not found.' });

    const tenantContext = resolveTenantStorageContext(institution);
    let migratedUsers = 0;

    if (tenantContext?.mongoUri) {
      await syncInstitutionToTenant(institution, tenantContext);
      migratedUsers = await syncUsersToTenant(String(institution._id), tenantContext);
    }

    res.json({
      message: 'Storage config applied to institution. School login and data access now use the selected personal storage.',
      institution,
      hasMongoUrl: Boolean(mongodbUri),
      migratedUsers,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to apply storage config to institution.', error });
  }
});

export default router;
