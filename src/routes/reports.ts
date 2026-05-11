import express from 'express';
import { authenticate } from '../middleware/auth';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Notice from '../models/Notice';
import Fee from '../models/Fee';
import Payment from '../models/Payment';
import Attendance from '../models/Attendance';

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

export default router;