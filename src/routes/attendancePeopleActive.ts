import express from 'express';
import mongoose from 'mongoose';
import { authenticate, normalizeRole } from '../middleware/auth';
import User from '../models/User';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Attendance from '../models/Attendance';
import Class from '../models/Class';
import Section from '../models/Section';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const connections = new Map<string, Promise<mongoose.Connection>>();
const ids = (items: any[] = []) => items.map((item) => String(item?._id || item)).filter(Boolean);
const normalizeMongoItems = (config: any = {}) => { const existing = Array.isArray(config.mongodbUris) ? config.mongodbUris : []; const items = existing.map((item: any, index: number) => ({ id: item.id || `mongo-${index + 1}`, uri: item.uri || item.mongodbUrl || '', isActive: item.isActive === true })).filter((item: any) => item.uri); if (config.mongodbUrl && !items.some((item: any) => item.uri === config.mongodbUrl)) items.push({ id: `mongo-${items.length + 1}`, uri: config.mongodbUrl, isActive: true }); if (items.length && !items.some((item: any) => item.isActive)) items[items.length - 1].isActive = true; return items; };
async function activeMongoUri(req: any) { const setting: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {}); const items = normalizeMongoItems(setting); const activeMongo = items.find((item: any) => item.isActive) || items[items.length - 1]; const uri = String(activeMongo?.uri || setting.mongodbUrl || req.user?.institution?.settings?.mongodbUri || '').trim(); if (!uri) throw Object.assign(new Error('School MongoDB URI missing.'), { statusCode: 428 }); return uri; }
async function models(req: any) { const uri = await activeMongoUri(req); if (!connections.has(uri)) connections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise()); const connection = await connections.get(uri)!; await connection.db.admin().ping(); const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name); return { Student: model('Student', Student), Teacher: model('Teacher', Teacher), Staff: model('Staff', Staff), Attendance: model('Attendance', Attendance), Class: model('Class', Class), Section: model('Section', Section) }; }
const parseDate = (value?: string) => { const raw = String(value || new Date().toISOString().slice(0, 10)); const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(raw); };
const dayRange = (value?: string) => { const d = parseDate(value); return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate()), end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), date: new Date(d.getFullYear(), d.getMonth(), d.getDate()) }; };
async function classTeacherScope(M: any, req: any) { if (normalizeRole(req.user.role) !== 'class_teacher') return null; const teacher: any = await M.Teacher.findOne({ institutionId: req.user.institutionId, userId: req.user._id, isActive: { $ne: false } }).select('assignedClasses').lean(); return ids(teacher?.assignedClasses || []); }
async function assertClassScope(M: any, req: any, classId: any) { const scope = await classTeacherScope(M, req); if (!scope) return; if (!scope.length) throw Object.assign(new Error('No assigned class found for this class teacher.'), { statusCode: 403 }); if (!scope.includes(String(classId))) throw Object.assign(new Error('Access denied. Class Teacher can mark only assigned class attendance.'), { statusCode: 403 }); }
async function enrichUsers(rows: any[], field = 'userId') { const userIds = [...new Set(rows.map((row: any) => String(row?.[field]?._id || row?.[field] || '')).filter(Boolean))]; if (!userIds.length) return rows; const users = await primaryDb(() => User.find({ _id: { $in: userIds } }).select('name username email phone avatar role').lean()); const map = new Map(users.map((user: any) => [String(user._id), user])); return rows.map((row: any) => ({ ...row, [field]: map.get(String(row?.[field]?._id || row?.[field] || '')) || row[field] })); }

