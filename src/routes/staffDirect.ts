import express from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth';
import Staff from '../models/Staff';
import User from '../models/User';
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
  catch (error: any) { connections.delete(uri); const e: any = new Error(`Active Settings MongoDB connection failed for Staff: ${error?.message || 'unknown error'}`); e.statusCode = 503; throw e; }
}

async function models(req: any) {
  const connection = await getConnection(req);
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return { Staff: model('Staff', Staff) };
}

async function syncStaffProfiles(req: any, M: any) {
  const users = await primaryDb(() => User.find({ institutionId: req.user.institutionId, role: 'staff', isActive: { $ne: false } }).select('name username email phone avatar role salary employeeId designation department createdAt').lean());
  const userIds = users.map((u: any) => u._id);
  const existing = await M.Staff.find({ institutionId: req.user.institutionId, userId: { $in: userIds } }).select('userId').lean();
  const existingIds = new Set(existing.map((x: any) => String(x.userId)));
  const docs = users.filter((u: any) => !existingIds.has(String(u._id))).map((u: any, index: number) => ({
    userId: u._id,
    employeeId: u.employeeId || `S-${String(index + 1).padStart(3, '0')}-${String(u._id).slice(-4)}`,
    designation: u.designation || 'Staff',
    department: u.department || 'General',
    joiningDate: u.createdAt || new Date(),
    salary: Number(u.salary || 0),
    isActive: true,
    institutionId: req.user.institutionId,
  }));
  if (docs.length) await M.Staff.insertMany(docs, { ordered: false }).catch(() => undefined);
}

async function enrichStaff(rows: any[]) {
  const plain = rows.map((x: any) => typeof x?.toObject === 'function' ? x.toObject() : x);
  const userIds = [...new Set(plain.map((x: any) => String(x.userId?._id || x.userId || '')).filter(Boolean))];
  const users = await primaryDb(() => User.find({ _id: { $in: userIds } }).select('name username email phone avatar role salary employeeId designation department createdAt').lean());
  const map = new Map(users.map((u: any) => [String(u._id), u]));
  return plain.map((s: any) => ({ ...s, userId: typeof s.userId === 'object' && s.userId?.name ? s.userId : (map.get(String(s.userId?._id || s.userId || '')) || s.userId) }));
}

router.use(authenticate);

router.get('/', async (req: any, res) => {
  try {
    const M = await models(req);
    await syncStaffProfiles(req, M);
    const rows = await M.Staff.find({ institutionId: req.user.institutionId, isActive: { $ne: false } }).sort({ createdAt: -1 }).lean();
    res.json({ staff: await enrichStaff(rows), source: 'settings-active-mongodb-direct' });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load staff', error });
  }
});

router.put('/:id', async (req: any, res) => {
  try {
    const M = await models(req);
    const rawId = String(req.params.id || '');
    let staff: any = null;
    if (rawId.startsWith('user-')) {
      const userId = rawId.replace(/^user-/, '');
      await syncStaffProfiles(req, M);
      staff = await M.Staff.findOne({ userId, institutionId: req.user.institutionId });
    } else {
      staff = await M.Staff.findOne({ _id: rawId, institutionId: req.user.institutionId });
    }
    if (!staff) return res.status(404).json({ message: 'Staff profile not found' });
    await primaryDb(() => User.findByIdAndUpdate(staff.userId, { name: req.body.name, phone: req.body.phone, avatar: req.body.photo, salary: Number(req.body.salary) || 0, employeeId: req.body.employeeId, designation: req.body.designation || 'Staff', department: req.body.department || 'General' }));
    staff.employeeId = req.body.employeeId || staff.employeeId;
    staff.designation = req.body.designation || staff.designation;
    staff.department = req.body.department || staff.department;
    staff.joiningDate = req.body.joiningDate || staff.joiningDate;
    staff.salary = Number(req.body.salary) || 0;
    await staff.save();
    const [updated] = await enrichStaff([staff]);
    res.json({ staff: updated, source: 'settings-active-mongodb-direct' });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to update staff', error });
  }
});

export default router;
