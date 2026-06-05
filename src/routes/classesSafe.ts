import express from 'express';
import { authenticate } from '../middleware/auth';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Student from '../models/Student';
import { requireAction, resolveActorScope, scopedClassQuery } from '../services/permissionPolicy';

const router = express.Router();
const currentYear = () => String(new Date().getFullYear());
const cleanShift = (v: any) => ['morning', 'day', 'evening'].includes(String(v)) ? String(v) : 'day';
const cleanGrade = (name: any) => String(name || '').match(/\d+/)?.[0] || String(name || 'General').trim() || 'General';
const cleanSections = (v: any) => (Array.isArray(v) && v.length ? v : [{ name: 'A', capacity: 30, currentStudents: 0, isActive: true }])
  .filter((s: any) => String(s?.name || '').trim())
  .map((s: any) => ({ name: String(s.name).trim(), capacity: Number(s.capacity) || 30, currentStudents: Number(s.currentStudents) || 0, isActive: s.isActive !== false }));
const message = (e: any) => e?.name === 'ValidationError' ? Object.values(e.errors || {}).map((x: any) => (x as any)?.message).join(', ') : e?.message || 'Class API failed';

async function withSections(items: any[]) {
  const ids = items.flatMap((x: any) => Array.isArray(x.sections) ? x.sections : []).map(String);
  if (!ids.length) return items;
  const sections = await Section.find({ _id: { $in: ids } }).select('name capacity currentStudents isActive classId').lean();
  const map = new Map(sections.map((x: any) => [String(x._id), x]));
  return items.map((x: any) => ({ ...x, sections: (x.sections || []).map((id: any) => map.get(String(id))).filter(Boolean) }));
}

router.get('/', authenticate, async (req: any, res) => {
  try {
    const scope = await resolveActorScope(req.user);
    const classQuery = scopedClassQuery(scope, { institutionId: req.user.institutionId });
    if (!classQuery) return res.json({ classes: [] });
    const [raw, totals] = await Promise.all([
      ClassModel.find(classQuery).sort({ createdAt: -1 }).lean(),
      Student.aggregate([{ $match: { institutionId: req.user.institutionId } }, { $group: { _id: '$classId', totalStudents: { $sum: 1 } } }]),
    ]);
    const classes = await withSections(raw);
    const count = new Map(totals.map((x: any) => [String(x._id), x.totalStudents]));
    res.json({ classes: classes.map((x: any) => ({ ...x, totalStudents: count.get(String(x._id)) || 0, status: x.isActive ? 'active' : 'inactive' })) });
  } catch (e: any) {
    res.status(500).json({ message: message(e), error: { name: e?.name, message: e?.message } });
  }
});

router.post('/', authenticate, requireAction('class:create'), async (req: any, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : Array.isArray(req.body?.items) ? req.body.items : [req.body];
    const created: any[] = [];
    for (const raw of items) {
      const name = String(raw.name || req.body.name || '').trim();
      if (!name) return res.status(400).json({ message: 'Class name is required.' });
      const cls = await ClassModel.create({ name, grade: String(raw.grade || req.body.grade || cleanGrade(name)).trim(), shift: cleanShift(raw.shift || req.body.shift), classTeacherId: raw.classTeacherId || req.body.classTeacherId || undefined, academicYear: String(raw.academicYear || req.body.academicYear || currentYear()).trim() || currentYear(), isActive: raw.isActive !== false, institutionId: req.user.institutionId });
      const sectionDocs = [];
      for (const sec of cleanSections(raw.sections || req.body.sections)) sectionDocs.push(await Section.create({ ...sec, classId: cls._id, institutionId: req.user.institutionId }));
      await ClassModel.updateOne({ _id: cls._id, institutionId: req.user.institutionId }, { $set: { sections: sectionDocs.map((x: any) => x._id) } });
      const doc = await ClassModel.findOne({ _id: cls._id, institutionId: req.user.institutionId }).lean();
      created.push((await withSections([doc]))[0]);
    }
    res.status(201).json(Array.isArray(req.body) || Array.isArray(req.body?.items) ? { classItems: created } : { classItem: created[0] });
  } catch (e: any) {
    res.status(e?.name === 'ValidationError' ? 400 : 500).json({ message: message(e), error: { name: e?.name, message: e?.message, code: e?.code } });
  }
});

export default router;
