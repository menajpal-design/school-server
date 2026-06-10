import express from 'express';
import { authenticate } from '../middleware/auth';
import Exam from '../models/Exam';
import Subject from '../models/Subject';
import { examReadScope, examManageGuard, examPublishGuard } from '../services/permissionPolicy';

const router = express.Router();
const examTypes = ['term', 'half-yearly', 'annual', 'midterm', 'final', 'quiz', 'assignment', 'project'];
const examStatuses = ['draft', 'scheduled', 'approved', 'published', 'completed'];
const isValidId = (value: any) => /^[a-f\d]{24}$/i.test(String(value || ''));
const toDate = (value: any, fallback?: any) => {
  const date = value ? new Date(value) : fallback ? new Date(fallback) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const populateExam = () => Exam.find()
  .populate('classId', 'name grade academicYear')
  .populate('sectionId', 'name')
  .populate('subjectId', 'name code')
  .populate('subjectMarks.subjectId', 'name code classId')
  .populate('createdBy', 'name email role');

async function normalizePayload(req: any) {
  const rawMarks = Array.isArray(req.body.subjectMarks) ? req.body.subjectMarks : [];
  const subjectIds = [...new Set(rawMarks.map((item: any) => String(item?.subjectId || '')).filter(isValidId))];
  const subjects = await Subject.find({ _id: { $in: subjectIds }, institutionId: req.user.institutionId }).select('_id').lean();
  const allowedSubjectIds = new Set(subjects.map((item: any) => String(item._id)));
  const subjectMarks = rawMarks
    .filter((item: any) => allowedSubjectIds.has(String(item?.subjectId)))
    .map((item: any) => ({
      subjectId: item.subjectId,
      date: toDate(item.date),
      duration: Number(item.duration) || 120,
      totalMarks: Number(item.totalMarks) || 100,
      passingMarks: Number(item.passingMarks) || 33,
      isCompleted: item.isCompleted === true,
      completedAt: item.completedAt ? toDate(item.completedAt) : undefined,
      resultEntryEnabled: item.resultEntryEnabled === true,
    }));
  const firstSubject = subjectMarks[0]?.subjectId;
  const isPublished = req.body.isPublished === true && subjectMarks.length > 0;
  return {
    name: String(req.body.name || 'Exam').trim(),
    type: examTypes.includes(String(req.body.type)) ? req.body.type : 'term',
    classId: req.body.classId,
    sectionId: req.body.sectionId || undefined,
    subjectId: firstSubject || undefined,
    startDate: subjectMarks[0]?.date || toDate(req.body.startDate),
    endDate: subjectMarks[subjectMarks.length - 1]?.date || toDate(req.body.endDate || req.body.startDate),
    date: subjectMarks[0]?.date || toDate(req.body.startDate),
    duration: subjectMarks[0]?.duration || Number(req.body.duration) || 120,
    totalMarks: subjectMarks[0]?.totalMarks || Number(req.body.totalMarks) || 100,
    passingMarks: subjectMarks[0]?.passingMarks || Number(req.body.passingMarks) || 33,
    subjectMarks,
    approvalRequired: req.body.approvalRequired === true,
    status: examStatuses.includes(String(req.body.status)) ? req.body.status : (isPublished ? 'published' : 'scheduled'),
    syllabus: req.body.syllabus || '',
    instructions: req.body.instructions || '',
    isPublished,
    institutionId: req.user.institutionId,
  };
}

router.use(authenticate);

router.get('/', async (req: any, res) => {
  try {
    const base: any = { institutionId: req.user.institutionId };
    if (req.query.classId) base.classId = req.query.classId;
    const query = await examReadScope(req.user, base);
    if (!query) return res.status(403).json({ message: 'Access denied. No exam scope found for this user.' });
    const exams = await populateExam().where(query).sort({ startDate: -1, createdAt: -1 }).lean();
    res.json({ exams });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load exams', error });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const query = await examReadScope(req.user, { institutionId: req.user.institutionId, _id: req.params.id });
    if (!query) return res.status(403).json({ message: 'Access denied. No exam scope found for this user.' });
    const exam = await populateExam().where(query).findOne().lean();
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.json({ exam });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load exam', error });
  }
});

router.post('/', examManageGuard, async (req: any, res) => {
  try {
    if (!isValidId(req.body.classId)) return res.status(400).json({ message: 'Valid class is required.' });
    const payload = await normalizePayload(req);
    const exam = await Exam.create({ ...payload, createdBy: req.user._id });
    const created = await populateExam().where({ _id: exam._id, institutionId: req.user.institutionId }).findOne();
    res.status(201).json({ exam: created, message: 'Exam saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create exam', error });
  }
});

router.put('/:id', examManageGuard, async (req: any, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid exam id.' });
    const payload = await normalizePayload(req);
    const updatedDoc = await Exam.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, { $set: payload }, { new: true, runValidators: true, context: 'query' });
    if (!updatedDoc) return res.status(404).json({ message: 'Exam not found.' });
    const updated = await populateExam().where({ _id: updatedDoc._id, institutionId: req.user.institutionId }).findOne();
    res.json({ exam: updated, message: 'Exam updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update exam', error });
  }
});

