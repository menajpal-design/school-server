import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageFinance } from '../middleware/auth';
import Fee from '../models/Fee';
import Student from '../models/Student';
import ClassModel from '../models/Class';
import User from '../models/User';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';
import { writeAuditLog } from '../services/auditService';

const router = express.Router();
const directConnections = new Map<string, Promise<mongoose.Connection>>();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const objectIdOrUndefined = (value: any) => String(value || '').trim() || undefined;

const normalizeMongoItems = (config: any = {}) => {
  const existing = Array.isArray(config.mongodbUris) ? config.mongodbUris : [];
  const items = existing
    .map((item: any, index: number) => ({ id: item.id || `mongo-${index + 1}`, uri: item.uri || item.mongodbUrl || '', isActive: item.isActive === true }))
    .filter((item: any) => item.uri);
  if (config.mongodbUrl && !items.some((item: any) => item.uri === config.mongodbUrl)) items.push({ id: `mongo-${items.length + 1}`, uri: config.mongodbUrl, isActive: true });
  if (items.length && !items.some((item: any) => item.isActive)) items[items.length - 1].isActive = true;
  return items;
};

async function activeMongoUri(req: any) {
  const setting: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  const items = normalizeMongoItems(setting);
  const activeMongo = items.find((item: any) => item.isActive) || items[items.length - 1];
  const uri = String(activeMongo?.uri || setting.mongodbUrl || req.user?.institution?.settings?.mongodbUri || '').trim();
  if (!uri) {
    const error: any = new Error('School MongoDB URI missing. Settings-এ active MongoDB URI save করুন।');
    error.statusCode = 428;
    throw error;
  }
  return uri;
}

async function getConnection(req: any) {
  const uri = await activeMongoUri(req);
  if (!directConnections.has(uri)) {
    directConnections.set(uri, mongoose.createConnection(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 30000,
      retryWrites: true,
    }).asPromise());
  }
  try {
    const connection = await directConnections.get(uri)!;
    await connection.db.admin().ping();
    return connection;
  } catch (error: any) {
    directConnections.delete(uri);
    const e: any = new Error(`Active Settings MongoDB connection failed for Finance Fee: ${error?.message || 'unknown error'}`);
    e.statusCode = 503;
    throw e;
  }
}

async function models(req: any) {
  const connection = await getConnection(req);
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return {
    Fee: model('Fee', Fee),
    Student: model('Student', Student),
    Class: model('Class', ClassModel),
    User: model('User', User),
  };
}

const normalizeFeePayload = (body: any) => {
  const payload: any = { ...body };
  payload.studentId = objectIdOrUndefined(payload.studentId);
  payload.classId = objectIdOrUndefined(payload.classId);
  payload.type = payload.type || 'monthly';
  payload.year = Number(payload.year || new Date().getFullYear());
  payload.month = payload.type === 'monthly' ? 'All Months' : String(payload.month || 'N/A');
  payload.dueDate = payload.dueDate || new Date(payload.year, 0, 10);
  if (payload.studentId === undefined) delete payload.studentId;
  if (payload.classId === undefined) delete payload.classId;
  return payload;
};

const calculateFeeAmount = (body: any) => {
  const originalAmount = Number(body.originalAmount ?? body.baseAmount ?? body.amount ?? 0);
  const waiverType = body.waiverType || 'none';
  const requestedWaiver = Number(body.waiverAmount || body.scholarship || body.discount || 0);
  const waiverAmount = waiverType === 'free' ? originalAmount : waiverType === 'half' ? originalAmount / 2 : requestedWaiver;
  const cappedWaiver = Math.min(originalAmount, Math.max(0, waiverAmount));
  return { originalAmount, waiverType, waiverAmount: cappedWaiver, amount: Math.max(0, originalAmount - cappedWaiver) };
};

const populateFee = (M: any) => M.Fee.find().populate({ path: 'studentId', populate: { path: 'userId', select: 'name avatar email phone' } }).populate('classId', 'name grade');

router.use(authenticate, canManageFinance());

router.get('/', async (req: any, res) => {
  try {
    const M = await models(req);
    const fees = await populateFee(M).where({ institutionId: req.user.institutionId }).sort({ createdAt: -1 }).lean();
    res.json({ fees, source: 'settings-active-mongodb-direct' });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load fees', error });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const M = await models(req);
    const payload = normalizeFeePayload(req.body);
    const calculated = calculateFeeAmount(payload);
    const fee = await M.Fee.create({ ...payload, ...calculated, collectedBy: req.user._id, institutionId: req.user.institutionId });
    const created = await populateFee(M).where({ _id: fee._id, institutionId: req.user.institutionId }).findOne().lean();
    await writeAuditLog(req, 'create', 'fee', fee._id, created).catch(() => undefined);
    res.status(201).json({ fee: created, source: 'settings-active-mongodb-direct' });
  } catch (error: any) {
    res.status(error?.name === 'ValidationError' || error?.name === 'CastError' ? 400 : error?.statusCode || 500).json({ message: error?.message || 'Failed to create fee', error });
  }
});

router.put('/:id', async (req: any, res) => {
  try {
    const M = await models(req);
    const payload = normalizeFeePayload(req.body);
    const calculated = calculateFeeAmount(payload);
    const fee = await M.Fee.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, { ...payload, ...calculated }, { new: true });
    if (!fee) return res.status(404).json({ message: 'Fee not found' });
    const updated = await populateFee(M).where({ _id: fee._id, institutionId: req.user.institutionId }).findOne().lean();
    await writeAuditLog(req, 'update', 'fee', fee._id, updated).catch(() => undefined);
    res.json({ fee: updated, source: 'settings-active-mongodb-direct' });
  } catch (error: any) {
    res.status(error?.name === 'ValidationError' || error?.name === 'CastError' ? 400 : error?.statusCode || 500).json({ message: error?.message || 'Failed to update fee', error });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const M = await models(req);
    const fee = await M.Fee.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!fee) return res.status(404).json({ message: 'Fee not found' });
    await fee.deleteOne();
    await writeAuditLog(req, 'delete', 'fee', fee._id, undefined, fee).catch(() => undefined);
    res.json({ message: 'Fee deleted' });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to delete fee', error });
  }
});

export default router;
