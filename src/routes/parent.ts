import express from 'express';
import { authenticate, normalizeRole } from '../middleware/auth';
import Parent from '../models/Parent';
import Student from '../models/Student';
import Notice from '../models/Notice';
import Attendance from '../models/Attendance';
import Result from '../models/Result';
import Fee from '../models/Fee';
import Payment from '../models/Payment';
import StudentInvoice from '../models/StudentInvoice';
import StudentFeePayment from '../models/StudentFeePayment';
import IDCard from '../models/IDCard';
import ClassRoutine from '../models/ClassRoutine';
import LeaveApplication from '../models/LeaveApplication';
import DocumentModel from '../models/Document';

const router = express.Router();

const buildPortalFromChildren = async (institutionId: any, children: any[], parent: any = null) => {
  const childIds = children.map((child) => child._id).filter(Boolean);
  const childUserIds = children.map((child) => child.userId?._id || child.userId).filter(Boolean);
  const classIds = children.map((child) => child.classId?._id || child.classId).filter(Boolean);
  const sectionIds = children.map((child) => child.sectionId?._id || child.sectionId).filter(Boolean);
  if (!childIds.length) {
    return { parent, summary: { children: 0, attendanceRecords: 0, present: 0, absent: 0, leave: 0, publishedResults: 0, totalDue: 0, payments: 0, routines: 0, leaveApplications: 0, documents: 0, notices: 0 }, featureLinks: [], children: [], attendance: [], results: [], fees: [], payments: [], idCards: [], routines: [], leaves: [], documents: [], announcements: [] };
  }

  const [announcements, attendance, results, fees, invoiceFees, payments, invoicePayments, idCards, routines, leaves, documents] = await Promise.all([
    Notice.find({ institutionId, isPublished: true, $or: [{ targetAudience: { $in: ['all', 'parent', 'student'] } }, { targetRoles: { $in: ['all', 'parent', 'student'] } }] }).sort({ publishedAt: -1, createdAt: -1 }).limit(20).select('title content category priority urgent publishedAt').lean().catch(() => []),
    Attendance.find({ institutionId, studentId: { $in: childIds } }).sort({ date: -1 }).limit(180).lean().catch(() => []),
    Result.find({ institutionId, studentId: { $in: childIds }, workflowStatus: 'published' }).populate('examId', 'name type').populate('subjectId', 'name code').sort({ publishedAt: -1 }).lean().catch(() => []),
    Fee.find({ institutionId, $or: [{ studentId: { $in: childIds } }, { studentId: { $exists: false }, classId: { $in: classIds } }, { studentId: null, classId: { $in: classIds } }] }).sort({ dueDate: -1 }).lean().catch(() => []),
    StudentInvoice.find({ institutionId, studentId: { $in: childIds } }).sort({ year: -1, month: -1 }).lean().catch(() => []),
    Payment.find({ institutionId, studentId: { $in: childIds } }).sort({ paymentDate: -1 }).lean().catch(() => []),
    StudentFeePayment.find({ institutionId, studentId: { $in: childIds } }).sort({ paidAt: -1, createdAt: -1 }).lean().catch(() => []),
    IDCard.find({ institutionId, ownerType: 'student', $or: [{ ownerId: { $in: childIds } }, { ownerId: { $in: childUserIds } }] }).lean().catch(() => []),
    ClassRoutine.find({ institutionId, classId: { $in: classIds }, isActive: true, isPublic: true, status: 'approved', $or: [{ sectionId: { $in: sectionIds } }, { sectionId: { $exists: false } }, { sectionId: null }] }).populate('subjectId', 'name code').populate('teacherId', 'name email').sort({ dayOfWeek: 1, startTime: 1 }).lean().catch(() => []),
    LeaveApplication.find({ institutionId, studentId: { $in: childIds } }).sort({ createdAt: -1 }).limit(80).lean().catch(() => []),
    DocumentModel.find({ institutionId, isPublic: true, $or: [{ ownerType: 'student', ownerId: { $in: childIds } }, { userId: { $in: childUserIds } }, { ownerType: 'institution' }] }).sort({ createdAt: -1 }).limit(50).lean().catch(() => []),
  ]);

  const invoiceAsFees = invoiceFees.map((inv: any) => ({ _id: `invoice-${inv._id}`, invoiceId: inv._id, studentId: inv.studentId, classId: inv.classId, type: inv.feeType || 'monthly', month: inv.month, year: inv.year, amount: inv.dueAmount, originalAmount: inv.totalAmount, paidAmount: inv.paidAmount, status: inv.status === 'paid' ? 'paid' : inv.status === 'overdue' ? 'overdue' : 'pending', dueDate: inv.dueDate, invoiceNo: inv.invoiceNo, source: 'invoice' }));
  const allFees = [...invoiceAsFees, ...fees];
  const allPayments = [...payments, ...invoicePayments.map((p: any) => ({ ...p, receiptNumber: p.receiptNo, paymentDate: p.paidAt || p.createdAt }))];
  const totalDue = allFees.filter((fee: any) => fee.status !== 'paid').reduce((sum: number, fee: any) => sum + Number(fee.amount || fee.dueAmount || 0), 0);
  const present = attendance.filter((item: any) => item.status === 'present').length;
  const absent = attendance.filter((item: any) => item.status === 'absent').length;
  const leave = attendance.filter((item: any) => item.status === 'leave').length;

  return {
    parent,
    summary: { children: children.length, attendanceRecords: attendance.length, present, absent, leave, publishedResults: results.length, totalDue, payments: allPayments.length, routines: routines.length, leaveApplications: leaves.length, documents: documents.length, notices: announcements.length },
    featureLinks: [
      { label: 'Dashboard', href: '/dashboard', key: 'dashboard' },
      { label: 'Attendance', href: '/attendance/my-attendance', key: 'attendance' },
      { label: 'Results / Report Card', href: '/academic/report-card', key: 'results' },
      { label: 'Fees & Payments', href: '/finance/my-fees', key: 'fees' },
      { label: 'Class Routine', href: '/academic/class-routine', key: 'routine' },
      { label: 'Leave Application', href: '/leave-application', key: 'leaves' },
      { label: 'ID Card', href: '/id-cards/my-card', key: 'id-card' },
      { label: 'Notice Board', href: '/notices', key: 'notices' },
      { label: 'Documents', href: '/documents', key: 'documents' },
    ],
    children: children.map((child) => {
      const currentClassId = String(child.classId?._id || child.classId);
      const currentSectionId = String(child.sectionId?._id || child.sectionId);
      return { ...child, attendance: attendance.filter((item: any) => String(item.studentId) === String(child._id)), results: results.filter((item: any) => String(item.studentId) === String(child._id)), fees: allFees.filter((item: any) => String(item.studentId?._id || item.studentId) === String(child._id) || (!item.studentId && String(item.classId) === currentClassId)), payments: allPayments.filter((item: any) => String(item.studentId?._id || item.studentId) === String(child._id)), leaves: leaves.filter((item: any) => String(item.studentId) === String(child._id)), routine: routines.filter((item: any) => String(item.classId) === currentClassId && (!item.sectionId || String(item.sectionId) === currentSectionId)), documents: documents.filter((doc: any) => String(doc.ownerId) === String(child._id) || String(doc.userId) === String(child.userId?._id || child.userId) || doc.ownerType === 'institution'), idCard: idCards.find((card: any) => String(card.ownerId) === String(child._id) || String(card.ownerId) === String(child.userId?._id || child.userId)) };
    }),
    attendance, results, fees: allFees, payments: allPayments, idCards, routines, leaves, documents, announcements,
  };
};

const buildPortal = async (req: any) => {
  const role = normalizeRole(req.user?.role);
  if (role === 'student') {
    const student: any = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).populate('userId', 'name email avatar phone').populate('classId', 'name grade').populate('sectionId', 'name').lean();
    return buildPortalFromChildren(req.user.institutionId, student ? [student] : [], null);
  }
  const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).populate({ path: 'children', populate: [{ path: 'userId', select: 'name email avatar phone' }, { path: 'classId', select: 'name grade' }, { path: 'sectionId', select: 'name' }] }).lean();
  return buildPortalFromChildren(req.user.institutionId, (parent?.children as any[]) || [], parent || null);
};

router.get('/', authenticate, (req: any, res) => {
  buildPortal(req).then((portal) => res.json({ portal })).catch((error) => res.status(500).json({ message: 'Failed to load student/parent portal', error: error?.message || error }));
});
router.get('/portal', authenticate, (req: any, res) => {
  buildPortal(req).then((portal) => res.json({ portal })).catch((error) => res.status(500).json({ message: 'Failed to load student/parent portal', error: error?.message || error }));
});

export default router;
