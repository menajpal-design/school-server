import express from 'express';
import { authenticate, canManageAcademic } from '../middleware/auth';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Notice from '../models/Notice';
import Fee from '../models/Fee';
import Payment from '../models/Payment';
import Attendance from '../models/Attendance';
import { sendMonthlyGuardianSummarySMS } from '../services/monthlySummarySms';

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const institutionId = req.user.institutionId;
  Promise.all([
    Student.countDocuments({ institutionId, isActive: true }),
    Teacher.countDocuments({ institutionId, isActive: true }),
    Staff.countDocuments({ institutionId, isActive: true }),
    Notice.countDocuments({ institutionId, isPublished: true }),
    Fee.aggregate([{ $match: { institutionId } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.aggregate([{ $match: { institutionId } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Attendance.countDocuments({ institutionId }),
  ])
    .then(([students, teachers, staff, notices, feeAgg, paymentAgg, attendance]) => {
      res.json({
        reports: {
          students,
          teachers,
          staff,
          notices,
          feeTotal: feeAgg[0]?.total || 0,
          paymentTotal: paymentAgg[0]?.total || 0,
          attendance,
        }
      });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load reports', error }));
});

router.post('/monthly-guardian-sms', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const month = Number(req.body.month || new Date().getMonth() + 1);
    const year = Number(req.body.year || new Date().getFullYear());

    if (!month || month < 1 || month > 12 || !year) {
      return res.status(400).json({ message: 'Valid month and year are required.' });
    }

    const summary = await sendMonthlyGuardianSummarySMS({
      institutionId: String(req.user.institutionId),
      month,
      year,
      classId: req.body.classId,
      sectionId: req.body.sectionId,
      studentId: req.body.studentId,
    });

    res.json({
      message: 'Monthly guardian SMS summary processed.',
      month,
      year,
      summary,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send monthly guardian SMS summary', error });
  }
});

export default router;