import express from 'express';
import { authenticate, normalizeRole } from '../middleware/auth';
import Exam from '../models/Exam';
import Result from '../models/Result';
import Student from '../models/Student';
import ClassModel from '../models/Class';
import { resolveActorScope } from '../services/permissionPolicy';

const router = express.Router();
const id = (value: any) => String(value?._id || value || '');
const examYear = (exam: any, fallback?: any) => {
  const explicit = Number(fallback || exam?.year || exam?.academicYear);
  if (explicit > 1900) return explicit;
  const date = exam?.startDate || exam?.date || exam?.endDate;
  if (date) { const parsed = new Date(date); if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear(); }
  return new Date().getFullYear();
};
const isFinalExam = (exam: any) => /final|annual|yearly/i.test(`${exam?.name || ''} ${exam?.type || ''}`);

async function assertClassTeacher(req: any, classId: any) {
  const scope = await resolveActorScope(req.user);
  const role = normalizeRole(req.user?.role);
  if (scope.isSchoolLeader || scope.isSystemAdmin) return scope;
  if (role !== 'class_teacher') throw Object.assign(new Error('Only class teacher/head can use class-level result workflow.'), { status: 403 });
  if (!scope.assignedClassIds.includes(id(classId))) throw Object.assign(new Error('Access denied. You can only request result publish for your own class.'), { status: 403 });
  return scope;
}

async function classExamContext(req: any) {
  const classId = req.body.classId || req.query.classId;
  const examId = req.body.examId || req.query.examId;
  if (!classId) throw Object.assign(new Error('classId is required.'), { status: 400 });
  if (!examId) throw Object.assign(new Error('examId is required.'), { status: 400 });
  await assertClassTeacher(req, classId);
  const exam: any = await Exam.findOne({ _id: examId, institutionId: req.user.institutionId }).lean();
  if (!exam) throw Object.assign(new Error('Exam not found.'), { status: 404 });
  const year = examYear(exam, req.body.year || req.query.year);
  const students = await Student.find({ institutionId: req.user.institutionId, classId, isActive: { $ne: false } }).select('_id classId rollNumber').lean();
  const studentIds = students.map((student: any) => student._id);
  const subjectIds = (exam.subjectMarks || []).map((item: any) => item.subjectId).filter(Boolean);
  if (!subjectIds.length) throw Object.assign(new Error('Exam subject setup is empty.'), { status: 409 });
  const results = await Result.find({ institutionId: req.user.institutionId, examId, year, studentId: { $in: studentIds }, subjectId: { $in: subjectIds } }).lean();
  const resultKeySet = new Set(results.map((result: any) => `${id(result.studentId)}:${id(result.subjectId)}`));
  const missing: any[] = [];
  for (const student of students) for (const subjectId of subjectIds) if (!resultKeySet.has(`${id(student._id)}:${id(subjectId)}`)) missing.push({ studentId: student._id, subjectId });
  return { classId, exam, examId, year, students, studentIds, subjectIds, results, missing };
}

async function promoteNextClass(req: any, classId: any, studentIds: any[]) {
  const current: any = await ClassModel.findOne({ _id: classId, institutionId: req.user.institutionId }).lean();
  if (!current) return { promoted: 0, reason: 'Current class not found' };
  const currentGrade = Number(current.grade || String(current.name || '').match(/\d+/)?.[0] || 0);
  if (!currentGrade) return { promoted: 0, reason: 'Current class grade not numeric' };
  const next = await ClassModel.findOne({ institutionId: req.user.institutionId, isActive: { $ne: false }, $or: [{ grade: String(currentGrade + 1) }, { name: new RegExp(`\\b${currentGrade + 1}\\b`, 'i') }] }).lean();
  if (!next) return { promoted: 0, reason: 'Next class not found' };
  const update = await Student.updateMany({ _id: { $in: studentIds }, institutionId: req.user.institutionId }, { $set: { classId: next._id } });
  return { promoted: update.modifiedCount || 0, fromClass: current.name, toClass: next.name };
}

router.use(authenticate);

router.post('/request-publish', async (req: any, res) => {
  try {
    const ctx = await classExamContext(req);
    if (ctx.missing.length) return res.status(409).json({ message: 'Cannot request publish. Some subject marks are missing.', missingCount: ctx.missing.length });
    await Result.updateMany({ institutionId: req.user.institutionId, examId: ctx.examId, year: ctx.year, studentId: { $in: ctx.studentIds }, subjectId: { $in: ctx.subjectIds }, workflowStatus: { $ne: 'published' } }, { $set: { workflowStatus: 'review' } });
    res.json({ message: 'Class result submitted for publish approval.', year: ctx.year, students: ctx.students.length, subjects: ctx.subjectIds.length });
  } catch (error: any) { res.status(error?.status || 500).json({ message: error?.message || 'Failed to request class result publish', error }); }
});

router.post('/publish-final', async (req: any, res) => {
  try {
    const role = normalizeRole(req.user?.role);
    if (!['head', 'assistant_head', 'admin', 'super_admin'].includes(role)) return res.status(403).json({ message: 'Only Head/Admin can publish final class result.' });
    const ctx = await classExamContext(req);
    if (ctx.missing.length) return res.status(409).json({ message: 'Cannot publish. Some subject marks are missing.', missingCount: ctx.missing.length });
    const hasUnapproved = ctx.results.some((result: any) => !['approved', 'published'].includes(result.workflowStatus));
    if (hasUnapproved) return res.status(409).json({ message: 'Head approval is required before final publish.' });
    await Result.updateMany({ institutionId: req.user.institutionId, examId: ctx.examId, year: ctx.year, studentId: { $in: ctx.studentIds }, subjectId: { $in: ctx.subjectIds } }, { $set: { workflowStatus: 'published', publishedBy: req.user._id, publishedAt: new Date() } });
    const promotion = isFinalExam(ctx.exam) ? await promoteNextClass(req, ctx.classId, ctx.studentIds) : { promoted: 0, reason: 'Not final/annual exam' };
    res.json({ message: 'Class result published.', year: ctx.year, promotion });
  } catch (error: any) { res.status(error?.status || 500).json({ message: error?.message || 'Failed to publish final class result', error }); }
});

export default router;
