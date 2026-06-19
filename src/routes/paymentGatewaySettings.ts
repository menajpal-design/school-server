import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageFinance } from '../middleware/auth';
import SiteSetting from '../models/SiteSetting';
import Payment from '../models/Payment';
import Fee from '../models/Fee';
import Salary from '../models/Salary';
import { runWithTenantStorage } from '../config/tenantStorage';
import { writeAuditLog } from '../services/auditService';

const router = express.Router();
const PAYMENT_KEY = 'school_payment_gateway_settings';
const connections = new Map<string, Promise<mongoose.Connection>>();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const allowedRoles = ['admin', 'super_admin', 'head'];
const allowedProviders = ['recommended_gateway', 'bkash', 'nagad', 'manual_bank', 'manual_cash', 'custom'];

const mask = (value?: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 8) return '********';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
};
const scoped = (req: any, key: string) => ({ key, institutionId: req.user.institutionId });
const getActiveMongo = (value: any = {}) => {
  const items = Array.isArray(value.mongodbUris) ? value.mongodbUris : [];
  const active = items.find((item: any) => item?.isActive) || items[items.length - 1];
  return String(active?.uri || active?.mongodbUrl || value.mongodbUri || value.mongodbUrl || '').trim();
};
const maskGateway = (cfg: any = {}) => ({
  ...cfg,
  bkash: { ...(cfg.bkash || {}), appKey: mask(cfg.bkash?.appKey), appSecret: mask(cfg.bkash?.appSecret), username: mask(cfg.bkash?.username), password: cfg.bkash?.password ? '********' : '' },
  nagad: { ...(cfg.nagad || {}), merchantId: mask(cfg.nagad?.merchantId), publicKey: mask(cfg.nagad?.publicKey), privateKey: cfg.nagad?.privateKey ? '********' : '' },
  recommendedGateway: { ...(cfg.recommendedGateway || {}), apiKey: mask(cfg.recommendedGateway?.apiKey), secretKey: cfg.recommendedGateway?.secretKey ? '********' : '' },
  custom: { ...(cfg.custom || {}), apiKey: mask(cfg.custom?.apiKey), secretKey: cfg.custom?.secretKey ? '********' : '' },
});
const mergeSecret = (incoming: any = {}, current: any = {}) => {
  const out: any = { ...(current || {}) };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) out[key] = mergeSecret(value, current?.[key] || {});
    else if (value !== undefined && value !== '' && value !== '********') out[key] = value;
  }
  return out;
};
const getSchoolMongoUri = async (req: any) => {
  const institutionSettings = req.user?.institution?.settings || {};
  const institutionUri = getActiveMongo(institutionSettings);
  if (institutionUri) return institutionUri;
  const setting: any = await primaryDb(async () => (await SiteSetting.findOne(scoped(req, 'site_config')).lean())?.value || {});
  return getActiveMongo(setting);
};
async function schoolModels(req: any) {
  const uri = await getSchoolMongoUri(req);
  if (!uri) {
    const error: any = new Error('School MongoDB URI missing. Settings থেকে active MongoDB URI save করুন।');
    error.statusCode = 428;
    throw error;
  }
  if (!connections.has(uri)) connections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise());
  const c = await connections.get(uri)!;
  await c.db.admin().ping();
  const model = (name: string, base: any) => c.models[name] || c.model(name, base.schema, base.collection?.name || name);
  return { Payment: model('Payment', Payment), Fee: model('Fee', Fee), Salary: model('Salary', Salary) };
}
const range = (q: any) => {
  const now = new Date();
  const year = Number(q.year || now.getFullYear());
  const month = q.month ? Number(q.month) : undefined;
  if (month) return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1), year, month };
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1), year, month: 0 };
};
const monthKey = (d: any) => `${new Date(d).getFullYear()}-${String(new Date(d).getMonth() + 1).padStart(2, '0')}`;

router.use(authenticate);

