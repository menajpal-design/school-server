import express from 'express';
import mongoose from 'mongoose';
import { authenticate, normalizeRole } from '../middleware/auth';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const connections = new Map<string, Promise<mongoose.Connection>>();
const ids = (items: any[] = []) => items.map((item) => String(item?._id || item)).filter(Boolean);
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
  if (!uri) throw Object.assign(new Error('School MongoDB URI missing.'), { statusCode: 428 });
  return uri;
}
async function models(req: any) {
  const uri = await activeMongoUri(req);
  if (!connections.has(uri)) connections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise());
  const connection = await connections.get(uri)!;
  await connection.db.admin().ping();
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return { Student: model('Student', Student), Teacher: model('Teacher', Teacher), Staff: model('Staff', Staff) };
}

router.get('/people', authenticate, async (req: any, res) => {
  try {
    const M = await models(req);
    const institutionId = req.user.institutionId;
    const role = normalizeRole(req.user.role);
    const personType = String(req.query.personType || 'student').toLowerCase();
    if (personType === 'teacher') {
      if (!['head', 'assistant_head', 'admin', 'super_admin'].includes(role)) return res.status(403).json({ message: 'Only school leaders can load teacher roster.' });
      const people = await M.Teacher.find({ institutionId, isActive: { $ne: false } }).populate('userId', 'name username email phone avatar role').sort({ createdAt: -1 }).lean();
      return res.json({ people, debug: { source: 'active-school-db', count: people.length } });
    }
    if (personType === 'staff') {
      if (!['head', 'assistant_head', 'admin', 'super_admin'].includes(role)) return res.status(403).json({ message: 'Only school leaders can load staff roster.' });
      const people = await M.Staff.find({ institutionId, isActive: { $ne: false } }).populate('userId', 'name username email phone avatar role').sort({ createdAt: -1 }).lean();
      return res.json({ people, debug: { source: 'active-school-db', count: people.length } });
    }
    const query: any = { institutionId, isActive: true };
    let lockedClassId = '';
    let lockedClassIds: string[] = [];
    if (role === 'class_teacher') {
      const teacher: any = await M.Teacher.findOne({ institutionId, userId: req.user._id, isActive: { $ne: false } }).select('assignedClasses').lean();
      lockedClassIds = ids(teacher?.assignedClasses || []);
      if (!lockedClassIds.length) return res.json({ people: [], lockedClassId: '', lockedClassIds, message: 'No assigned class found for this class teacher.' });
      const requested = String(req.query.classId || '');
      lockedClassId = lockedClassIds.includes(requested) ? requested : lockedClassIds[0];
      query.classId = lockedClassId;
    } else if (req.query.classId) query.classId = req.query.classId;
    if (req.query.sectionId) query.sectionId = req.query.sectionId;
    const people = await M.Student.find(query).populate('userId', 'name username email phone avatar role').populate('classId', 'name grade').populate('sectionId', 'name').sort({ rollNumber: 1, createdAt: 1 }).lean();
    return res.json({ people, lockedClassId, lockedClassIds, debug: { source: 'active-school-db', count: people.length } });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load attendance people', error });
  }
});
export default router;
