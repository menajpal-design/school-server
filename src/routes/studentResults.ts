import express from 'express';
import { authenticate } from '../middleware/auth';
import Result from '../models/Result';
import Student from '../models/Student';
import Institution from '../models/Institution';

const router = express.Router();

const gradePoint = (grade?: string) => {
  const g = String(grade || '').trim().toUpperCase();
  if (g === 'A+') return 5;
  if (g === 'A') return 4;
  if (g === 'A-') return 3.5;
  if (g === 'B') return 3;
  if (g === 'C') return 2;
  if (g === 'D') return 1;
  return 0;
};

const totalMarksFor = (result: any) => {
  const setup = result.examId?.subjectMarks?.find((item: any) => String(item.subjectId?._id || item.subjectId) === String(result.subjectId?._id || result.subjectId));
  return Number(setup?.totalMarks || result.examId?.totalMarks || 100);
};

router.get('/', authenticate, async (req: any, res) => {
  try {
    if (!['student', 'parent'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only students and parents can access personal results from this endpoint.' });
    }

    const institutionId = req.user.institutionId;
    const studentQuery: any = { institutionId, isActive: true };

    if (req.user.role === 'student') {
      studentQuery.userId = req.user._id;
    } else if (req.query.studentId) {
      studentQuery._id = req.query.studentId;
      studentQuery.parentId = req.user._id;
    } else {
      studentQuery.parentId = req.user._id;
    }

    const student = await Student.findOne(studentQuery)
      .populate('userId', 'name email phone avatar gender')
      .populate('classId', 'name grade academicYear')
      .populate('sectionId', 'name')
      .lean();

    if (!student) return res.status(404).json({ message: 'Student profile/result not found for current user.' });

    const query: any = { institutionId, studentId: student._id, workflowStatus: 'published' };
    if (req.query.examId) query.examId = req.query.examId;
    if (req.query.subjectId) query.subjectId = req.query.subjectId;

    const results = await Result.find(query)
      .populate('examId', 'name type totalMarks passingMarks subjectMarks startDate endDate')
      .populate('subjectId', 'name code')
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();

    const institution = await Institution.findById(institutionId).select('name eiin address phone website subdomain').lean();
    const rows = results.map((result: any) => {
      const totalMarks = totalMarksFor(result);
      const marks = Number(result.marksObtained || 0);
      const percentage = totalMarks ? Math.round((marks / totalMarks) * 100) : 0;
      return {
        _id: result._id,
        examId: result.examId?._id || result.examId,
        examName: result.examId?.name || 'Exam',
        examType: result.examId?.type || '',
        subjectId: result.subjectId?._id || result.subjectId,
        subjectName: result.subjectId?.name || 'Subject',
        subjectCode: result.subjectId?.code || '',
        marksObtained: result.marksObtained,
        totalMarks,
        percentage,
        grade: result.grade || '',
        gradePoint: gradePoint(result.grade),
        isPassed: result.isPassed !== false,
        remarks: result.remarks || '',
        publishedAt: result.publishedAt || result.createdAt,
      };
    });

    const totalObtained = rows.reduce((sum, item) => sum + Number(item.marksObtained || 0), 0);
    const grandTotal = rows.reduce((sum, item) => sum + Number(item.totalMarks || 0), 0);
    const failed = rows.some((item) => item.isPassed === false || String(item.grade).toUpperCase() === 'F');
    const gpa = rows.length ? (failed ? 0 : Number((rows.reduce((sum, item) => sum + Number(item.gradePoint || 0), 0) / rows.length).toFixed(2))) : 0;

    res.json({
      institution,
      student: {
        _id: student._id,
        name: (student.userId as any)?.name || student.guardianName || 'Student',
        rollNumber: student.rollNumber,
        className: (student.classId as any)?.name || '',
        sectionName: (student.sectionId as any)?.name || '',
        academicYear: (student.classId as any)?.academicYear || '',
      },
      filters: {
        exams: Array.from(new Map(rows.map((r) => [String(r.examId), { _id: r.examId, name: r.examName, type: r.examType }])).values()),
        subjects: Array.from(new Map(rows.map((r) => [String(r.subjectId), { _id: r.subjectId, name: r.subjectName, code: r.subjectCode }])).values()),
      },
      summary: {
        totalSubjects: rows.length,
        totalObtained,
        totalMarks: grandTotal,
        percentage: grandTotal ? Math.round((totalObtained / grandTotal) * 100) : 0,
        gpa,
        passed: rows.length ? !failed : false,
      },
      results: rows,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load personal results', error });
  }
});

export default router;
