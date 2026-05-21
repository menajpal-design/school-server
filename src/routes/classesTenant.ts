import express from 'express';
import { authenticate, canManageAcademic } from '../middleware/auth';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Student from '../models/Student';
import SiteSetting from '../models/SiteSetting';
import { getTenantStorageContext, runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const yearNow = () => String(new Date().getFullYear());
const okShift = (v: any) => ['morning', 'day', 'evening'].includes(String(v)) ? String(v) : 'day';
const gradeOf = (name: any) => String(name || '').match(/\d+/)?.[0] || String(name || 'General').trim() || 'General';
const secs = (v: any) => (Array.isArray(v) && v.length ? v : [{ name: 'A', capacity: 30, currentStudents: 0, isActive: true }]).filter((s: any) => String(s?.name || '').trim()).map((s: any) => ({ name: String(s.name).trim(), capacity: Number(s.capacity) || 30, currentStudents: Number(s.currentStudents) || 0, isActive: s.isActive !== false }));
const readable = (e: any) => e?.name === 'ValidationError' ? Object.values(e.errors || {}).map((x: any) => x?.message).join(', ') : e?.message || 'Class API failed';
const pop = () => ClassModel.find().populate('sections', 'name capacity currentStudents isActive').populate('classTeacherId', 'name email phone role');

async function getSchoolStorageContext(req: any) {
  const current = getTenantStorageContext();
  if (current?.mongoUri) return current;
  const setting: any = await SiteSetting.findOne({ key: 'site_config' }).lean();
  const value = setting?.value || {};
  const mongoItems = Array.isArray(value.mongodbUris) ? value.mongodbUris : [];
  const activeMongo = mongoItems.find((x: any) => x?.isActive) || mongoItems[mongoItems.length - 1];
  const imgbbItems = Array.isArray(value.imgbbKeys) ? value.imgbbKeys : [];
  const activeImgbb = imgbbItems.find((x: any) => x?.isActive) || imgbbItems[imgbbItems.length - 1];
  const mongoUri = String(req.user?.institution?.settings?.mongodbUri || activeMongo?.uri || value.mongodbUrl || '').trim();
  const imgbbApiKey = String(req.user?.institution?.settings?.imgbbApiKey || activeImgbb?.apiKey || value.imgbbApiKey || '').trim();
  if (!mongoUri) return null;
  return { institutionId: String(req.user.institutionId), mongoUri, imgbbApiKey: imgbbApiKey || undefined };
}

async function withSchoolDb(req: any, fn: () => Promise<any>) {
  const context = await getSchoolStorageContext(req);
  if (!context?.mongoUri) {
    const err: any = new Error('School MongoDB URI missing. Save MongoDB URI in Settings before creating academic data.');
    err.statusCode = 428;
    throw err;
  }
  return runWithTenantStorage(context, fn, req.user, req.user?.institution);
}

router.get('/', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const classes = await withSchoolDb(req, async () => {
      const [list, totals] = await Promise.all([
        pop().where({ institutionId: req.user.institutionId }).sort({ createdAt: -1 }).lean(),
        Student.aggregate([{ $match: { institutionId: req.user.institutionId } }, { $group: { _id: '$classId', totalStudents: { $sum: 1 } } }]),
      ]);
      const counts = new Map(totals.map((x: any) => [String(x._id), x.totalStudents]));
      return list.map((x: any) => ({ ...x, totalStudents: counts.get(String(x._id)) || 0, status: x.isActive ? 'active' : 'inactive' }));
    });
    res.json({ classes });
  } catch (e: any) {
    res.status(e?.statusCode || 500).json({ message: readable(e), error: { name: e?.name, message: e?.message } });
  }
});

router.post('/', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const result = await withSchoolDb(req, async () => {
      const list = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.items) ? req.body.items : [req.body];
      const created: any[] = [];
      for (const raw of list) {
        const name = String(raw.name || req.body.name || '').trim();
        if (!name) {
          const err: any = new Error('Class name is required.');
          err.statusCode = 400;
          throw err;
        }
        const cls = await ClassModel.create({ name, grade: String(raw.grade || req.body.grade || gradeOf(name)).trim(), shift: okShift(raw.shift || req.body.shift), classTeacherId: raw.classTeacherId || req.body.classTeacherId || undefined, academicYear: String(raw.academicYear || req.body.academicYear || yearNow()).trim() || yearNow(), isActive: raw.isActive !== false, institutionId: req.user.institutionId });
        const sectionDocs = [];
        for (const sec of secs(raw.sections || req.body.sections)) sectionDocs.push(await Section.create({ ...sec, classId: cls._id, institutionId: req.user.institutionId }));
        await ClassModel.updateOne({ _id: cls._id, institutionId: req.user.institutionId }, { $set: { sections: sectionDocs.map((x: any) => x._id) } });
        created.push(await pop().where({ _id: cls._id, institutionId: req.user.institutionId }).findOne());
      }
      return Array.isArray(req.body) || Array.isArray(req.body?.items) ? { classItems: created } : { classItem: created[0] };
    });
    res.status(201).json(result);
  } catch (e: any) {
    res.status(e?.statusCode || (e?.name === 'ValidationError' ? 400 : 500)).json({ message: readable(e), error: { name: e?.name, message: e?.message, code: e?.code } });
  }
});

export default router;
