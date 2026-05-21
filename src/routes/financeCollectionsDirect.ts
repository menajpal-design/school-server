import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageFinance } from '../middleware/auth';
import Student from '../models/Student';
import Fee from '../models/Fee';
import User from '../models/User';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const connections = new Map<string, Promise<mongoose.Connection>>();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);

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
  if (!uri) { const error: any = new Error('School MongoDB URI missing. Settings-এ active MongoDB URI save করুন।'); error.statusCode = 428; throw error; }
  return uri;
}

async function getConnection(req: any) {
  const uri = await activeMongoUri(req);
  if (!connections.has(uri)) connections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise());
  try { const connection = await connections.get(uri)!; await connection.db.admin().ping(); return connection; }
  catch (error: any) { connections.delete(uri); const e: any = new Error(`Active Settings MongoDB connection failed for Finance Collections: ${error?.message || 'unknown error'}`); e.statusCode = 503; throw e; }
}

async function models(req: any) {
  const connection = await getConnection(req);
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return { Student: model('Student', Student), Fee: model('Fee', Fee), Class: model('Class', ClassModel), Section: model('Section', Section) };
}

async function enrichUsers(rows: any[]) {
  const ids = [...new Set(rows.map((x: any) => String(x.userId?._id || x.userId || '')).filter(Boolean))];
  const users = await primaryDb(() => User.find({ _id: { $in: ids } }).select('name phone email avatar').lean());
  const map = new Map(users.map((u: any) => [String(u._id), u]));
  return rows.map((row: any) => ({ ...row, userId: typeof row.userId === 'object' && row.userId?.name ? row.userId : (map.get(String(row.userId?._id || row.userId || '')) || row.userId) }));
}

router.use(authenticate, canManageFinance());
router.get('/', async (req: any, res) => {
  try {
    const M = await models(req);
    const term = String(req.query.search || '').trim().toLowerCase();
    const rows = await M.Student.find({ institutionId: req.user.institutionId }).populate('classId', 'name grade').populate('sectionId', 'name').limit(100).lean();
    const students = await enrichUsers(rows);
    const fees = await M.Fee.find({ institutionId: req.user.institutionId, status: { $in: ['pending', 'overdue'] } }).lean();
    const filtered = students.filter((s: any) => {
      if (!term) return true;
      return [s.userId?.name, s.userId?.phone, s.rollNumber, s.guardianName, s.guardianPhone, s.classId?.name, s.sectionId?.name].join(' ').toLowerCase().includes(term);
    });
    const result = filtered.map((student: any) => {
      const dueAmount = fees.reduce((sum: number, fee: any) => {
        const studentMatch = fee.studentId && String(fee.studentId) === String(student._id);
        const classMatch = !fee.studentId && fee.classId && String(fee.classId) === String(student.classId?._id || student.classId);
        return studentMatch || classMatch ? sum + Number(fee.amount || 0) : sum;
      }, 0);
      return { ...student, dueAmount };
    });
    res.json({ students: result, collections: [], source: 'settings-active-mongodb-direct' });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load collections', error });
  }
});

export default router;
