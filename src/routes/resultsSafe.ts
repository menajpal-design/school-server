import express from 'express';
import { authenticate, normalizeRole } from '../middleware/auth';
import Exam from '../models/Exam';
import Result from '../models/Result';
import Student from '../models/Student';
import { resultEntryGuard, resultApproveGuard, resultPublishGuard, resultDeleteGuard, resolveActorScope, assignedSubjectResultScope } from '../services/permissionPolicy';
import { sendResultSMS } from '../utils/sms';

const router = express.Router();
const entryRoles = ['teacher', 'subject_teacher', 'class_teacher', 'head', 'admin', 'super_admin'];
const blockedRoles = ['student', 'parent', 'staff', 'finance_officer', 'librarian', 'committee_member'];

const getGrade = (marks: number | undefined, totalMarks: number) => {
  if (marks === undefined || marks === null || Number.isNaN(marks)) return undefined;
  const p = totalMarks ? (marks / totalMarks) * 100 : 0;
  if (p >= 80) return 'A+';
  if (p >= 70) return 'A';
  if (p >= 60) return 'A-';
  if (p >= 50) return 'B';
  if (p >= 40) return 'C';
  if (p >= 33) return 'D';
  return 'F';
};

const getExamYear = (exam: any, fallback?: any) => {
  const explicit = Number(fallback || exam?.year || exam?.academicYear);
  if (explicit && explicit > 1900) return explicit;
  const date = exam?.startDate || exam?.date || exam?.endDate;
  if (date) {
    const parsed = new Date(date);
    if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear();
  }
  return new Date().getFullYear();
};

const assertEntryScope = async (req: any, res: any, classId?: any, subjectId?: any) => {
  const scoped = await assignedSubjectResultScope(req.user, classId, subjectId);
  if (!scoped.allowed) {
    res.status(403).json({ message: 'Access denied. You can only work with assigned class and assigned subject.' });
    return false;
  }
  return true;
};

const resultSetup = async (req: any, resultLike: any) => {
  const exam: any = await Exam.findOne({ _id: resultLike.examId, institutionId: req.user.institutionId }).lean();
  if (!exam) return null;
  const setup = exam?.subjectMarks?.find((item: any) => String(item.subjectId) === String(resultLike.subjectId));
  const totalMarks = Number(setup?.totalMarks || exam?.totalMarks || 100);
  const passingMarks = Number(setup?.passingMarks || exam?.passingMarks || 33);
  const year = getExamYear(exam, resultLike.year);
  return { exam, totalMarks, passingMarks, year };
};

