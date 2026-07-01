import Attendance from '../models/Attendance';
import Result from '../models/Result';
import Student from '../models/Student';
import { sendMonthlyParentSummarySMS } from '../utils/sms';

export interface MonthlySummaryOptions {
  institutionId: string;
  month: number;
  year: number;
  classId?: string;
  sectionId?: string;
  studentId?: string;
}

export interface MonthlySummaryItem {
  studentId: string;
  studentName: string;
  guardianName: string;
  guardianPhone: string;
  attendanceDays: number;
  presentDays: number;
  resultSummary: string;
  message: string;
  smsSent: boolean;
}

export interface MonthlySummaryReport {
  totalStudents: number;
  sent: number;
  failed: number;
  skipped: number;
  items: MonthlySummaryItem[];
}

function getMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

function getMonthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function getResultGrade(percentage: number) {
  if (percentage >= 80) return 'A+';
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'A-';
  if (percentage >= 50) return 'B';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
}

function getExamStats(results: any[]) {
  if (!results.length) {
    return null;
  }

  const latestPublishedAt = results.reduce((latest, current) => {
    const currentTime = new Date(current.publishedAt || current.createdAt || 0).getTime();
    const latestTime = latest ? new Date(latest.publishedAt || latest.createdAt || 0).getTime() : 0;
    return currentTime >= latestTime ? current : latest;
  }, results[0]);

  const latestExamId = String(latestPublishedAt.examId?._id || latestPublishedAt.examId);
  const examResults = results.filter((result) => String(result.examId?._id || result.examId) === latestExamId);

  const totalObtained = examResults.reduce((sum, result) => sum + (Number(result.marksObtained) || 0), 0);
  const totalMarks = examResults.reduce((sum, result) => {
    const exam = result.examId || {};
    const subjectMarks = Array.isArray(exam.subjectMarks) ? exam.subjectMarks : [];
    const subjectId = String(result.subjectId?._id || result.subjectId);
    const setup = subjectMarks.find((item: any) => String(item.subjectId) === subjectId);
    return sum + Number(setup?.totalMarks || exam.totalMarks || 100);
  }, 0);

  const percentage = totalMarks ? Math.round((totalObtained / totalMarks) * 100) : 0;

  return {
    examName: latestPublishedAt.examId?.name || 'Monthly exam',
    totalObtained,
    totalMarks,
    percentage,
    grade: getResultGrade(percentage),
  };
}

function buildMessage(studentName: string, rollNumber: string, label: string, attendanceDays: number, presentDays: number, resultSummary: string) {
  // Bengali message for period parent summary
  const baseMessage = `${studentName} (${rollNumber}) — ${label} এর সারসংক্ষেপ: উপস্থিতি ${presentDays}/${attendanceDays} দিন। ${resultSummary}`;
  return baseMessage.substring(0, 160);
}

export async function sendPeriodSummarySMS(options: {
  institutionId: string;
  startDate: Date;
  endDate: Date;
  label: string;
  studentId?: string;
  classId?: string;
  sectionId?: string;
}): Promise<MonthlySummaryReport> {
  const { startDate, endDate, label } = options;

  const query: any = {
    institutionId: options.institutionId,
    isActive: true,
    guardianPhone: { $exists: true, $ne: '' },
  };

  if (options.studentId) query._id = options.studentId;
  if (options.classId) query.classId = options.classId;
  if (options.sectionId) query.sectionId = options.sectionId;

  const students = await Student.find(query)
    .populate('userId', 'name')
    .select('guardianName guardianPhone rollNumber userId')
    .sort({ rollNumber: 1 })
    .lean();

  const items: MonthlySummaryItem[] = [];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const student of students) {
    const studentName = (student.userId as any)?.name || student.guardianName || `Student ${student.rollNumber}`;
    const attendanceDays = await Attendance.countDocuments({
      institutionId: options.institutionId,
      studentId: student._id,
      date: { $gte: startDate, $lt: endDate },
    });
    const presentDays = await Attendance.countDocuments({
      institutionId: options.institutionId,
      studentId: student._id,
      date: { $gte: startDate, $lt: endDate },
      status: { $in: ['present', 'late'] },
    });

    const results = await Result.find({
      institutionId: options.institutionId,
      studentId: student._id,
      publishedAt: { $gte: startDate, $lt: endDate },
      workflowStatus: { $in: ['approved', 'published'] },
    })
      .populate('examId', 'name totalMarks subjectMarks')
      .populate('subjectId', 'name code')
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();

    const examStats = getExamStats(results as any[]);
    const resultSummary = examStats
      ? `${examStats.examName}: ${examStats.percentage}% (${examStats.grade})`
      : 'Result pending';
    const message = buildMessage(studentName, student.rollNumber, label, attendanceDays, presentDays, resultSummary);

    if (!student.guardianPhone) {
      skipped += 1;
      items.push({
        studentId: String(student._id),
        studentName,
        guardianName: student.guardianName,
        guardianPhone: '',
        attendanceDays,
        presentDays,
        resultSummary,
        message,
        smsSent: false,
      });
      continue;
    }

    const smsSent = await sendMonthlyParentSummarySMS(student.guardianPhone, studentName, message, options.institutionId);
    if (smsSent) {
      sent += 1;
    } else {
      failed += 1;
    }

    items.push({
      studentId: String(student._id),
      studentName,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      attendanceDays,
      presentDays,
      resultSummary,
      message,
      smsSent,
    });
  }

  return {
    totalStudents: students.length,
    sent,
    failed,
    skipped,
    items,
  };
}

export async function sendMonthlyGuardianSummarySMS(options: MonthlySummaryOptions): Promise<MonthlySummaryReport> {
  const { start, end } = getMonthRange(options.year, options.month);
  const monthLabel = getMonthLabel(options.year, options.month);
  return sendPeriodSummarySMS({
    institutionId: options.institutionId,
    startDate: start,
    endDate: end,
    label: monthLabel,
    studentId: options.studentId,
    classId: options.classId,
    sectionId: options.sectionId,
  });
}
