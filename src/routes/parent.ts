import express from 'express';
import { authenticate } from '../middleware/auth';
import Parent from '../models/Parent';
import Student from '../models/Student';
import Notice from '../models/Notice';
import Attendance from '../models/Attendance';
import Result from '../models/Result';
import Fee from '../models/Fee';
import Payment from '../models/Payment';
import IDCard from '../models/IDCard';
import ClassRoutine from '../models/ClassRoutine';
import LeaveApplication from '../models/LeaveApplication';
import DocumentModel from '../models/Document';

const router = express.Router();

const buildPortal = async (institutionId: any, userId: any) => {
  const parent = await Parent.findOne({ institutionId, userId })
    .populate({ path: 'children', populate: [{ path: 'userId', select: 'name email avatar' }, { path: 'classId', select: 'name grade' }, { path: 'sectionId', select: 'name' }] })
    .lean();
  const children: any[] = parent?.children as any[] || [];
  const childIds = children.map((child) => child._id);
  const childUserIds = children.map((child) => child.userId?._id).filter(Boolean);
  const classIds = children.map((child) => child.classId?._id || child.classId).filter(Boolean);
  const sectionIds = children.map((child) => child.sectionId?._id || child.sectionId).filter(Boolean);

  const [announcements, attendance, results, fees, payments, idCards, routines, leaves, documents] = await Promise.all([
    Notice.find({ institutionId, isPublished: true, $or: [{ targetAudience: { $in: ['all', 'parent', 'student'] } }, { targetRoles: { $in: ['all', 'parent', 'student'] } }] })
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(20)
      .select('title content category priority urgent publishedAt'),
    Attendance.find({ institutionId, studentId: { $in: childIds } }).sort({ date: -1 }).limit(180).lean(),
    Result.find({ institutionId, studentId: { $in: childIds }, workflowStatus: 'published' }).populate('examId', 'name type').populate('subjectId', 'name code').sort({ publishedAt: -1 }).lean(),
    Fee.find({ institutionId, studentId: { $in: childIds } }).sort({ dueDate: -1 }).lean(),
    Payment.find({ institutionId, studentId: { $in: childIds } }).sort({ paymentDate: -1 }).lean(),
    IDCard.find({ institutionId, ownerType: 'student', $or: [{ ownerId: { $in: childIds } }, { ownerId: { $in: childUserIds } }] }).lean(),
    ClassRoutine.find({ institutionId, classId: { $in: classIds }, isActive: true, isPublic: true, status: 'approved', $or: [{ sectionId: { $in: sectionIds } }, { sectionId: { $exists: false } }, { sectionId: null }] })
      .populate('subjectId', 'name code')
      .populate('teacherId', 'name email')
      .sort({ dayOfWeek: 1, startTime: 1 })
      .lean(),
    LeaveApplication.find({ institutionId, studentId: { $in: childIds } }).sort({ createdAt: -1 }).limit(80).lean(),
    DocumentModel.find({ institutionId, isPublic: true, $or: [{ ownerType: 'student', ownerId: { $in: childIds } }, { userId: { $in: childUserIds } }, { ownerType: 'institution' }] }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);

  const totalDue = fees.filter((fee: any) => fee.status !== 'paid').reduce((sum: number, fee: any) => sum + Number(fee.amount || 0), 0);
  const present = attendance.filter((item: any) => item.status === 'present').length;
  const absent = attendance.filter((item: any) => item.status === 'absent').length;
  const leave = attendance.filter((item: any) => item.status === 'leave').length;

  return {
    parent,
    summary: {
      children: children.length,
      attendanceRecords: attendance.length,
      present,
      absent,
      leave,
      publishedResults: results.length,
      totalDue,
      payments: payments.length,
      routines: routines.length,
      leaveApplications: leaves.length,
      documents: documents.length,
      notices: announcements.length,
    },
    featureLinks: [
      { label: 'Child Dashboard', href: '/parent-portal', key: 'dashboard' },
      { label: 'Attendance', href: '/attendance/my-attendance', key: 'attendance' },
      { label: 'Results / Report Card', href: '/academic/report-card', key: 'results' },
      { label: 'Fees & Payments', href: '/finance/my-fees', key: 'fees' },
      { label: 'Class Routine', href: '/academic/class-routine', key: 'routine' },
      { label: 'Leave Application', href: '/leaves', key: 'leaves' },
      { label: 'ID Card', href: '/id-cards/my-card', key: 'id-card' },
      { label: 'Notice Board', href: '/notices', key: 'notices' },
      { label: 'Documents', href: '/documents', key: 'documents' },
    ],
    children: children.map((child) => {
      const currentClassId = String(child.classId?._id || child.classId);
      const currentSectionId = String(child.sectionId?._id || child.sectionId);
      return {
        ...child,
        attendance: attendance.filter((item: any) => String(item.studentId) === String(child._id)),
        results: results.filter((item: any) => String(item.studentId) === String(child._id)),
        fees: fees.filter((item: any) => String(item.studentId) === String(child._id)),
        payments: payments.filter((item: any) => String(item.studentId) === String(child._id)),
        leaves: leaves.filter((item: any) => String(item.studentId) === String(child._id)),
        routine: routines.filter((item: any) => String(item.classId) === currentClassId && (!item.sectionId || String(item.sectionId) === currentSectionId)),
        documents: documents.filter((doc: any) => String(doc.ownerId) === String(child._id) || String(doc.userId) === String(child.userId?._id) || doc.ownerType === 'institution'),
        idCard: idCards.find((card: any) => String(card.ownerId) === String(child._id) || String(card.ownerId) === String(child.userId?._id)),
      };
    }),
    attendance,
    results,
    fees,
    payments,
    idCards,
    routines,
    leaves,
    documents,
    announcements,
  };
};

router.get('/', authenticate, (req, res) => {
  buildPortal(req.user.institutionId, req.user._id)
    .then((portal) => res.json({ portal }))
    .catch((error) => res.status(500).json({ message: 'Failed to load parent portal', error }));
});

router.get('/portal', authenticate, (req, res) => {
  buildPortal(req.user.institutionId, req.user._id)
    .then((portal) => res.json({ portal }))
    .catch((error) => res.status(500).json({ message: 'Failed to load parent portal', error }));
});

export default router;
