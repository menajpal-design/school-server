import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageFinance } from '../middleware/auth';
import Fee from '../models/Fee';
import Payment from '../models/Payment';
import Student from '../models/Student';
import User from '../models/User';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';
import { writeAuditLog } from '../services/auditService';

const router = express.Router();
const directConnections = new Map<string, Promise<mongoose.Connection>>();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const receiptNumber = () => `RCPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const amount = (value: any) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;

const normalizeMongoItems = (config: any = {}) => {
  const existing = Array.isArray(config.mongodbUris) ? config.mongodbUris : [];
  const items = existing.map((item: any, index: number) => ({ id: item.id || `mongo-${index + 1}`, uri: item.uri || item.mongodbUrl || '', isActive: item.isActive === true })).filter((item: any) => item.uri);
  if (config.mongodbUrl && !items.some((item: any) => item.uri === config.mongodbUrl)) items.push({ id: `mongo-${items.length + 1}`, uri: config.mongodbUrl, isActive: true });
  if (items.length && !items.some((item: any) => item.isActive)) items[items.length - 1].isActive = true;
  return items;
};
async function activeMongoUri(req: any) {
  const setting: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  const items = normalizeMongoItems(setting);
  const activeMongo = items.find((item: any) => item.isActive) || items[items.length - 1];
  const uri = String(activeMongo?.uri || setting.mongodbUrl || req.user?.institution?.settings?.mongodbUri || '').trim();
  if (!uri) { const e: any = new Error('School MongoDB URI missing. Settings-এ active MongoDB URI save করুন।'); e.statusCode = 428; throw e; }
  return uri;
}
async function getConnection(req: any) {
  const uri = await activeMongoUri(req);
  if (!directConnections.has(uri)) directConnections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise());
  try { const connection = await directConnections.get(uri)!; await connection.db.admin().ping(); return connection; }
  catch (error: any) { directConnections.delete(uri); const e: any = new Error(`Active Settings MongoDB connection failed for Finance Payment: ${error?.message || 'unknown error'}`); e.statusCode = 503; throw e; }
}
async function models(req: any) {
  const connection = await getConnection(req);
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return { Fee: model('Fee', Fee), Payment: model('Payment', Payment), Student: model('Student', Student), User: model('User', User) };
}
const populatePayment = (M: any) => M.Payment.find().populate({ path: 'studentId', populate: { path: 'userId', select: 'name avatar email phone' } }).populate('feeId', 'type month year amount');

router.use(authenticate, canManageFinance());

router.get('/', async (req: any, res) => {
  try {
    const M = await models(req);
    const payments = await populatePayment(M).where({ institutionId: req.user.institutionId }).sort({ paymentDate: -1 }).lean();
    res.json({ payments, source: 'settings-active-mongodb-direct' });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load payments', error });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const M = await models(req);
    const fee = req.body.feeId
      ? await M.Fee.findOne({ _id: req.body.feeId, institutionId: req.user.institutionId })
      : await M.Fee.findOne({ studentId: req.body.studentId, institutionId: req.user.institutionId, status: { $in: ['pending', 'overdue'] } }).sort({ dueDate: 1 });
    if (!fee) return res.status(404).json({ message: 'No due fee found for payment' });
    const payableAmount = amount(fee.amount);
    const paidAmount = amount(req.body.amount);
    if (paidAmount <= 0) return res.status(400).json({ message: 'Enter a valid payment amount.' });
    if (paidAmount > payableAmount) return res.status(400).json({ message: 'Payment amount cannot be greater than due amount.', dueAmount: payableAmount });
    const payment = await M.Payment.create({ feeId: fee._id, studentId: req.body.studentId || fee.studentId, amount: paidAmount, paymentMethod: req.body.paymentMethod || 'cash', paymentDate: new Date(), collectedBy: req.user._id, notes: req.body.notes, receiptNumber: receiptNumber(), institutionId: req.user.institutionId });
    const remainingAmount = amount(payableAmount - paidAmount);
    fee.amount = remainingAmount;
    fee.status = remainingAmount <= 0 ? 'paid' : 'pending';
    fee.paidDate = fee.status === 'paid' ? new Date() : undefined;
    fee.paymentMethod = req.body.paymentMethod || 'cash';
    fee.transactionId = undefined;
    await fee.save();
    const created = await populatePayment(M).where({ _id: payment._id, institutionId: req.user.institutionId }).findOne().lean();
    await writeAuditLog(req, 'create', 'payment', payment._id, created).catch(() => undefined);
    res.status(201).json({ payment: created, source: 'settings-active-mongodb-direct' });
  } catch (error: any) {
    res.status(error?.name === 'ValidationError' || error?.name === 'CastError' ? 400 : error?.statusCode || 500).json({ message: error?.message || 'Failed to collect payment', error });
  }
});

export default router;