router.patch('/:id/subjects/:subjectId/complete', examManageGuard, async (req: any, res) => {
  try {
    if (!isValidId(req.params.id) || !isValidId(req.params.subjectId)) return res.status(400).json({ message: 'Invalid exam or subject id.' });
    const complete = req.body?.complete !== false;
    const exam: any = await Exam.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!exam) return res.status(404).json({ message: 'Exam not found.' });
    const marks = Array.isArray(exam.subjectMarks) ? exam.subjectMarks : [];
    const item = marks.find((mark: any) => String(mark.subjectId) === String(req.params.subjectId));
    if (!item) return res.status(404).json({ message: 'Subject schedule not found in this exam.' });
    item.isCompleted = complete;
    item.resultEntryEnabled = complete;
    item.completedAt = complete ? new Date() : undefined;
    const allCompleted = marks.length > 0 && marks.every((mark: any) => mark.isCompleted === true);
    exam.status = allCompleted ? 'completed' : (exam.status === 'completed' ? 'scheduled' : exam.status);
    await exam.save();
    const updated = await populateExam().where({ _id: exam._id, institutionId: req.user.institutionId }).findOne();
    res.json({ exam: updated, message: complete ? 'Subject exam marked as completed. Result entry enabled.' : 'Subject completion removed.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update subject completion', error });
  }
});

router.patch('/:id/public-routine', examPublishGuard, async (req: any, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid exam id.' });
    const exam: any = await Exam.findOne({ _id: req.params.id, institutionId: req.user.institutionId }).lean();
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    const marks = Array.isArray(exam.subjectMarks) ? exam.subjectMarks : [];
    const ready = marks.length > 0 && marks.every((item: any) => item.subjectId && item.date && item.duration);
    if (req.body.isPublished === true && !ready) return res.status(409).json({ message: 'Routine is incomplete. Add subject, date and duration before publishing.' });
    const nextStatus = req.body.isPublished === true && ['draft', 'scheduled', 'approved'].includes(exam.status) ? 'published' : exam.status;
    const updatedDoc = await Exam.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, { $set: { isPublished: req.body.isPublished === true, status: nextStatus } }, { new: true, runValidators: true, context: 'query' });
    const updated = await populateExam().where({ _id: updatedDoc?._id, institutionId: req.user.institutionId }).findOne();
    res.json({ exam: updated, message: updatedDoc?.isPublished ? 'Exam routine is now public.' : 'Exam routine is now private.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update public exam routine status', error });
  }
});

router.delete('/:id', examManageGuard, async (req: any, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    await exam.deleteOne();
    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete exam', error });
  }
});

export default router;
