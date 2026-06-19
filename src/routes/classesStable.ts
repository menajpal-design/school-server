import express from 'express';
import { authenticate, canManageAcademic } from '../middleware/auth';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Student from '../models/Student';

const router = express.Router();
const currentYear = () => String(new Date().getFullYear());
const shiftOk = (v: any) => ['morning', 'day', 'evening'].includes(String(v)) ? String(v) : 'day';
const gradeOf = (name: any) => String(name || '').match(/\d+/)?.[0] || String(name || 'General').trim() || 'General';
const sectionsOf = (value: any) => (Array.isArray(value) && value.length ? value : [{ name: 'A', capacity: 30, currentStudents: 0, isActive: true }])
  .filter((x: any) => String(x?.name || '').trim())
  .map((x: any) => ({ name: String(x.name).trim(), capacity: Number(x.capacity) || 30, currentStudents: Number(x.currentStudents) || 0, isActive: x.isActive !== false }));
const classPop = () => ClassModel.find().populate('sections', 'name capacity currentStudents isActive').populate('classTeacherId', 'name email phone role');
const msg = (e: any) => e?.name === 'ValidationError' ? Object.values(e.errors || {}).map((x: any) => x?.message).join(', ') : e?.message || 'Class API failed';

router.get('/', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const [list, totals] = await Promise.all([
      classPop().where({ institutionId: req.user.institutionId }).sort({ createdAt: -1 }).lean(),
      Student.aggregate([{ $match: { institutionId: req.user.institutionId } }, { $group: { _id: '$classId', totalStudents: { $sum: 1 } } }]),
    ]);
    const count = new Map(totals.map((x: any) => [String(x._id), x.totalStudents]));
    const classes = list.map((x: any) => ({ ...x, totalStudents: count.get(String(x._id)) || 0, status: x.isActive ? 'active' : 'inactive' }));
    res.json({ classes });
  } catch (e: any) {
    res.status(500).json({ message: msg(e), error: { name: e?.name, message: e?.message } });
  }
});

router.post('/', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const rawList = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.items) ? req.body.items : [req.body];
    const created: any[] = [];
    for (const raw of rawList) {
      const name = String(raw.name || req.body.name || '').trim();
      if (!name) return res.status(400).json({ message: 'Class name is required.' });
      const classItem = await ClassModel.create({
        name,
        grade: String(raw.grade || req.body.grade || gradeOf(name)).trim(),
        shift: shiftOk(raw.shift || req.body.shift),
        classTeacherId: raw.classTeacherId || req.body.classTeacherId || undefined,
        academicYear: String(raw.academicYear || req.body.academicYear || currentYear()).trim() || currentYear(),
        isActive: raw.isActive !== false,
        institutionId: req.user.institutionId,
      });
      const sectionDocs = [];
      for (const sec of sectionsOf(raw.sections || req.body.sections)) {
        sectionDocs.push(await Section.create({ ...sec, classId: classItem._id, institutionId: req.user.institutionId }));
      }
      const ids = sectionDocs.map((x: any) => x._id);
      await ClassModel.updateOne({ _id: classItem._id, institutionId: req.user.institutionId }, { $set: { sections: ids } });
      created.push(await classPop().where({ _id: classItem._id, institutionId: req.user.institutionId }).findOne());
    }
    res.status(201).json(Array.isArray(req.body?.items) || Array.isArray(req.body) ? { classItems: created } : { classItem: created[0] });
  } catch (e: any) {
    res.status(e?.name === 'ValidationError' ? 400 : 500).json({ message: msg(e), error: { name: e?.name, message: e?.message, code: e?.code } });
  }
});

export default router;