router.get('/settings', async (req: any, res) => {
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: 'Payment settings restricted to Head/Admin only.' });
  const setting: any = await primaryDb(() => SiteSetting.findOne(scoped(req, PAYMENT_KEY)).lean());
  const cfg = setting?.value || {};
  res.json({ settings: maskGateway(cfg), hasSettings: Boolean(setting), recommended: { label: 'Easy School Suggested Gateway', provider: 'recommended_gateway', note: 'School may use our suggested gateway or configure its own bKash/Nagad/manual method. Transactions remain inside the school account.' } });
});

router.put('/settings', async (req: any, res) => {
  if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ message: 'Payment settings restricted to Head/Admin only.' });
  const existing: any = await primaryDb(() => SiteSetting.findOne(scoped(req, PAYMENT_KEY)));
  const current = existing?.value || {};
  const next = mergeSecret(req.body || {}, current);
  next.enabledProviders = Array.isArray(next.enabledProviders) ? next.enabledProviders.filter((p: string) => allowedProviders.includes(p)) : [];
  next.updatedAt = new Date().toISOString();
  const saved: any = await primaryDb(() => SiteSetting.findOneAndUpdate(scoped(req, PAYMENT_KEY), { value: next, isSecret: true, institutionId: req.user.institutionId, updatedBy: req.user._id }, { upsert: true, new: true, setDefaultsOnInsert: true }));
  await writeAuditLog(req, 'update', 'payment-gateway-settings', saved._id, { enabledProviders: next.enabledProviders, defaultProvider: next.defaultProvider }).catch(() => undefined);
  res.json({ settings: maskGateway(saved.value || {}), message: 'Payment gateway settings saved. Secrets are masked.' });
});

router.use(canManageFinance());

router.get('/summary', async (req: any, res) => {
  try {
    const M = await schoolModels(req);
    const r = range(req.query);
    const institutionId = req.user.institutionId;
    const [payments, dues, salaries] = await Promise.all([
      M.Payment.find({ institutionId, paymentDate: { $gte: r.start, $lt: r.end } }).lean(),
      M.Fee.find({ institutionId, status: { $in: ['pending', 'overdue'] } }).lean(),
      M.Salary.find({ institutionId, paymentDate: { $gte: r.start, $lt: r.end } }).lean(),
    ]);
    const byMonth = new Map<string, any>();
    for (const p of payments as any[]) {
      const key = monthKey(p.paymentDate);
      const row = byMonth.get(key) || { month: key, collection: 0, paymentCount: 0, methods: {} as Record<string, number> };
      row.collection += Number(p.amount || 0);
      row.paymentCount += 1;
      const method = p.paymentMethod || 'unknown';
      row.methods[method] = (row.methods[method] || 0) + Number(p.amount || 0);
      byMonth.set(key, row);
    }
    const totalCollection = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const totalDue = dues.reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
    const totalSalary = salaries.reduce((s: number, sal: any) => s + Number(sal.netSalary || 0), 0);
    res.json({ type: r.month ? 'monthly' : 'yearly', year: r.year, month: r.month || undefined, summary: { totalCollection, totalDue, totalSalary, netBalance: totalCollection - totalSalary, paymentCount: payments.length, dueCount: dues.length, salaryCount: salaries.length }, byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)) });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load finance summary', error });
  }
});

router.get('/audit', async (req: any, res) => {
  try {
    const M = await schoolModels(req);
    const r = range(req.query);
    const institutionId = req.user.institutionId;
    const payments = await M.Payment.find({ institutionId, paymentDate: { $gte: r.start, $lt: r.end } }).sort({ paymentDate: -1 }).lean();
    const rows = payments.map((p: any) => ({ date: p.paymentDate, type: 'collection', method: p.paymentMethod || 'unknown', amount: Number(p.amount || 0), receiptNumber: p.receiptNumber, studentId: p.studentId, collectedBy: p.collectedBy, notes: p.notes }));
    res.json({ audit: rows, total: rows.reduce((s: number, x: any) => s + x.amount, 0), count: rows.length });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load finance audit', error });
  }
});

export default router;