const getResultContext = async (req: any) => {
  const { classId, sectionId, examId, subjectId, year } = req.query;
  const scope = await resolveActorScope(req.user);
  const query: any = { institutionId: req.user.institutionId, isActive: true };
  if (classId) query.classId = classId;
  if (sectionId) query.sectionId = sectionId;

  if (!scope.isSchoolLeader && !scope.isSystemAdmin) {
    if (blockedRoles.includes(req.user.role)) throw Object.assign(new Error('Access denied.'), { status: 403 });
    if (scope.assignedClassIds.length) query.classId = { $in: scope.assignedClassIds };
    else throw Object.assign(new Error('No assigned class scope found.'), { status: 403 });
  }

  const resultQuery: any = { institutionId: req.user.institutionId };
  if (examId) resultQuery.examId = examId;
  if (subjectId) resultQuery.subjectId = subjectId;
  if (year) resultQuery.year = Number(year);
  if (!scope.isSchoolLeader && !scope.isSystemAdmin && scope.assignedSubjectIds.length) resultQuery.subjectId = { $in: subjectId ? [subjectId] : scope.assignedSubjectIds };

  const [students, results, exam] = await Promise.all([
    Student.find(query).populate('userId', 'name email').populate('sectionId', 'name').sort({ rollNumber: 1 }).lean(),
    examId && subjectId ? Result.find(resultQuery).populate('studentId', 'rollNumber').lean() : Promise.resolve([]),
    examId ? Exam.findOne({ _id: examId, institutionId: req.user.institutionId }).populate('subjectMarks.subjectId', 'name code').lean() : Promise.resolve(null),
  ]);

  const resultByStudent = new Map((results as any[]).map((result) => [String(result.studentId?._id || result.studentId), result]));
  const subjectSetup = (exam as any)?.subjectMarks?.find((item: any) => String(item.subjectId?._id || item.subjectId) === String(subjectId));
  const totalMarks = Number(subjectSetup?.totalMarks || (exam as any)?.totalMarks || 100);
  const passingMarks = Number(subjectSetup?.passingMarks || (exam as any)?.passingMarks || 33);
  const rows = students.map((student: any) => {
    const result = resultByStudent.get(String(student._id));
    return { studentId: student._id, resultId: result?._id, rollNumber: student.rollNumber, studentName: student.userId?.name || 'Unnamed student', section: student.sectionId?.name || '', year: result?.year || getExamYear(exam), marksObtained: result?.marksObtained, grade: result?.grade, remarks: result?.remarks || '', isPassed: result?.isPassed, workflowStatus: result?.workflowStatus || 'draft' };
  });
  const statuses = rows.map((row: any) => row.workflowStatus);
  const workflowStatus = statuses.includes('published') ? 'published' : statuses.includes('approved') ? 'approved' : statuses.includes('review') ? 'review' : 'draft';
  const missingMarks = rows.filter((row: any) => row.marksObtained === undefined || row.marksObtained === null || row.marksObtained === '').length;
  return { rows, exam, year: getExamYear(exam), marksSetup: { totalMarks, passingMarks }, workflowStatus, missingMarks };
};

const updateResultWorkflow = async (req: any, workflowStatus: 'review' | 'approved' | 'published') => {
  const { examId, subjectId } = req.body;
  const setup = examId && subjectId ? await resultSetup(req, req.body) : null;
  const filter: any = { institutionId: req.user.institutionId, examId, subjectId };
  if (req.body.year) filter.year = Number(req.body.year);
  const update: any = { workflowStatus };
  if (setup?.year) update.year = setup.year;
  if (workflowStatus === 'approved' && req.body.approvalStage === 'assistant') {
    update.workflowStatus = 'review';
    update.assistantHeadApprovedBy = req.user._id;
    update.assistantHeadApprovedAt = new Date();
  }
  if (workflowStatus === 'approved' && req.body.approvalStage === 'head') {
    update.workflowStatus = 'approved';
    update.headApprovedBy = req.user._id;
    update.headApprovedAt = new Date();
  }
  if (workflowStatus === 'published') {
    update.publishedBy = req.user._id;
    update.publishedAt = new Date();
  }
  return Result.updateMany(filter, update);
};

router.use(authenticate);

router.get('/', async (req: any, res) => {
  try {
    const userRole = normalizeRole(req.user.role);
    if (['student', 'parent'].includes(userRole)) return res.status(403).json({ message: 'Use /api/academic/results/me for own or linked child results.' });
    if (!entryRoles.includes(userRole) && !['assistant_head'].includes(userRole)) return res.status(403).json({ message: 'Access denied. This role cannot access result management.' });
    if (req.query.classId || req.query.examId || req.query.subjectId) {
      if (!(await assertEntryScope(req, res, req.query.classId, req.query.subjectId))) return;
      return res.json(await getResultContext(req));
    }
    const scope = await resolveActorScope(req.user);
    const query: any = { institutionId: req.user.institutionId };
    if (req.query.year) query.year = Number(req.query.year);
    if (!scope.isSchoolLeader && !scope.isSystemAdmin) {
      if (!scope.assignedClassIds.length && !scope.assignedSubjectIds.length) return res.status(403).json({ message: 'No assigned result scope found.' });
      const studentIds = scope.assignedClassIds.length ? (await Student.find({ institutionId: req.user.institutionId, classId: { $in: scope.assignedClassIds } }).select('_id').lean()).map((s: any) => s._id) : [];
      query.$or = [];
      if (studentIds.length) query.$or.push({ studentId: { $in: studentIds } });
      if (scope.assignedSubjectIds.length) query.$or.push({ subjectId: { $in: scope.assignedSubjectIds } });
      if (!query.$or.length) return res.status(403).json({ message: 'No assigned result scope found.' });
    }
    const results = await Result.find(query).populate('studentId', 'rollNumber classId').populate('examId', 'name type startDate').populate('subjectId', 'name code').sort({ createdAt: -1 }).lean();
    res.json({ results });
  } catch (error: any) { res.status(error?.status || 500).json({ message: error?.message || 'Failed to load results', error }); }
});

