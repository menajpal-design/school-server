import express from 'express';
import { authenticate, normalizeRole } from '../middleware/auth';
import QuestionBank from '../models/QuestionBank';
import Student from '../models/Student';

const router = express.Router();
const manageRoles = ['head', 'assistant_head', 'teacher', 'class_teacher', 'subject_teacher'];
const practiceRoles = [...manageRoles, 'student', 'parent'];
const canManage = (role: string) => manageRoles.includes(normalizeRole(role));
const canPractice = (role: string) => practiceRoles.includes(normalizeRole(role));

const sampleQuestions = (body: any) => {
  const count = Math.max(1, Math.min(100, Number(body.count || 10)));
  return Array.from({ length: count }).map((_, i) => ({
    type: body.mode === 'question' ? 'short' : 'mcq',
    question: `${i + 1}. ${body.subjectName || body.subject || 'Subject'} - ${body.syllabus || 'syllabus'} question?`,
    options: body.mode === 'question' ? [] : ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'],
    answer: body.mode === 'question' ? '' : 'A',
    marks: Number(body.markPerQuestion || 1),
  }));
};

router.post('/generate', authenticate, async (req: any, res) => {
  if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only teacher, head or assistant head can generate questions.' });
  return res.json({ source: 'server-fallback', questions: sampleQuestions(req.body || {}) });
});

router.get('/sets', authenticate, async (req: any, res) => {
  try {
    if (!canPractice(req.user.role)) return res.status(403).json({ message: 'Access denied.' });
    const q: any = { institutionId: req.user.institutionId };
    if (req.query.mode) q.mode = req.query.mode;
    if (req.query.classId) q.classId = req.query.classId;
    if (req.query.subjectId) q.subjectId = req.query.subjectId;
    if (!canManage(req.user.role)) q.isPublished = true;
    const sets = await QuestionBank.find(q).populate('classId', 'name grade').populate('subjectId', 'name code').sort({ createdAt: -1 }).lean();
    return res.json({ sets });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load question sets', error });
  }
});

router.post('/sets', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only teacher, head or assistant head can save question sets.' });
    const body = req.body || {};
    const questions = Array.isArray(body.questions) && body.questions.length ? body.questions : sampleQuestions(body);
    const set = await QuestionBank.create({
      title: String(body.title || `${body.className || 'Class'} ${body.subjectName || body.subject || 'Subject'} Question Set`).trim(),
      mode: body.mode === 'question' ? 'question' : 'mcq',
      classId: body.classId || undefined,
      subjectId: body.subjectId || undefined,
      className: body.className,
      subjectName: body.subjectName || body.subject,
      syllabus: body.syllabus,
      duration: body.duration || '30 minutes',
      totalMarks: Number(body.totalMarks || questions.length),
      rollRequired: body.rollRequired !== false,
      isPublished: body.isPublished === true,
      questions,
      createdBy: req.user._id,
      institutionId: req.user.institutionId,
    });
    return res.status(201).json({ message: 'Question set saved.', set });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to save question set', error });
  }
});

router.patch('/sets/:id/publish', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only teacher, head or assistant head can publish MCQ.' });
    const set = await QuestionBank.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, { isPublished: req.body?.isPublished !== false }, { new: true });
    if (!set) return res.status(404).json({ message: 'Question set not found.' });
    return res.json({ message: 'Publish status updated.', set });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to publish question set', error });
  }
});

router.post('/sets/:id/mark', authenticate, async (req: any, res) => {
  try {
    if (!canPractice(req.user.role)) return res.status(403).json({ message: 'Access denied.' });
    const set: any = await QuestionBank.findOne({ _id: req.params.id, institutionId: req.user.institutionId }).lean();
    if (!set) return res.status(404).json({ message: 'Question set not found.' });
    const answers = { ...(req.body.answers || {}) };
    String(req.body.answersText || req.body.scanText || '').toUpperCase().split(/[\s,;]+/).filter(Boolean).forEach((token) => {
      const match = token.match(/^(\d+)[\.:-]?([A-D])$/);
      if (match) answers[match[1]] = match[2];
    });
    let score = 0;
    const details = (set.questions || []).map((q: any, i: number) => {
      const key = String(i + 1);
      const expected = String(q.answer || '').toUpperCase().replace(/[^A-D]/g, '').slice(0, 1);
      const given = String(answers[key] || '').toUpperCase().replace(/[^A-D]/g, '').slice(0, 1);
      const correct = Boolean(expected && given === expected);
      const marks = correct ? Number(q.marks || 1) : 0;
      score += marks;
      return { questionNo: i + 1, given, expected, correct, marks };
    });
    return res.json({ rollNumber: req.body.rollNumber || '', total: set.questions.length, score, details });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to mark MCQ', error });
  }
});

router.get('/practice/me', authenticate, async (req: any, res) => {
  try {
    if (!canPractice(req.user.role)) return res.status(403).json({ message: 'Access denied.' });
    const q: any = { institutionId: req.user.institutionId, mode: 'mcq', isPublished: true };
    if (normalizeRole(req.user.role) === 'student') {
      const student: any = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
      if (student?.classId) q.classId = student.classId;
    }
    const sets = await QuestionBank.find(q).select('-questions.answer').populate('classId', 'name grade').populate('subjectId', 'name code').sort({ createdAt: -1 }).lean();
    return res.json({ sets });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load practice MCQ', error });
  }
});

export default router;
