import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageAcademic } from '../middleware/auth';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Student from '../models/Student';
import SiteSetting from '../models/SiteSetting';
import { getTenantStorageContext, runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const connections = new Map<string, Promise<mongoose.Connection>>();
const yearNow = () => String(new Date().getFullYear());
const okShift = (v: any) => ['morning', 'day', 'evening'].includes(String(v)) ? String(v) : 'day';
const gradeOf = (name: any) => String(name || '').match(/\d+/)?.[0] || String(name || 'General').trim() || 'General';
const secs = (v: any) => (Array.isArray(v) && v.length ? v : [{ name: 'A', capacity: 30, currentStudents: 0, isActive: true }]).filter((s: any) => String(s?.name || '').trim()).map((s: any) => ({ name: String(s.name).trim(), capacity: Number(s.capacity) || 30, currentStudents: Number(s.currentStudents) || 0, isActive: s.isActive !== false }));
const readable = (e: any) => e?.name === 'ValidationError' ? Object.values(e.errors || {}).map((x: any) => x?.message).join(', ') : e?.message || 'Class API failed';

async function readPrimarySiteConfig() {
  return runWithTenantStorage(null, async () => {
    const setting: any = await SiteSetting.findOne({ key: 'site_config' }).lean();
    return setting?.value || {};
  });
}

async function getMongoUri(req: any) {
  const current = getTenantStorageContext();
  const value = await readPrimarySiteConfig();
  const mongoItems = Array.isArray(value.mongodbUris) ? value.mongodbUris : [];
  const activeMongo = mongoItems.find((x: any) => x?.isActive) || mongoItems[mongoItems.length - 1];
  return String(req.user?.institution?.settings?.mongodbUri || current?.mongoUri || activeMongo?.uri || value.mongodbUrl || '').trim();
}

async function getTenantModels(req: any) {
  const mongoUri = await getMongoUri(req);
  if (!mongoUri) {
    const err: any = new Error('School MongoDB URI missing. Save MongoDB URI in Settings before creating academic data.');
    err.statusCode = 428;
    throw err;
  }
  const key = `${req.user.institutionId}:${mongoUri}`;
  if (!connections.has(key)) {
    connections.set(key, mongoose.createConnection(mongoUri, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000, socketTimeoutMS: 30000 }).asPromise());
  }
  const conn = await connections.get(key)!;
  const ClassTenant = conn.models.Class || conn.model('Class', (ClassModel as any).schema, (ClassModel as any).collection.name);
  const SectionTenant = conn.models.Section || conn.model('Section', (Section as any).schema, (Section as any).collection.name);
  const StudentTenant = conn.models.Student || conn.model('Student', (Student as any).schema, (Student as any).collection.name);
  return { ClassTenant, SectionTenant, StudentTenant };
}

const pop = (ClassTenant: any) => ClassTenant.find().populate('sections', 'name capacity currentStudents isActive').populate('classTeacherId', 'name email phone role');

router.get('/', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const { ClassTenant, StudentTenant } = await getTenantModels(req);
    const [list, totals] = await Promise.all([
      pop(ClassTenant).where({ institutionId: req.user.institutionId }).sort({ createdAt: -1 }).lean(),
      StudentTenant.aggregate([{ $match: { institutionId: req.user.institutionId } }, { $group: { _id: '$classId', totalStudents: { $sum: 1 } } }]),
    ]);
    const counts = new Map(totals.map((x: any) => [String(x._id), x.totalStudents]));
    res.json({ classes: list.map((x: any) => ({ ...x, totalStudents: counts.get(String(x._id)) || 0, status: x.isActive ? 'active' : 'inactive' })) });
  } catch (e: any) {
    res.status(e?.statusCode || 500).json({ message: readable(e), error: { name: e?.name, message: e?.message } });
  }
});

router.post('/', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const { ClassTenant, SectionTenant } = await getTenantModels(req);
    const list = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.items) ? req.body.items : [req.body];
    const created: any[] = [];
    for (const raw of list) {
      const name = String(raw.name || req.body.name || '').trim();
      if (!name) return res.status(400).json({ message: 'Class name is required.' });
      const cls = await ClassTenant.create({ name, grade: String(raw.grade || req.body.grade || gradeOf(name)).trim(), shift: okShift(raw.shift || req.body.shift), classTeacherId: raw.classTeacherId || req.body.classTeacherId || undefined, academicYear: String(raw.academicYear || req.body.academicYear || yearNow()).trim() || yearNow(), isActive: raw.isActive !== false, institutionId: req.user.institutionId });
      const sectionDocs = [];
      for (const sec of secs(raw.sections || req.body.sections)) sectionDocs.push(await SectionTenant.create({ ...sec, classId: cls._id, institutionId: req.user.institutionId }));
      await ClassTenant.updateOne({ _id: cls._id, institutionId: req.user.institutionId }, { $set: { sections: sectionDocs.map((x: any) => x._id) } });
      created.push(await pop(ClassTenant).where({ _id: cls._id, institutionId: req.user.institutionId }).findOne());
    }
    res.status(201).json(Array.isArray(req.body) || Array.isArray(req.body?.items) ? { classItems: created } : { classItem: created[0] });
  } catch (e: any) {
    res.status(e?.statusCode || (e?.name === 'ValidationError' ? 400 : 500)).json({ message: readable(e), error: { name: e?.name, message: e?.message, code: e?.code } });
  }
});

export default router;
