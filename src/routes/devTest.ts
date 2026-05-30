import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import SmsLog from '../models/SmsLog';
import SiteSetting from '../models/SiteSetting';
import mongoose from 'mongoose';

const router = express.Router();

const normalizeMongoItems = (config: any = {}) => {
  const existing = Array.isArray(config.mongodbUris) ? config.mongodbUris : [];
  const items = existing.map((item: any, index: number) => ({ id: item.id || `mongo-${index + 1}`, uri: item.uri || item.mongodbUrl || '' })).filter((i: any) => i.uri);
  if (config.mongodbUrl && !items.some((it: any) => it.uri === config.mongodbUrl)) items.push({ id: `mongo-${items.length + 1}`, uri: config.mongodbUrl });
  return items;
};

router.post('/test-archive', authenticate, authorize('admin', 'super_admin', 'head'), async (req: any, res) => {
  try {
    const { webhookUrl, checkArchives } = req.body || {};
    if (webhookUrl) process.env.EVENT_WEBHOOK_URL = String(webhookUrl).trim();

    const doc = await SmsLog.create({ institutionId: req.user.institutionId, phoneNumber: '0000000000', recipientName: 'ArchiveTest', message: `Archive test ${Date.now()}`, type: 'other', status: 'pending' });

    // wait briefly for background mirror to run
    await new Promise((r) => setTimeout(r, 2000));

    const result: any = { created: doc, archives: [] };

    if (checkArchives) {
      const setting = await SiteSetting.findOne({ key: 'site_config' }).lean();
      const value = setting?.value || {};
      const items = normalizeMongoItems(value);
      const active = items.find((it: any) => it.isActive) || items[0];
      const archiveUris = items.map((i: any) => i.uri).filter((u: string) => u && u !== (active?.uri || ''));

      for (const uri of archiveUris) {
        let conn: mongoose.Connection | null = null;
        try {
          conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000, maxPoolSize: 2 }).asPromise();
          const ArchiveSms = conn.models.SmsLog || conn.model('SmsLog', SmsLog.schema);
          const found = await ArchiveSms.findById(doc._id).lean();
          result.archives.push({ uri, found: Boolean(found) });
        } catch (err: any) {
          result.archives.push({ uri, error: err?.message || 'connection failed' });
        } finally {
          if (conn) await conn.close().catch(() => undefined);
        }
      }
    }

    res.json({ success: true, result, message: 'Test created. Archive mirror and webhook scheduled (if configured).' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || error });
  }
});

export default router;
