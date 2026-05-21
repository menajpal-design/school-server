import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageAcademic } from '../middleware/auth';
import Exam from '../models/Exam';
import Subject from '../models/Subject';

const router = express.Router();
const examTypes = ['term', 'half-yearly', 'annual', 'midterm', 'final', 'quiz', 'assignment', 'project'];
const examStatuses = ['draft', 'scheduled', 'approved', 'published', 'completed'];

const isObjectId = (value: any) => mongoose.Types.ObjectId.isValid(String(value || ''));
const asDate = (value: any, fallback?: any) => {
  const date = value ? new Date(value) : fallback ? new Date(fallback) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const populateExam = () => Exam.find()
  .populate('classId', 'name grade academicYear')
  .populate('sectionId', 'name')
  .populate('subjectId', 'name code')
  .populate('subjectMarks.subjectId', 'name code classId')
  .populate('createdBy', 'name email role');

const normalizeSubjectMarks = async (items: any[] = [], institutionId: any) => {
  const valid = items.filter((item) => item?.subjectId && isObjectId(item.subjectId));
  const ids = [...new Set(valid.map((item) => String(item.subjectId)))];
  const subjects = await Subject.find({ _id: { $in: ids }, institutionId }).select('_id name code classId').lean();
  const subjectIds = new Set(subjects.map((subject: any) => String(subject._id)));
  return valid
    .filter((item) => subjectIds.has(String(item.subjectId)))
    .map((item) => ({
      subjectId: item.subjectId,
      date: asDate(item.date),
      duration: Number(item.duration) || 120,
      totalMarks: Number(item.totalMarks) || 100,
      passingMarks: Number(item.passingMarks) || 33,
    }));
};

const normalizePayload = async (req: any) => {
  const subjectMarks = await normalizeSubjectMarks(req.body.subjectMarks || [], req.user.institutionId);
  const startDate = subjectMarks[0]?.date || asDate(req.body.startDate);
  const endDate = subjectMarks[subjectMarks.length - 1]?.date || asDate(req.body.endDate || req.body.startDate);
  const firstSubject = subjectMarks[0]?.subjectId;
  const isPublished = req.body.isPublished === true && subjectMarks.length > 0;
  return {
    name: String(req.body.name || 'Exam').trim(),
    type: examTypes.includes(String(req.body.type)) ? req.body.type : 'term',
    classId: req.body.classId,
    sectionId: req.body.sectionId || undefined,
    subjectId: firstSubject || undefined,
    startDate,
    endDate,
    date: startDate,
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
};

router.use(authenticate, canManageAcademic());

router.get('/', async (req: any, res) => {
  try {
    const query: any = { institutionId: req.user.institutionId };
    if (req.query.classId) query.classId = req.query.classId;
    const exams = await populateExam().where(query).sort({ startDate: -1, createdAt: -1 }).lean();
    res.json({ exams });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to load exams', error: { name: error?.name, message: error?.message } });
  }
});

router.get('/:id', async (req: any, res) => {
  try {
    const exam = await populateExam().where({ _id: req.params.id, institutionId: req.user.institutionId }).findOne().lean();
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.json({ exam });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to load exam' });
  }
});

router.post('/', async (req: any, res) => {
  try {
    if (!req.body.classId || !isObjectId(req.body.classId)) return res.status(400).json({ message: 'Valid class is required.' });
    const payload = await normalizePayload(req);
    const exam = await Exam.create({ ...payload, createdBy: req.user._id });
    const created = await populateExam().where({ _id: exam._id, institutionId: req.user.institutionId }).findOne();
    res.status(201).json({ exam: created, message: 'Exam saved successfully' });
  } catch (error: any) {
    res.status(error?.name === 'ValidationError' ? 400 : 500).json({ message: error?.message || 'Failed to create exam', error: { name: error?.name, message: error?.message } });
  }
});

router.put('/:id', async (req: any, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid exam id.' });
    const exists = await Exam.exists({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!exists) return res.status(404).json({ message: 'Exam not found. Please refresh exam list and select the saved exam again.' });
    const payload = await normalizePayload(req);
    const updatedDoc = await Exam.findOneAndUpdate(
      { _id: req.params.id, institutionId: req.user.institutionId },
      { $set: payload },
      { new: true, runValidators: true, context: 'query' }
    );
    if (!updatedDoc) return res.status(404).json({ message: 'Exam not found after update. Please refresh and try again.' });
    const updated = await populateExam().where({ _id: updatedDoc._id, institutionId: req.user.institutionId }).findOne();
    res.json({ exam: updated, message: 'Exam updated successfully' });
  } catch (error: any) {
    const message = error?.name === 'VersionError' ? 'Exam update conflict fixed route hit old server. Please redeploy server and try again.' : (error?.message || 'Failed to update exam');
    res.status(error?.name === 'ValidationError' ? 400 : 500).json({ message, error: { name: error?.name, message: error?.message } });
  }
});

router.patch('/:id/public-routine', async (req: any, res) => {
  try {
    if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid exam id.' });
    const exam: any = await Exam.findOne({ _id: req.params.id, institutionId: req.user.institutionId }).lean();
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    const subjectMarks = Array.isArray(exam.subjectMarks) ? exam.subjectMarks : [];
    const ready = subjectMarks.length > 0 && subjectMarks.every((item: any) => item.subjectId && item.date && item.duration);
    if (req.body.isPublished === true && !ready) return res.status(409).json({ message: 'Routine is incomplete. Add subject, date and duration before publishing.' });
    const nextStatus = req.body.isPublished === true && ['draft', 'scheduled', 'approved'].includes(exam.status) ? 'published' : exam.status;
    const updatedDoc = await Exam.findOneAndUpdate(
      { _id: req.params.id, institutionId: req.user.institutionId },
      { $set: { isPublished: req.body.isPublished === true, status: nextStatus } },
      { new: true, runValidators: true, context: 'query' }
    );
    if (!updatedDoc) return res.status(404).json({ message: 'Exam not found after publish update.' });
    const updated = await populateExam().where({ _id: updatedDoc._id, institutionId: req.user.institutionId }).findOne();
    res.json({ exam: updated, message: updatedDoc.isPublished ? 'Exam routine is now public.' : 'Exam routine is now private.' });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to update public exam routine status' });
  }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    await exam.deleteOne();
    res.json({ message: 'Exam deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to delete exam' });
  }
});

export default router;