router.get('/people', authenticate, async (req: any, res) => {
  try {
    const M = await models(req); const institutionId = req.user.institutionId; const role = normalizeRole(req.user.role); const personType = String(req.query.personType || 'student').toLowerCase();
    const canManageEmployees = ['head', 'assistant_head', 'admin', 'super_admin', 'teacher', 'class_teacher', 'subject_teacher'].includes(role);
    if (personType === 'teacher') { if (!canManageEmployees) return res.status(403).json({ message: 'Access denied. Only teachers and above can load teacher roster.' }); const rows = await M.Teacher.find({ institutionId, isActive: { $ne: false } }).sort({ createdAt: -1 }).lean(); const people = await enrichUsers(rows); return res.json({ people, debug: { source: 'active-school-db', count: people.length } }); }
    if (personType === 'staff') { if (!canManageEmployees) return res.status(403).json({ message: 'Access denied. Only teachers and above can load staff roster.' }); const rows = await M.Staff.find({ institutionId, isActive: { $ne: false } }).sort({ createdAt: -1 }).lean(); const people = await enrichUsers(rows); return res.json({ people, debug: { source: 'active-school-db', count: people.length } }); }
    const query: any = { institutionId, isActive: true }; let lockedClassId = ''; let lockedClassIds: string[] = [];
    if (role === 'class_teacher') { lockedClassIds = await classTeacherScope(M, req) || []; if (!lockedClassIds.length) return res.json({ people: [], lockedClassId: '', lockedClassIds, message: 'No assigned class found for this class teacher.' }); const requested = String(req.query.classId || ''); lockedClassId = lockedClassIds.includes(requested) ? requested : lockedClassIds[0]; query.classId = lockedClassId; } else if (req.query.classId) query.classId = req.query.classId;
    if (req.query.sectionId) query.sectionId = req.query.sectionId;
    const rows = await M.Student.find(query).populate('classId', 'name grade').populate('sectionId', 'name').sort({ rollNumber: 1, createdAt: 1 }).lean();
    const people = await enrichUsers(rows);
    return res.json({ people, lockedClassId, lockedClassIds, debug: { source: 'active-school-db', count: people.length } });
  } catch (error: any) { return res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load attendance people', error }); }
});

router.get('/student/:id', authenticate, async (req: any, res) => {
  try {
    const M = await models(req);
    const student: any = await M.Student.findOne({ _id: req.params.id, institutionId: req.user.institutionId, isActive: { $ne: false } }).populate('classId', 'name grade').populate('sectionId', 'name').lean();
    if (!student) return res.status(404).json({ message: 'Student not found' });
    await assertClassScope(M, req, student.classId?._id || student.classId);
    const attendance = await M.Attendance.find({ institutionId: req.user.institutionId, studentId: student._id, userType: 'student' }).sort({ date: 1 }).lean();
    const [profile] = await enrichUsers([student]);
    return res.json({ attendance, profile, debug: { source: 'active-school-db', count: attendance.length } });
  } catch (error: any) { return res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load student attendance', error }); }
});

router.get('/person/:type/:id', authenticate, async (req: any, res) => {
  try {
    const M = await models(req); const type = String(req.params.type || '').toLowerCase();
    const allowed = ['head', 'assistant_head', 'admin', 'super_admin', 'teacher', 'class_teacher', 'subject_teacher'].includes(normalizeRole(req.user.role));
    if (!allowed) return res.status(403).json({ message: 'Access denied. Cannot view employee attendance history.' });
    const attendance = await M.Attendance.find({ institutionId: req.user.institutionId, userId: req.params.id, userType: type }).sort({ date: 1 }).lean();
    return res.json({ attendance, debug: { source: 'active-school-db', count: attendance.length } });
  } catch (error: any) { return res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load person attendance', error }); }
});

router.get('/', authenticate, async (req: any, res, next) => {
  try {
    if (!req.query.date && !req.query.classId && !req.query.userType) return next();
    const M = await models(req); const { start, end } = dayRange(req.query.date as string | undefined); const query: any = { institutionId: req.user.institutionId };
    if (req.query.classId) { await assertClassScope(M, req, req.query.classId); query.classId = req.query.classId; }
    if (req.query.sectionId) query.sectionId = req.query.sectionId;
    if (req.query.userType) query.userType = req.query.userType;
    if (req.query.date) query.date = { $gte: start, $lt: end };
    const attendance = await M.Attendance.find(query).populate('studentId', 'rollNumber guardianName').populate('classId', 'name grade').populate('sectionId', 'name').sort({ date: -1 }).lean();
    return res.json({ attendance, debug: { source: 'active-school-db', count: attendance.length } });
  } catch (error: any) { return res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load attendance', error }); }
});

router.post('/mark', authenticate, async (req: any, res) => {
  try {
    const M = await models(req); const records = Array.isArray(req.body.records) ? req.body.records : [req.body]; const { date } = dayRange(req.body.date);
    if (!records.length) return res.status(400).json({ message: 'No attendance records provided.' });
    await assertClassScope(M, req, req.body.classId || records[0]?.classId);
    const saved: any[] = [];
    for (const row of records) {
      const userType = row.userType || (row.studentId ? 'student' : 'teacher');
      if (userType === 'student') await assertClassScope(M, req, row.classId || req.body.classId);
      const filter: any = { institutionId: req.user.institutionId, date, userType };
      if (userType === 'student') { filter.studentId = row.studentId; filter.classId = row.classId || req.body.classId; filter.sectionId = row.sectionId || req.body.sectionId || undefined; }
      else { filter.userId = row.userId; }
      const update: any = { ...filter, status: row.status || 'absent', markedBy: req.user._id, markedAt: new Date() };
      const doc = await M.Attendance.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });
      saved.push(doc);
    }
    return res.json({ message: 'Attendance saved successfully.', attendance: saved, debug: { source: 'active-school-db', count: saved.length } });
  } catch (error: any) { return res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to save attendance', error }); }
});
export default router;