router.post('/', resultEntryGuard, async (req: any, res) => {
  try {
    const setup = await resultSetup(req, req.body);
    if (!setup) return res.status(404).json({ message: 'Exam not found' });
    if (!(await assertEntryScope(req, res, setup.exam.classId, req.body.subjectId))) return;
    const marksObtained = req.body.marksObtained === undefined ? undefined : Number(req.body.marksObtained);
    const result = await Result.create({ studentId: req.body.studentId, examId: req.body.examId, subjectId: req.body.subjectId, year: setup.year, marksObtained, grade: req.body.grade || getGrade(marksObtained, setup.totalMarks), remarks: req.body.remarks, isPassed: marksObtained !== undefined ? marksObtained >= setup.passingMarks : undefined, workflowStatus: req.body.workflowStatus || 'draft', markedBy: req.user._id, markedAt: new Date(), institutionId: req.user.institutionId });
    res.status(201).json({ result });
  } catch (error) { res.status(500).json({ message: 'Failed to create result', error }); }
});

router.put('/:id', resultEntryGuard, async (req: any, res) => {
  try {
    const result: any = await Result.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!result) return res.status(404).json({ message: 'Result not found' });
    const payload = { examId: req.body.examId || result.examId, subjectId: req.body.subjectId || result.subjectId, year: req.body.year || result.year };
    const setup = await resultSetup(req, payload);
    if (!setup) return res.status(404).json({ message: 'Exam not found' });
    if (!(await assertEntryScope(req, res, setup.exam.classId, payload.subjectId))) return;
    const marksObtained = req.body.marksObtained === undefined ? result.marksObtained : Number(req.body.marksObtained);
    result.studentId = req.body.studentId || result.studentId;
    result.examId = payload.examId;
    result.subjectId = payload.subjectId;
    result.year = setup.year;
    result.marksObtained = marksObtained;
    result.grade = req.body.grade || getGrade(marksObtained, setup.totalMarks);
    result.remarks = req.body.remarks || result.remarks;
    result.isPassed = marksObtained !== undefined ? marksObtained >= setup.passingMarks : result.isPassed;
    result.workflowStatus = req.body.workflowStatus || result.workflowStatus;
    await result.save();
    res.json({ result });
  } catch (error) { res.status(500).json({ message: 'Failed to update result', error }); }
});

router.delete('/:id', resultDeleteGuard, async (req: any, res) => {
  try {
    const result: any = await Result.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!result) return res.status(404).json({ message: 'Result not found' });
    await result.deleteOne();
    res.json({ message: 'Result deleted' });
  } catch (error) { res.status(500).json({ message: 'Failed to delete result', error }); }
});

