import express from 'express';
import mongoose from 'mongoose';
import { authenticate, normalizeRole } from '../middleware/auth';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Subject from '../models/Subject';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const connections = new Map<string, Promise<mongoose.Connection>>();
const leaderRoles = ['head', 'assistant_head', 'admin', 'super_admin'];
const teacherRoles = ['teacher', 'subject_teacher', 'class_teacher'];
const blockedRoles = ['staff', 'finance_officer', 'librarian', 'committee_member'];
const ids = (items: any[] = []) => [...new Set(items.map((item) => String(item?._id || item)).filter(Boolean))];
const cleanShift = (value: any) => ['morning', 'day', 'evening'].includes(String(value)) ? String(value) : 'day';
const cleanGrade = (name: any) => String(name || '').match(/\d+/)?.[0] || String(name || 'General').trim() || 'General';
const cleanSections = (value: any) => (Array.isArray(value) && value.length ? value : [{ name: 'A', capacity: 30, currentStudents: 0, isActive: true }]).filter((section: any) => String(section?.name || '').trim()).map((section: any) => ({ name: String(section.name).trim(), capacity: Number(section.capacity) || 30, currentStudents: Number(section.currentStudents) || 0, isActive: section.isActive !== false }));
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
  return { Class: model('Class', ClassModel), Section: model('Section', Section), Student: model('Student', Student), Teacher: model('Teacher', Teacher), Subject: model('Subject', Subject) };
}
async function teacherClassIds(M: any, req: any) {
  const teacher: any = await M.Teacher.findOne({ institutionId: req.user.institutionId, userId: req.user._id, isActive: { $ne: false } }).select('assignedClasses subjects').lean();
  const classIds = ids(teacher?.assignedClasses || []);
  const subjectIds = ids(teacher?.subjects || []);
  if (subjectIds.length) {
    const subjects = await M.Subject.find({ institutionId: req.user.institutionId, _id: { $in: subjectIds } }).select('classId').lean();
    classIds.push(...ids(subjects.map((subject: any) => subject.classId)));
  }
  return ids(classIds);
}
async function withSections(M: any, items: any[]) {
  const sectionIds = ids(items.flatMap((item: any) => Array.isArray(item.sections) ? item.sections : []));
  if (!sectionIds.length) return items.map((item: any) => ({ ...item, sections: [] }));
  const sections = await M.Section.find({ _id: { $in: sectionIds } }).select('name capacity currentStudents isActive classId').lean();
  const map = new Map(sections.map((section: any) => [String(section._id), section]));
  return items.map((item: any) => ({ ...item, sections: (item.sections || []).map((id: any) => map.get(String(id))).filter(Boolean) }));
}

router.use(authenticate);
router.get('/', async (req: any, res) => {
  try {
    const M = await models(req);
    const role = normalizeRole(req.user.role);
    if (blockedRoles.includes(role)) return res.status(403).json({ message: 'Access denied. This role cannot view academic classes.' });
    const query: any = { institutionId: req.user.institutionId };
    if (!leaderRoles.includes(role)) {
      if (!teacherRoles.includes(role)) return res.json({ classes: [] });
      const allowedClassIds = await teacherClassIds(M, req);
      if (!allowedClassIds.length) return res.json({ classes: [], debug: { source: 'active-school-db', reason: 'teacher-no-assigned-class' } });
      query._id = { $in: allowedClassIds };
    }
    const [raw, totals] = await Promise.all([
      M.Class.find(query).sort({ createdAt: -1 }).lean(),
      M.Student.aggregate([{ $match: { institutionId: req.user.institutionId } }, { $group: { _id: '$classId', totalStudents: { $sum: 1 } } }]),
    ]);
    const classes = await withSections(M, raw);
    const count = new Map(totals.map((item: any) => [String(item._id), item.totalStudents]));
    return res.json({ classes: classes.map((item: any) => ({ ...item, totalStudents: count.get(String(item._id)) || 0, status: item.isActive ? 'active' : 'inactive' })), debug: { source: 'active-school-db', count: classes.length } });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ message: error?.message || 'Class API failed', error });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (!leaderRoles.includes(role)) return res.status(403).json({ message: 'Access denied.' });
    const M = await models(req);
    const items = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.items) ? req.body.items : [req.body];
    const created: any[] = [];
    for (const raw of items) {
      const name = String(raw.name || req.body.name || '').trim();
      if (!name) return res.status(400).json({ message: 'Class name is required.' });
      const cls = await M.Class.create({ name, grade: String(raw.grade || req.body.grade || cleanGrade(name)).trim(), shift: cleanShift(raw.shift || req.body.shift), classTeacherId: raw.classTeacherId || req.body.classTeacherId || undefined, academicYear: String(raw.academicYear || req.body.academicYear || new Date().getFullYear()).trim(), isActive: raw.isActive !== false, institutionId: req.user.institutionId });
      const sectionDocs = [];
      for (const section of cleanSections(raw.sections || req.body.sections)) sectionDocs.push(await M.Section.create({ ...section, classId: cls._id, institutionId: req.user.institutionId }));
      await M.Class.updateOne({ _id: cls._id, institutionId: req.user.institutionId }, { $set: { sections: sectionDocs.map((section: any) => section._id) } });
      const doc = await M.Class.findOne({ _id: cls._id, institutionId: req.user.institutionId }).lean();
      created.push((await withSections(M, [doc]))[0]);
    }
    return res.status(201).json(Array.isArray(req.body) || Array.isArray(req.body?.items) ? { classItems: created } : { classItem: created[0] });
  } catch (error: any) {
    return res.status(error?.name === 'ValidationError' ? 400 : 500).json({ message: error?.message || 'Class API failed', error });
  }
});

export default router;
