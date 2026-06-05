import express from 'express';
import { authenticate } from '../middleware/auth';
import Exam from '../models/Exam';
import Result from '../models/Result';
import Student from '../models/Student';
import { requireAction, resolveActorScope, canUseClassAndSubject } from '../services/permissionPolicy';
import { sendResultSMS } from '../utils/sms';

const router = express.Router();

const getGrade = (marks: number | undefined, totalMarks: number) => {
  if (marks === undefined || marks === null || Number.isNaN(marks)) return undefined;
  const percentage = totalMarks ? (marks / totalMarks) * 100 : 0;
  if (percentage >= 80) return 'A+';
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'A-';
  if (percentage >= 50) return 'B';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
};

const assertEntryScope = async (req: any, res: any, classId?: any, subjectId?: any) => {
  const allowed = await canUseClassAndSubject(req.user, classId, subjectId);
  if (!allowed) {
    res.status(403).json({ message: 'Access denied. You can only work with assigned class and subject.' });
    return false;
  }
  return true;
};

const getResultContext = async (req: any) => {
  const { classId, sectionId, examId, subjectId } = req.query;
  const scope = await resolveActorScope(req.user);
  const query: any = { institutionId: req.user.institutionId, isActive: true };
  if (classId) query.classId = classId;
  if (sectionId) query.sectionId = sectionId;

  if (!scope.isSchoolLeader && !scope.isSystemAdmin) {
    if (req.user.role === 'student') query._id = scope.studentId;
    else if (req.user.role === 'parent') query._id = { $in: scope.childStudentIds };
    else if (scope.assignedClassIds.length) query.classId = { $in: scope.assignedClassIds };
    else return { rows: [], exam: null, marksSetup: { totalMarks: 100, passingMarks: 33 }, workflowStatus: 'draft', missingMarks: 0 };
  }

  const [students, results, exam] = await Promise.all([
    Student.find(query).populate('userId', 'name email').populate('sectionId', 'name').sort({ rollNumber: 1 }).lean(),
    examId && subjectId ? Result.find({ institutionId: req.user.institutionId, examId, subjectId }).populate('studentId', 'rollNumber').lean() : Promise.resolve([]),
    examId ? Exam.findOne({ _id: examId, institutionId: req.user.institutionId }).populate('subjectMarks.subjectId', 'name code').lean() : Promise.resolve(null),
  ]);

  const resultByStudent = new Map((results as any[]).map((result) => [String(result.studentId?._id || result.studentId), result]));
  const subjectSetup = (exam as any)?.subjectMarks?.find((item: any) => String(item.subjectId?._id || item.subjectId) === String(subjectId));
  const totalMarks = Number(subjectSetup?.totalMarks || (exam as any)?.totalMarks || 100);
  const passingMarks = Number(subjectSetup?.passingMarks || (exam as any)?.passingMarks || 33);
  const rows = students.map((student: any) => {
    const result = resultByStudent.get(String(student._id));
    return {
      studentId: student._id,
      resultId: result?._id,
      rollNumber: student.rollNumber,
      studentName: student.userId?.name || 'Unnamed student',
      section: student.sectionId?.name || '',
      marksObtained: result?.marksObtained,
      grade: result?.grade,
      remarks: result?.remarks || '',
      isPassed: result?.isPassed,
      workflowStatus: result?.workflowStatus || 'draft',
    };
  });
  const statuses = rows.map((row: any) => row.workflowStatus);
  const workflowStatus = statuses.includes('published') ? 'published' : statuses.includes('approved') ? 'approved' : statuses.includes('review') ? 'review' : 'draft';
  const missingMarks = rows.filter((row: any) => row.marksObtained === undefined || row.marksObtained === null || row.marksObtained === '').length;
  return { rows, exam, marksSetup: { totalMarks, passingMarks }, workflowStatus, missingMarks };
};

