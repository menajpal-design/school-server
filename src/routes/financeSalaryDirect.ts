import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageFinance } from '../middleware/auth';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Salary from '../models/Salary';
import User from '../models/User';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const connections = new Map<string, Promise<mongoose.Connection>>();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);

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
  if (!connections.has(uri)) connections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise());
  try {
    const connection = await connections.get(uri)!;
    await connection.db.admin().ping();
    return connection;
  } catch (error: any) {
    connections.delete(uri);
    const e: any = new Error(`Active Settings MongoDB connection failed for Salary: ${error?.message || 'unknown error'}`);
    e.statusCode = 503;
    throw e;
  }
}

async function models(req: any) {
  const connection = await getConnection(req);
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return { Teacher: model('Teacher', Teacher), Staff: model('Staff', Staff), Salary: model('Salary', Salary) };
}

async function enrichUsers(rows: any[]) {
  const userIds = [...new Set(rows.map((item: any) => String(item.userId?._id || item.userId || '')).filter(Boolean))];
  const users = await primaryDb(() => User.find({ _id: { $in: userIds } }).select('name username email phone avatar role').lean());
  const userMap = new Map(users.map((u: any) => [String(u._id), u]));
  return rows.map((item: any) => ({ ...item, userId: typeof item.userId === 'object' && item.userId?.name ? item.userId : (userMap.get(String(item.userId?._id || item.userId || '')) || item.userId) }));
}

router.use(authenticate, canManageFinance());

router.get('/', async (req: any, res) => {
  try {
    const M = await models(req);
    const [salaries, teachersRaw, staffRaw] = await Promise.all([
      M.Salary.find({ institutionId: req.user.institutionId }).sort({ createdAt: -1 }).lean(),
      M.Teacher.find({ institutionId: req.user.institutionId, isActive: { $ne: false } }).sort({ createdAt: -1 }).lean(),
      M.Staff.find({ institutionId: req.user.institutionId, isActive: { $ne: false } }).sort({ createdAt: -1 }).lean(),
    ]);
    const teachers = (await enrichUsers(teachersRaw)).map((item: any) => ({ ...item, employeeType: 'teacher' }));
    const staff = (await enrichUsers(staffRaw)).map((item: any) => ({ ...item, employeeType: 'staff' }));
    res.json({ salaries, employees: [...teachers, ...staff], source: 'settings-active-mongodb-direct' });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load salaries', error });
  }
});

export default router;
