import express from 'express';
import { authenticate, canManageAcademic } from '../middleware/auth';
import Subject from '../models/Subject';
import ClassModel from '../models/Class';
import User from '../models/User';
import Teacher from '../models/Teacher';

const router = express.Router();

const deriveCode = (value: any) => {
  const text = String(value || '').trim();
  if (!text) return `SUB${Date.now().toString().slice(-4)}`;
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').split(/\s+/).filter(Boolean).map((part) => part.slice(0, 3)).join('').slice(0, 10) || `SUB${Date.now().toString().slice(-4)}`;
};
const normalizeItems = (input: any) => Array.isArray(input) ? input : Array.isArray(input?.items) ? input.items : [input];
async function enrich(subjects: any[]) {
  const plain = subjects.map((subject: any) => typeof subject?.toObject === 'function' ? subject.toObject() : subject).filter(Boolean);
  const classIds = [...new Set(plain.map((item: any) => String(item.classId?._id || item.classId || '')).filter(Boolean))];
  const teacherIds = [...new Set(plain.map((item: any) => String(item.teacherId?._id || item.teacherId || '')).filter(Boolean))];
  const [classes, teachers] = await Promise.all([
    ClassModel.find({ _id: { $in: classIds } }).select('name grade academicYear isActive').lean(),
    User.find({ _id: { $in: teacherIds } }).select('name username email phone role').lean(),
  ]);
  const classMap = new Map(classes.map((item: any) => [String(item._id), item]));
  const teacherMap = new Map(teachers.map((item: any) => [String(item._id), item]));
  return plain.map((raw: any) => ({ ...raw, classId: classMap.get(String(raw.classId?._id || raw.classId || '')) || raw.classId, teacherId: teacherMap.get(String(raw.teacherId?._id || raw.teacherId || '')) || raw.teacherId }));
}

router.get('/', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    const raw = await Subject.find({ institutionId: req.user.institutionId }).sort({ createdAt: -1 }).lean();
    const subjects = await enrich(raw);
    res.json({ subjects, count: subjects.length });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to load subjects', error: { name: error?.name, message: error?.message } });
  }
});

router.post('/', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    const items = normalizeItems(req.body).filter((item: any) => String(item?.name || '').trim() && item?.classId);
    if (!items.length) return res.status(400).json({ message: 'Subject name and class are required.' });
    const created: any[] = [];
    for (const item of items) {
      const payload = {
        name: String(item.name || '').trim(),
        code: String(item.code || deriveCode(item.name)).trim().toUpperCase(),
        type: ['core', 'elective', 'optional'].includes(String(item.type)) ? item.type : 'core',
        classId: item.classId,
        teacherId: item.teacherId || undefined,
        description: item.description || '',
        creditHours: Number(item.creditHours) || 1,
        isActive: item.isActive !== false,
        institutionId: req.user.institutionId,
      };
      const subject = await Subject.findOneAndUpdate(
        { institutionId: req.user.institutionId, classId: payload.classId, code: payload.code },
        { $set: payload },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
      );
      await ClassModel.findOneAndUpdate({ _id: subject.classId, institutionId: req.user.institutionId }, { $addToSet: { subjects: subject._id } }).catch(() => undefined);
      if (subject.teacherId) await Teacher.findOneAndUpdate({ userId: subject.teacherId, institutionId: req.user.institutionId }, { $addToSet: { subjects: subject._id, assignedClasses: subject.classId } }).catch(() => undefined);
      created.push(subject);
    }
    const subjects = await enrich(created);
    const allRaw = await Subject.find({ institutionId: req.user.institutionId }).sort({ createdAt: -1 }).lean().catch(() => []);
    const allSubjects = await enrich(allRaw as any[]);
    res.status(201).json(Array.isArray(req.body) || Array.isArray(req.body?.items) ? { subjects, allSubjects } : { subject: subjects[0], subjects: allSubjects });
  } catch (error: any) {
    res.status(error?.name === 'ValidationError' ? 400 : 500).json({ message: error?.message || 'Failed to create subject', error: { name: error?.name, message: error?.message, code: error?.code } });
  }
});

router.put('/:id', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    const payload = {
      name: String(req.body.name || '').trim(),
      code: String(req.body.code || deriveCode(req.body.name)).toUpperCase(),
      type: ['core', 'elective', 'optional'].includes(String(req.body.type)) ? req.body.type : 'core',
      classId: req.body.classId,
      teacherId: req.body.teacherId || undefined,
      description: req.body.description || '',
      creditHours: Number(req.body.creditHours) || 1,
      isActive: req.body.isActive !== false,
      institutionId: req.user.institutionId,
    };
    const subject: any = await Subject.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, { $set: payload }, { new: true, runValidators: true });
    if (!subject) return res.status(404).json({ message: 'Subject not found' });
    await ClassModel.findOneAndUpdate({ _id: subject.classId, institutionId: req.user.institutionId }, { $addToSet: { subjects: subject._id } }).catch(() => undefined);
    if (subject.teacherId) await Teacher.findOneAndUpdate({ userId: subject.teacherId, institutionId: req.user.institutionId }, { $addToSet: { subjects: subject._id, assignedClasses: subject.classId } }).catch(() => undefined);
    const [item] = await enrich([subject]);
    res.json({ subject: item });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to update subject' });
  }
});

router.delete('/:id', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    const subject: any = await Subject.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!subject) return res.status(404).json({ message: 'Subject not found' });
    const subjectId = subject._id;
    await Subject.deleteOne({ _id: subjectId, institutionId: req.user.institutionId });
    await ClassModel.updateMany({ institutionId: req.user.institutionId }, { $pull: { subjects: subjectId } }).catch(() => undefined);
    await Teacher.updateMany({ institutionId: req.user.institutionId }, { $pull: { subjects: subjectId } }).catch(() => undefined);
    res.json({ message: 'Subject deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to delete subject' });
  }
});

export default router;