const updateResultWorkflow = async (req: any, workflowStatus: 'review' | 'approved' | 'published') => {
  const { examId, subjectId } = req.body;
  const filter = { institutionId: req.user.institutionId, examId, subjectId };
  const update: any = { workflowStatus };
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

const resultSetup = async (req: any, resultLike: any) => {
  const exam: any = await Exam.findOne({ _id: resultLike.examId, institutionId: req.user.institutionId }).lean();
  if (!exam) return null;
  const setup = exam?.subjectMarks?.find((item: any) => String(item.subjectId) === String(resultLike.subjectId));
  const totalMarks = Number(setup?.totalMarks || exam?.totalMarks || 100);
  const passingMarks = Number(setup?.passingMarks || exam?.passingMarks || 33);
  return { exam, totalMarks, passingMarks };
};

router.use(authenticate);

router.get('/', async (req: any, res) => {
  try {
    if (['student', 'parent'].includes(req.user.role)) return res.status(403).json({ message: 'Use /api/academic/results/me for own or linked child results.' });
    if (req.query.classId || req.query.examId || req.query.subjectId) {
      if (!(await assertEntryScope(req, res, req.query.classId, req.query.subjectId))) return;
      return res.json(await getResultContext(req));
    }
    const scope = await resolveActorScope(req.user);
    const query: any = { institutionId: req.user.institutionId };
    if (!scope.isSchoolLeader && !scope.isSystemAdmin) {
      if (!scope.assignedClassIds.length && !scope.assignedSubjectIds.length) return res.json({ results: [] });
      const studentIds = scope.assignedClassIds.length ? (await Student.find({ institutionId: req.user.institutionId, classId: { $in: scope.assignedClassIds } }).select('_id').lean()).map((s: any) => s._id) : [];
      query.$or = [];
      if (studentIds.length) query.$or.push({ studentId: { $in: studentIds } });
      if (scope.assignedSubjectIds.length) query.$or.push({ subjectId: { $in: scope.assignedSubjectIds } });
      if (!query.$or.length) return res.json({ results: [] });
    }
    const results = await Result.find(query).populate('studentId', 'rollNumber classId').populate('examId', 'name type').populate('subjectId', 'name code').sort({ createdAt: -1 }).lean();
    res.json({ results });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load results', error });
  }
});

router.post('/', requireAction('result:create'), async (req: any, res) => {
  try {
    const setup = await resultSetup(req, req.body);
    if (!setup) return res.status(404).json({ message: 'Exam not found' });
    if (!(await assertEntryScope(req, res, setup.exam.classId, req.body.subjectId))) return;
    const marksObtained = req.body.marksObtained === undefined ? undefined : Number(req.body.marksObtained);
    const result = await Result.create({ studentId: req.body.studentId, examId: req.body.examId, subjectId: req.body.subjectId, marksObtained, grade: req.body.grade || getGrade(marksObtained, setup.totalMarks), remarks: req.body.remarks, isPassed: marksObtained !== undefined ? marksObtained >= setup.passingMarks : undefined, workflowStatus: req.body.workflowStatus || 'draft', markedBy: req.user._id, markedAt: new Date(), institutionId: req.user.institutionId });
    res.status(201).json({ result });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create result', error });
  }
});

router.put('/:id', requireAction('result:update'), async (req: any, res) => {
  try {
    const result: any = await Result.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!result) return res.status(404).json({ message: 'Result not found' });
    const payload = { examId: req.body.examId || result.examId, subjectId: req.body.subjectId || result.subjectId };
    const setup = await resultSetup(req, payload);
    if (!setup) return res.status(404).json({ message: 'Exam not found' });
    if (!(await assertEntryScope(req, res, setup.exam.classId, payload.subjectId))) return;
    const marksObtained = req.body.marksObtained === undefined ? result.marksObtained : Number(req.body.marksObtained);
    result.studentId = req.body.studentId || result.studentId;
    result.examId = payload.examId;
    result.subjectId = payload.subjectId;
    result.marksObtained = marksObtained;
    result.grade = req.body.grade || getGrade(marksObtained, setup.totalMarks);
    result.remarks = req.body.remarks || result.remarks;
    result.isPassed = marksObtained !== undefined ? marksObtained >= setup.passingMarks : result.isPassed;
    result.workflowStatus = req.body.workflowStatus || result.workflowStatus;
    await result.save();
    res.json({ result });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update result', error });
  }
});

