import express from 'express';
import mongoose from 'mongoose';
import baseRouter from './studentsUsernameOnly';
import { authenticate } from '../middleware/auth';
import User from '../models/User';
import Student from '../models/Student';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Parent from '../models/Parent';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const connections = new Map<string, Promise<mongoose.Connection>>();

const normalizeRoll = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? String(Number(digits)).padStart(2, '0') : raw;
};
const isObjectId = (value: any) => mongoose.Types.ObjectId.isValid(String(value || ''));
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
  catch (error: any) { connections.delete(uri); const e: any = new Error(`Active Settings MongoDB connection failed for Student update: ${error?.message || 'unknown error'}`); e.statusCode = 503; throw e; }
}
async function models(req: any) {
  const connection = await getConnection(req);
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return { Student: model('Student', Student), Class: model('Class', ClassModel), Section: model('Section', Section), Parent: model('Parent', Parent) };
}
async function ensureClassSection(req: any, M: any, current: any) {
  const classId = String(req.body.classId || '').trim();
  const sectionId = String(req.body.sectionId || '').trim();
  const className = String(req.body.className || req.body.class || '').trim();
  const sectionName = String(req.body.sectionName || req.body.section || '').trim();
  let cls: any = null;
  if (classId && isObjectId(classId)) cls = await M.Class.findOne({ _id: classId, institutionId: req.user.institutionId });
  if (!cls && className) cls = await M.Class.findOneAndUpdate({ institutionId: req.user.institutionId, name: className }, { $setOnInsert: { institutionId: req.user.institutionId, name: className, grade: className.match(/\d+/)?.[0] || className, academicYear: String(new Date().getFullYear()), shift: 'day' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  if (!cls && current?.classId) cls = await M.Class.findOne({ _id: current.classId, institutionId: req.user.institutionId });
  let sec: any = null;
  if (sectionId && isObjectId(sectionId) && cls?._id) sec = await M.Section.findOne({ _id: sectionId, institutionId: req.user.institutionId, classId: cls._id });
  if (!sec && sectionName && cls?._id) sec = await M.Section.findOneAndUpdate({ institutionId: req.user.institutionId, classId: cls._id, name: sectionName }, { $setOnInsert: { institutionId: req.user.institutionId, classId: cls._id, name: sectionName, capacity: 30, currentStudents: 0 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  if (!sec && current?.sectionId) sec = await M.Section.findOne({ _id: current.sectionId, institutionId: req.user.institutionId });
  if (cls?._id && sec?._id) await M.Class.updateOne({ _id: cls._id }, { $addToSet: { sections: sec._id } }).catch(() => undefined);
  return { classId: cls?._id || current?.classId, sectionId: sec?._id || current?.sectionId };
}
async function enrichStudent(student: any) {
  const plain = typeof student?.toObject === 'function' ? student.toObject() : student;
  if (!plain) return plain;
  const [user, parent] = await primaryDb(async () => Promise.all([
    User.findById(plain.userId).select('name username phone avatar role email').lean(),
    plain.parentId ? User.findById(plain.parentId).select('name username phone avatar role email').lean() : Promise.resolve(null),
  ]));
  return { ...plain, userId: user || plain.userId, parentId: parent || plain.parentId };
}

router.get('/:id', authenticate, async (req: any, res) => {
  try {
    const M = await models(req);
    const rawId = String(req.params.id || '');
    let student: any = null;

    if (rawId.startsWith('user-')) {
      const uid = rawId.replace(/^user-/, '');
      student = await M.Student.findOne({ userId: uid, institutionId: req.user.institutionId });
    } else if (isObjectId(rawId)) {
      student = await M.Student.findOne({ _id: rawId, institutionId: req.user.institutionId });
      if (!student) student = await M.Student.findOne({ userId: rawId, institutionId: req.user.institutionId });
    }

    if (!student) return res.status(404).json({ message: 'Student profile not found.' });

    const enriched = await enrichStudent(student);
    res.json({ student: enriched, ...enriched });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load student.' });
  }
});

router.put('/:id', authenticate, async (req: any, res) => {
  try {
    const M = await models(req);
    const rawId = String(req.params.id || '');
    let student: any = null;

    if (rawId.startsWith('user-')) {
      const uid = rawId.replace(/^user-/, '');
      student = await M.Student.findOne({ userId: uid, institutionId: req.user.institutionId });
    } else if (isObjectId(rawId)) {
      student = await M.Student.findOne({ _id: rawId, institutionId: req.user.institutionId });
      if (!student) student = await M.Student.findOne({ userId: rawId, institutionId: req.user.institutionId });
    }
    if (!student) return res.status(404).json({ message: 'Student profile not found.' });

    const userUpdate: any = {};
    if (req.body?.name) userUpdate.name = String(req.body.name).trim();
    if (req.body?.phone !== undefined) userUpdate.phone = String(req.body.phone || '').trim();
    if (req.body?.photo !== undefined) userUpdate.avatar = req.body.photo;
    const user = await primaryDb(() => User.findOneAndUpdate({ _id: student.userId, institutionId: req.user.institutionId, role: 'student' }, { $set: userUpdate }, { new: true }).select('name username phone avatar role email').lean());
    if (!user) return res.status(404).json({ message: 'Student user not found.' });

    const resolved = await ensureClassSection(req, M, student);
    if (req.body?.rollNumber !== undefined) student.rollNumber = normalizeRoll(req.body.rollNumber);
    if (resolved.classId) student.classId = resolved.classId;
    if (resolved.sectionId) student.sectionId = resolved.sectionId;
    if (req.body?.admissionDate) student.admissionDate = new Date(req.body.admissionDate);
    if (req.body?.dateOfBirth) student.dateOfBirth = new Date(req.body.dateOfBirth);
    if (req.body?.bloodGroup !== undefined) student.bloodGroup = req.body.bloodGroup || undefined;
    if (req.body?.address !== undefined) student.address = String(req.body.address || '');
    if (req.body?.fatherName !== undefined) student.fatherName = String(req.body.fatherName || '');
    if (req.body?.motherName !== undefined) student.motherName = String(req.body.motherName || '');
    if (req.body?.guardianName !== undefined) student.guardianName = String(req.body.guardianName || '');
    if (req.body?.guardianPhone !== undefined) student.guardianPhone = String(req.body.guardianPhone || '');
    if (req.body?.guardianEmail !== undefined) student.guardianEmail = String(req.body.guardianEmail || '').trim() || undefined;
    await student.save();

    if (student.parentId) {
      await M.Parent.findOneAndUpdate({ userId: student.parentId, institutionId: req.user.institutionId }, { $set: { emergencyContact: student.guardianName || '', emergencyPhone: student.guardianPhone || '', address: student.address || '' }, $addToSet: { children: student._id } }, { upsert: true, new: true, setDefaultsOnInsert: true }).catch(() => undefined);
    }

    const updated = await M.Student.findById(student._id).populate('classId', 'name grade').populate('sectionId', 'name').lean();
    res.json({ student: await enrichStudent(updated), message: 'Student profile updated.' });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to update student.' });
  }
});

router.use('/', baseRouter);

export default router;