import express from 'express';
import ClassModel from '../models/Class';
import Exam from '../models/Exam';
import PromotionRecord from '../models/PromotionRecord';
import Result from '../models/Result';
import Student from '../models/Student';
import { authenticate, canManageAcademic } from '../middleware/auth';

const router = express.Router();

router.use(authenticate);
router.use(canManageAcademic());

const MANUAL_PROMOTION_FAIL_LIMIT = 3;

const buildPromotionRows = async ({ institutionId, fromClassId, examId }: any) => {
  const [students, exam, existingRecords] = await Promise.all([
    Student.find({ institutionId, classId: fromClassId, isActive: true })
      .populate('userId', 'name email')
      .populate('sectionId', 'name')
      .sort({ rollNumber: 1 })
      .lean(),
    Exam.findOne({ _id: examId, institutionId }).populate('subjectMarks.subjectId', 'name code').lean(),
    PromotionRecord.find({ institutionId, examId }).lean(),
  ]);

  if (!exam) throw new Error('Exam not found');
  const recordMap = new Map(existingRecords.map((record: any) => [String(record.studentId), record]));
  const subjectMarks = Array.isArray((exam as any).subjectMarks) ? (exam as any).subjectMarks : [];

  const rows = await Promise.all(students.map(async (student: any) => {
    const results = await Result.find({
      institutionId,
      examId,
      studentId: student._id,
      workflowStatus: { $in: ['approved', 'published'] },
    }).populate('subjectId', 'name code').lean();

    const failedResults = results.filter((result: any) => result.isPassed === false);
    const missingSubjects = Math.max(subjectMarks.length - results.length, 0);
    const failedSubjects = failedResults.length + missingSubjects;
    const autoDecision = failedSubjects === 0 ? 'promoted' : 'failed';
    const manualEligible = failedSubjects > 0 && failedSubjects <= MANUAL_PROMOTION_FAIL_LIMIT;
    const record = recordMap.get(String(student._id));

    return {
      studentId: student._id,
      studentName: student.userId?.name || 'Student',
      rollNumber: student.rollNumber,
      fromSectionId: student.sectionId?._id || student.sectionId,
      sectionName: student.sectionId?.name || '',
      resultCount: results.length,
      subjectCount: subjectMarks.length,
      failedSubjects,
      failedSubjectNames: failedResults.map((item: any) => item.subjectId?.name || 'Subject'),
      missingSubjects,
      autoDecision,
      manualEligible,
      alreadyProcessed: Boolean(record),
      processedDecision: record?.decision,
      processedAt: record?.promotedAt,
    };
  }));

  return { exam, rows };
};

router.get('/preview', async (req, res) => {
  try {
    const { fromClassId, examId } = req.query;
    if (!fromClassId || !examId) return res.status(400).json({ message: 'fromClassId and examId are required' });

    const { exam, rows } = await buildPromotionRows({
      institutionId: req.user.institutionId,
      fromClassId,
      examId,
    });

    res.json({
      exam,
      rules: {
        autoPromoteFailedSubjects: 0,
        manualPromotionFailLimit: MANUAL_PROMOTION_FAIL_LIMIT,
        note: 'Head or class teacher can manually promote students who failed up to 3 subjects.',
      },
      summary: {
        totalStudents: rows.length,
        autoPromoted: rows.filter((row) => row.autoDecision === 'promoted').length,
        failed: rows.filter((row) => row.autoDecision === 'failed').length,
        manualEligible: rows.filter((row) => row.manualEligible).length,
        processed: rows.filter((row) => row.alreadyProcessed).length,
      },
      rows,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to preview promotion', error });
  }
});

router.post('/process', async (req, res) => {
  try {
    const { fromClassId, toClassId, toSectionId, examId, decisions = [] } = req.body;
    if (!fromClassId || !toClassId || !examId) return res.status(400).json({ message: 'fromClassId, toClassId and examId are required' });

    const toClass = await ClassModel.findOne({ _id: toClassId, institutionId: req.user.institutionId });
    if (!toClass) return res.status(404).json({ message: 'Next class not found' });

    const { rows } = await buildPromotionRows({
      institutionId: req.user.institutionId,
      fromClassId,
      examId,
    });

    const decisionMap = new Map((decisions as any[]).map((item) => [String(item.studentId), item]));
    const processed: any[] = [];
    const blocked: any[] = [];

    for (const row of rows) {
      const override = decisionMap.get(String(row.studentId));
      const requestedDecision = override?.decision || row.autoDecision;
      const reason = override?.reason || '';
      const isManualPromotion = row.autoDecision === 'failed' && requestedDecision === 'promoted';

      if (requestedDecision === 'promoted' && row.failedSubjects > MANUAL_PROMOTION_FAIL_LIMIT) {
        blocked.push({ ...row, reason: 'Failed subject count exceeds manual promotion limit.' });
        continue;
      }

      if (requestedDecision === 'promoted') {
        await Student.findOneAndUpdate(
          { _id: row.studentId, institutionId: req.user.institutionId },
          { classId: toClassId, sectionId: override?.toSectionId || toSectionId || undefined },
          { new: true }
        );
      }

      const record = await PromotionRecord.findOneAndUpdate(
        { institutionId: req.user.institutionId, examId, studentId: row.studentId },
        {
          studentId: row.studentId,
          fromClassId,
          fromSectionId: row.fromSectionId,
          toClassId: requestedDecision === 'promoted' ? toClassId : undefined,
          toSectionId: requestedDecision === 'promoted' ? (override?.toSectionId || toSectionId || undefined) : undefined,
          examId,
          failedSubjects: row.failedSubjects,
          decision: requestedDecision === 'promoted' ? (isManualPromotion ? 'manual_promoted' : 'promoted') : 'failed',
          reason,
          promotedBy: req.user._id,
          promotedAt: new Date(),
          institutionId: req.user.institutionId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      processed.push({ studentId: row.studentId, studentName: row.studentName, decision: record.decision, failedSubjects: row.failedSubjects });
    }

    res.json({
      message: 'Promotion processed successfully.',
      summary: {
        processed: processed.length,
        blocked: blocked.length,
        promoted: processed.filter((item) => ['promoted', 'manual_promoted'].includes(item.decision)).length,
        failed: processed.filter((item) => item.decision === 'failed').length,
      },
      processed,
      blocked,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to process promotion', error });
  }
});

router.get('/records', async (req, res) => {
  try {
    const query: any = { institutionId: req.user.institutionId };
    if (req.query.examId) query.examId = req.query.examId;
    if (req.query.fromClassId) query.fromClassId = req.query.fromClassId;

    const records = await PromotionRecord.find(query)
      .populate('studentId', 'rollNumber guardianName')
      .populate('fromClassId', 'name grade')
      .populate('toClassId', 'name grade')
      .populate('promotedBy', 'name role')
      .sort({ promotedAt: -1 })
      .limit(500)
      .lean();

    res.json({ records });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load promotion records', error });
  }
});

export default router;