router.post('/draft', resultEntryGuard, async (req: any, res) => {
  try {
    const { examId, subjectId, rows = [] } = req.body;
    const setup = await resultSetup(req, { examId, subjectId, year: req.body.year });
    if (!setup) return res.status(404).json({ message: 'Exam not found' });
    if (!(await assertEntryScope(req, res, setup.exam.classId, subjectId))) return;
    for (const row of rows) {
      const hasMarks = row.marksObtained !== '' && row.marksObtained !== undefined && row.marksObtained !== null;
      const marksObtained = hasMarks ? Number(row.marksObtained) : undefined;
      await Result.findOneAndUpdate({ studentId: row.studentId, examId, subjectId, institutionId: req.user.institutionId }, { studentId: row.studentId, examId, subjectId, year: setup.year, marksObtained, grade: getGrade(marksObtained, setup.totalMarks), remarks: row.remarks || '', isPassed: hasMarks ? marksObtained! >= setup.passingMarks : undefined, workflowStatus: 'draft', markedBy: req.user._id, markedAt: new Date(), institutionId: req.user.institutionId }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    const data = await getResultContext({ ...req, query: { classId: req.body.classId || setup.exam.classId, sectionId: req.body.sectionId, examId, subjectId, year: setup.year } });
    res.json({ message: 'Draft saved', ...data });
  } catch (error) { res.status(500).json({ message: 'Failed to save result draft', error }); }
});

router.post('/submit-review', resultEntryGuard, async (req: any, res) => {
  try {
    const setup = await resultSetup(req, req.body);
    if (!setup) return res.status(404).json({ message: 'Exam not found' });
    if (!(await assertEntryScope(req, res, setup.exam.classId, req.body.subjectId))) return;
    await updateResultWorkflow({ ...req, body: { ...req.body, year: setup.year } }, 'review');
    res.json({ message: 'Results submitted for review' });
  } catch (error) { res.status(500).json({ message: 'Failed to submit results for review', error }); }
});

router.post('/assistant-approve', resultApproveGuard, async (req: any, res) => {
  try { await updateResultWorkflow({ ...req, body: { ...req.body, approvalStage: 'assistant' } }, 'approved'); res.json({ message: 'Assistant Head approval saved' }); }
  catch (error) { res.status(500).json({ message: 'Failed to approve results', error }); }
});

router.post('/head-approve', resultApproveGuard, async (req: any, res) => {
  try { await updateResultWorkflow({ ...req, body: { ...req.body, approvalStage: 'head' } }, 'approved'); res.json({ message: 'Head approval saved' }); }
  catch (error) { res.status(500).json({ message: 'Failed to approve results', error }); }
});

router.post('/publish', resultPublishGuard, async (req: any, res) => {
  try {
    const data = await getResultContext({ ...req, query: req.body });
    if (data.missingMarks > 0) return res.status(409).json({ message: 'Cannot publish while required subject marks are missing.', missingMarks: data.missingMarks });
    const hasUnapproved = data.rows.some((row: any) => row.workflowStatus !== 'approved' && row.workflowStatus !== 'published');
    if (hasUnapproved) return res.status(409).json({ message: 'Head approval is required before publishing.' });
    await updateResultWorkflow({ ...req, body: { ...req.body, year: data.year } }, 'published');
    const studentIds = Array.from(new Set((data.rows || []).map((row: any) => String(row.studentId)).filter(Boolean)));
    const students = await Student.find({ _id: { $in: studentIds }, institutionId: req.user.institutionId }).populate('userId', 'name').lean();
    const studentMap = new Map(students.map((student: any) => [String(student._id), student]));
    for (const row of data.rows || []) {
      const student: any = studentMap.get(String(row.studentId));
      if (!student?.guardianPhone) continue;
      const studentName = row.studentName || student.userId?.name || student.guardianName || 'Student';
      const summary = `${data.year || row.year || ''} ${row.grade || 'N/A'} grade published${row.marksObtained !== undefined && row.marksObtained !== null ? `, marks ${row.marksObtained}` : ''}`.trim();
      await sendResultSMS(student.guardianPhone, studentName, summary, req.user.institutionId);
    }
    res.json({ message: 'Results published', year: data.year });
  } catch (error: any) { res.status(error?.status || 500).json({ message: error?.message || 'Failed to publish results', error }); }
});

export default router;
