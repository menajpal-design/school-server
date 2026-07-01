import express from 'express';
import Student from '../models/Student';
import Institution from '../models/Institution';
import SmsLog from '../models/SmsLog';
import Attendance from '../models/Attendance';
import Payment from '../models/Payment';
import StudentInvoice from '../models/StudentInvoice';
import StudentFeePayment from '../models/StudentFeePayment';
import Result from '../models/Result';
import { authenticate, authorize } from '../middleware/auth';
import { sendSMS } from '../utils/sms';
import { sendMonthlyGuardianSummarySMS } from '../services/monthlySummarySms';

const router = express.Router();

router.use(authenticate);

const getMonthRange = (month?: string) => {
  const base = month && /^\d{4}-\d{2}$/.test(month) ? new Date(`${month}-01T00:00:00.000Z`) : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end, year: start.getUTCFullYear(), monthNo: start.getUTCMonth() + 1, shortMonth: start.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), label: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}` };
};

const normalizePhone = (value?: string) => String(value || '').replace(/\D/g, '').replace(/^88/, '');
const shortName = (value: any) => String(value || 'Student').replace(/[^A-Za-z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim().split(' ')[0].slice(0, 18) || 'Student';
const moneyShort = (value: any) => String(Math.round(Number(value || 0)));
const gradeFromPercent = (percent: number) => percent >= 80 ? 'A+' : percent >= 70 ? 'A' : percent >= 60 ? 'A-' : percent >= 50 ? 'B' : percent >= 40 ? 'C' : percent >= 33 ? 'D' : 'F';

async function getMonthlySmsFacts(student: any, institutionId: any, info: ReturnType<typeof getMonthRange>) {
  const studentId = student._id;
  const [presentDays, invoice, oldPayment, invoicePayment] = await Promise.all([
    Attendance.countDocuments({ institutionId, studentId, date: { $gte: info.start, $lt: info.end }, status: { $in: ['present', 'late'] } }).catch(() => 0),
    StudentInvoice.findOne({ institutionId, studentId, month: info.monthNo, year: info.year, status: { $ne: 'cancelled' } }).lean().catch(() => null),
    Payment.findOne({ institutionId, studentId, paymentDate: { $gte: info.start, $lt: info.end } }).lean().catch(() => null),
    StudentFeePayment.findOne({ institutionId, studentId, paidAt: { $gte: info.start, $lt: info.end }, status: { $ne: 'cancelled' } }).lean().catch(() => null),
  ]);
  let fee = 'Monthly fee not recorded';
  if (invoice) {
    const due = Number((invoice as any).dueAmount || 0);
    const paid = Number((invoice as any).paidAmount || 0);
    const status = String((invoice as any).status || '').toLowerCase();
    if (status === 'paid' || due <= 0) fee = 'Monthly fee paid';
    else if (paid > 0) fee = `Monthly fee due BDT ${moneyShort(due)}`;
    else fee = `Monthly fee due BDT ${moneyShort(due || (invoice as any).totalAmount)}`;
  } else if (oldPayment || invoicePayment) {
    fee = 'Monthly fee paid';
  }
  return { presentDays, fee };
}

const monthlyGuardianMessage = async (student: any, institutionId: any, info: ReturnType<typeof getMonthRange>) => {
  const name = student.userId?.name || student.guardianName || 'Student';
  const facts = await getMonthlySmsFacts(student, institutionId, info);
  return `${shortName(name)} ${info.shortMonth} Summary: Present ${facts.presentDays} days. ${facts.fee}.`;
};

const resultTotalMark = (result: any) => {
  const exam = result.examId || {};
  const subjectId = String(result.subjectId?._id || result.subjectId || '');
  const setup = Array.isArray(exam.subjectMarks) ? exam.subjectMarks.find((item: any) => String(item.subjectId?._id || item.subjectId) === subjectId) : null;
  return Number(setup?.totalMarks || exam.totalMarks || 100) || 100;
};

const buildResultSms = (group: any) => {
  const name = shortName(group.studentName);
  const examName = String(group.examName || 'Result').replace(/[^A-Za-z0-9 ._-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Result';
  const percent = group.totalMarks > 0 ? Math.round((group.obtained / group.totalMarks) * 100) : 0;
  const grade = gradeFromPercent(percent);
  const status = group.failed ? 'Failed' : 'Passed';
  return `${name} ${examName}: ${group.obtained}/${group.totalMarks}, ${percent}%, Grade ${grade}, ${status}.`;
};

router.get('/head/monthly', authorize('head', 'assistant_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const { start, end, label } = getMonthRange(String(req.query.month || ''));
    const institutionId = req.user.institutionId;
    const [institution, logs, students] = await Promise.all([
      Institution.findById(institutionId).select('name billing').lean(),
      SmsLog.find({ institutionId, sentAt: { $gte: start, $lt: end } }).sort({ sentAt: -1 }).lean(),
      Student.find({ institutionId, isActive: true }).populate('userId', 'name email phone').select('userId guardianName guardianPhone rollNumber classId sectionId').lean(),
    ]);
    const successfulLogs = logs.filter((log: any) => log.status === 'sent');
    const sentPhoneSet = new Set(successfulLogs.map((log: any) => normalizePhone(log.recipientPhone)).filter(Boolean));
    const recipients = students.map((student: any) => {
      const phone = normalizePhone(student.guardianPhone);
      const matchingLogs = successfulLogs.filter((log: any) => normalizePhone(log.recipientPhone) === phone);
      return { studentId: student._id, studentName: student.userId?.name || student.guardianName || 'Student', rollNumber: student.rollNumber, guardianName: student.guardianName, guardianPhone: student.guardianPhone, smsSent: Boolean(phone && sentPhoneSet.has(phone)), sentCount: matchingLogs.length, lastSentAt: matchingLogs[0]?.sentAt || null };
    });
    const sentCount = successfulLogs.length;
    const monthlyLimit = Number((institution as any)?.billing?.monthlySmsLimit || 0);
    res.json({ month: label, institution: { id: (institution as any)?._id, name: (institution as any)?.name }, limit: { monthlySmsLimit: monthlyLimit, smsUsed: Number((institution as any)?.billing?.smsUsed || sentCount), usedThisMonth: sentCount, remainingThisMonth: Math.max(monthlyLimit - sentCount, 0) }, summary: { totalRecipients: recipients.length, sentRecipients: recipients.filter((item) => item.smsSent).length, notSentRecipients: recipients.filter((item) => !item.smsSent).length, totalSmsSent: sentCount, failedSms: logs.filter((log: any) => log.status === 'failed').length, pendingSms: logs.filter((log: any) => log.status === 'pending').length }, recipients, logs, note: 'SMS logs are automatically deleted after one month by database TTL cleanup.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load monthly SMS monitoring', error });
  }
});

router.post('/head/monthly-send', authorize('head', 'assistant_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const info = getMonthRange(String(req.body?.month || req.query?.month || ''));
    const institutionId = req.user.institutionId || req.body.institutionId;
    if (!institutionId) return res.status(400).json({ message: 'Institution is required.' });
    
    const summary = await sendMonthlyGuardianSummarySMS({
      institutionId: String(institutionId),
      month: info.monthNo,
      year: info.year,
    });

    res.json({ 
      month: info.label, 
      totalStudents: summary.totalStudents, 
      sent: summary.sent, 
      failed: summary.failed, 
      skipped: summary.skipped, 
      results: summary.items, 
      message: `Monthly guardian SMS completed. Sent ${summary.sent}, failed ${summary.failed}, skipped ${summary.skipped}.` 
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send monthly guardian SMS', error: String(error) });
  }
});

router.post('/head/published-result-send', authorize('head', 'assistant_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const info = getMonthRange(String(req.body?.month || req.query?.month || ''));
    const institutionId = req.user.institutionId || req.body.institutionId;
    if (!institutionId) return res.status(400).json({ message: 'Institution is required.' });
    const query: any = { institutionId, workflowStatus: 'published' };
    if (req.body?.examId) query.examId = req.body.examId;
    if (req.body?.year) query.year = Number(req.body.year);
    if (!req.body?.sendAllPublished) query.publishedAt = { $gte: info.start, $lt: info.end };
    const rows: any[] = await Result.find(query).populate({ path: 'studentId', select: 'userId guardianName guardianPhone rollNumber', populate: { path: 'userId', select: 'name' } }).populate('examId', 'name type totalMarks subjectMarks').populate('subjectId', 'name code').lean();
    const groups = new Map<string, any>();
    for (const row of rows) {
      const student: any = row.studentId || {};
      if (!student?._id || !student.guardianPhone) continue;
      const key = `${student._id}-${row.examId?._id || row.examId}`;
      const current = groups.get(key) || { studentId: student._id, studentName: student.userId?.name || student.guardianName || 'Student', guardianName: student.guardianName, guardianPhone: student.guardianPhone, examId: row.examId?._id || row.examId, examName: row.examId?.name || 'Result', obtained: 0, totalMarks: 0, failed: false, subjects: 0 };
      current.obtained += Number(row.marksObtained || 0);
      current.totalMarks += resultTotalMark(row);
      current.failed = current.failed || row.isPassed === false || String(row.grade || '').toUpperCase() === 'F';
      current.subjects += 1;
      groups.set(key, current);
    }
    let sent = 0, failed = 0, skipped = 0;
    const results: any[] = [];
    for (const group of groups.values()) {
      if (!normalizePhone(group.guardianPhone)) { skipped += 1; continue; }
      const message = buildResultSms(group);
      const ok = await sendSMS({ to: group.guardianPhone, message, institutionId, recipientName: group.guardianName || group.studentName, recipientPhone: group.guardianPhone, recipientId: group.studentId, recipientType: 'guardian', type: 'notification', purpose: `published_result_sms_${info.label}`, studentId: group.studentId }).catch(() => false);
      if (ok) sent += 1; else failed += 1;
      results.push({ studentId: group.studentId, studentName: group.studentName, guardianName: group.guardianName, guardianPhone: group.guardianPhone, examName: group.examName, status: ok ? 'sent' : 'failed', message });
    }
    res.json({ month: info.label, publishedResults: rows.length, resultGroups: groups.size, sent, failed, skipped, results, message: `Published result SMS completed. Sent ${sent}, failed ${failed}, skipped ${skipped}.` });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send published result SMS', error });
  }
});

router.get('/admin/usage', authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const { start, end, label } = getMonthRange(String(req.query.month || ''));
    const [schools, usage] = await Promise.all([
      Institution.find({}).select('name eiin phone email address billing isActive').lean(),
      SmsLog.aggregate([{ $match: { sentAt: { $gte: start, $lt: end } } }, { $group: { _id: '$institutionId', totalSms: { $sum: 1 }, sentSms: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } }, failedSms: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }, pendingSms: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }, lastSentAt: { $max: '$sentAt' } } }]),
    ]);
    const usageMap = usage.reduce((acc: any, item: any) => { acc[String(item._id)] = item; return acc; }, {});
    const institutions = schools.map((school: any) => { const item = usageMap[String(school._id)] || {}; const monthlyLimit = Number(school.billing?.monthlySmsLimit || 0); const sentSms = Number(item.sentSms || 0); return { institutionId: school._id, name: school.name, eiin: school.eiin, phone: school.phone, email: school.email, address: school.address, isActive: school.isActive, monthlySmsLimit: monthlyLimit, totalSms: Number(item.totalSms || 0), sentSms, failedSms: Number(item.failedSms || 0), pendingSms: Number(item.pendingSms || 0), remainingSms: Math.max(monthlyLimit - sentSms, 0), lastSentAt: item.lastSentAt || null }; });
    res.json({ month: label, summary: { totalInstitutions: institutions.length, activeInstitutions: institutions.filter((item) => item.isActive).length, totalSms: institutions.reduce((sum, item) => sum + item.totalSms, 0), sentSms: institutions.reduce((sum, item) => sum + item.sentSms, 0), failedSms: institutions.reduce((sum, item) => sum + item.failedSms, 0), pendingSms: institutions.reduce((sum, item) => sum + item.pendingSms, 0) }, institutions });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load admin SMS usage', error });
  }
});

router.post('/logs', authorize('head', 'assistant_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId || req.body.institutionId;
    const sentAt = req.body.sentAt ? new Date(req.body.sentAt) : new Date();
    const expiresAt = new Date(sentAt);
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    const log = await SmsLog.create({ institutionId, senderId: req.user._id, recipientId: req.body.recipientId, recipientType: req.body.recipientType || 'guardian', recipientName: req.body.recipientName, recipientPhone: req.body.recipientPhone, message: req.body.message, purpose: req.body.purpose, provider: req.body.provider, status: req.body.status || 'sent', sentAt, expiresAt, errorMessage: req.body.errorMessage });
    if (log.status === 'sent') await Institution.findByIdAndUpdate(institutionId, { $inc: { 'billing.smsUsed': 1 } });
    res.status(201).json({ log, message: 'SMS log saved' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save SMS log', error });
  }
});

router.post('/send-custom', authorize('head', 'assistant_head', 'admin', 'super_admin'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId || req.body.institutionId;
    if (!institutionId) return res.status(400).json({ message: 'Institution ID is required.' });
    const phone = String(req.body.phone || '').trim();
    const message = String(req.body.message || '').trim();
    if (!phone || !message) {
      return res.status(400).json({ message: 'Phone number and message are required.' });
    }
    const result = await sendSMS({
      to: phone,
      message,
      institutionId,
      recipientName: req.body.recipientName || 'Custom Recipient',
      recipientPhone: phone,
      recipientType: req.body.recipientType || 'other',
      type: 'notification',
      purpose: 'custom_sms'
    });
    if (result) {
      res.json({ success: true, message: 'Custom SMS sent successfully.' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to send Custom SMS. Check SMS gateway/balance.' });
    }
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to send custom SMS', error: error?.message || error });
  }
});

export default router;
