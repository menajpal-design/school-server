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

const router = express.Router();

const buildPortal = async (institutionId: any, userId: any) => {
  const parent = await Parent.findOne({ institutionId, userId })
    .populate({ path: 'children', populate: [{ path: 'userId', select: 'name email avatar' }, { path: 'classId', select: 'name grade' }, { path: 'sectionId', select: 'name' }] })
    .lean();
  const children: any[] = parent?.children as any[] || [];
  const childIds = children.map((child) => child._id);
  const [announcements, attendance, results, fees, payments, idCards] = await Promise.all([
    Notice.find({ institutionId, isPublished: true, $or: [{ targetAudience: { $in: ['all', 'parent'] } }, { targetRoles: { $in: ['all', 'parent'] } }] })
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(10)
      .select('title content category priority urgent publishedAt'),
    Attendance.find({ institutionId, studentId: { $in: childIds } }).sort({ date: -1 }).limit(100).lean(),
    Result.find({ institutionId, studentId: { $in: childIds }, workflowStatus: 'published' }).populate('examId', 'name type').populate('subjectId', 'name code').sort({ publishedAt: -1 }).lean(),
    Fee.find({ institutionId, studentId: { $in: childIds } }).sort({ dueDate: -1 }).lean(),
    Payment.find({ institutionId, studentId: { $in: childIds } }).sort({ paymentDate: -1 }).lean(),
    IDCard.find({ institutionId, ownerType: 'student', $or: [{ ownerId: { $in: childIds } }, { ownerId: { $in: children.map((child) => child.userId?._id).filter(Boolean) } }] }).lean(),
  ]);

  return {
    parent,
    children: children.map((child) => ({
      ...child,
      attendance: attendance.filter((item: any) => String(item.studentId) === String(child._id)),
      results: results.filter((item: any) => String(item.studentId) === String(child._id)),
      fees: fees.filter((item: any) => String(item.studentId) === String(child._id)),
      payments: payments.filter((item: any) => String(item.studentId) === String(child._id)),
      idCard: idCards.find((card: any) => String(card.ownerId) === String(child._id) || String(card.ownerId) === String(child.userId?._id)),
    })),
    attendance,
    results,
    fees,
    payments,
    idCards,
    announcements,
  };
};

router.get('/', authenticate, (req, res) => {
  const institutionId = req.user.institutionId;
  buildPortal(institutionId, req.user._id)
    .then((portal) => res.json({ portal }))
    .catch((error) => res.status(500).json({ message: 'Failed to load parent portal', error }));
});

router.get('/portal', authenticate, (req, res) => {
  const institutionId = req.user.institutionId;
  buildPortal(institutionId, req.user._id)
    .then((portal) => res.json({ portal }))
    .catch((error) => res.status(500).json({ message: 'Failed to load parent portal', error }));
});

export default router;