router.delete('/:id', requireAction('result:delete'), async (req: any, res) => {
  try {
    const result: any = await Result.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!result) return res.status(404).json({ message: 'Result not found' });
    const setup = await resultSetup(req, result);
    if (setup && !(await assertEntryScope(req, res, setup.exam.classId, result.subjectId))) return;
    await result.deleteOne();
    res.json({ message: 'Result deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete result', error });
  }
});

router.post('/draft', requireAction('result:create'), async (req: any, res) => {
  try {
    const { examId, subjectId, rows = [] } = req.body;
    const setup = await resultSetup(req, { examId, subjectId });
    if (!setup) return res.status(404).json({ message: 'Exam not found' });
    if (!(await assertEntryScope(req, res, setup.exam.classId, subjectId))) return;
    for (const row of rows) {
      const hasMarks = row.marksObtained !== '' && row.marksObtained !== undefined && row.marksObtained !== null;
      const marksObtained = hasMarks ? Number(row.marksObtained) : undefined;
      await Result.findOneAndUpdate({ studentId: row.studentId, examId, subjectId, institutionId: req.user.institutionId }, { studentId: row.studentId, examId, subjectId, marksObtained, grade: getGrade(marksObtained, setup.totalMarks), remarks: row.remarks || '', isPassed: hasMarks ? marksObtained! >= setup.passingMarks : undefined, workflowStatus: 'draft', markedBy: req.user._id, markedAt: new Date(), institutionId: req.user.institutionId }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    const data = await getResultContext({ ...req, query: { classId: req.body.classId || setup.exam.classId, sectionId: req.body.sectionId, examId, subjectId } });
    res.json({ message: 'Draft saved', ...data });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save result draft', error });
  }
});

router.post('/submit-review', requireAction('result:update'), async (req: any, res) => {
  try {
    const setup = await resultSetup(req, req.body);
    if (!setup) return res.status(404).json({ message: 'Exam not found' });
    if (!(await assertEntryScope(req, res, setup.exam.classId, req.body.subjectId))) return;
    await updateResultWorkflow(req, 'review');
    res.json({ message: 'Results submitted for review' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit results for review', error });
  }
});

router.post('/assistant-approve', requireAction('result:approve_assistant'), async (req: any, res) => {
  try {
    await updateResultWorkflow({ ...req, body: { ...req.body, approvalStage: 'assistant' } }, 'approved');
    res.json({ message: 'Assistant Head approval saved' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to approve results', error });
  }
});

router.post('/head-approve', requireAction('result:approve_head'), async (req: any, res) => {
  try {
    await updateResultWorkflow({ ...req, body: { ...req.body, approvalStage: 'head' } }, 'approved');
    res.json({ message: 'Head approval saved' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to approve results', error });
  }
});

router.post('/publish', requireAction('result:publish'), async (req: any, res) => {
  try {
    const data = await getResultContext({ ...req, query: req.body });
    if (data.missingMarks > 0) return res.status(409).json({ message: 'Cannot publish while required subject marks are missing.', missingMarks: data.missingMarks });
    const hasUnapproved = data.rows.some((row: any) => row.workflowStatus !== 'approved' && row.workflowStatus !== 'published');
    if (hasUnapproved) return res.status(409).json({ message: 'Head approval is required before publishing.' });
    await updateResultWorkflow(req, 'published');
    const studentIds = Array.from(new Set((data.rows || []).map((row: any) => String(row.studentId)).filter(Boolean)));
    const students = await Student.find({ _id: { $in: studentIds }, institutionId: req.user.institutionId }).populate('userId', 'name').lean();
    const studentMap = new Map(students.map((student: any) => [String(student._id), student]));
    for (const row of data.rows || []) {
      const student: any = studentMap.get(String(row.studentId));
      if (!student?.guardianPhone) continue;
      const studentName = row.studentName || student.userId?.name || student.guardianName || 'Student';
      const summary = `${row.grade || 'N/A'} grade published${row.marksObtained !== undefined && row.marksObtained !== null ? `, marks ${row.marksObtained}` : ''}`;
      await sendResultSMS(student.guardianPhone, studentName, summary, req.user.institutionId);
    }
    res.json({ message: 'Results published' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to publish results', error });
  }
});

export default router;
