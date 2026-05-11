import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import User from '../models/User';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Attendance from '../models/Attendance';
import Fee from '../models/Fee';
import Notice from '../models/Notice';
import IDCard from '../models/IDCard';
import Salary from '../models/Salary';
import ClassModel from '../models/Class';
import mongoose from 'mongoose';

const router = express.Router();

const toObjectId = (id: unknown) => new mongoose.Types.ObjectId(String(id));

// Get dashboard statistics
router.get('/stats', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;

    const [
      totalStudents,
      totalTeachers,
      totalStaff,
      todayAttendance,
      pendingFees,
      activeNotices
    ] = await Promise.all([
      Student.countDocuments({ institutionId, isActive: true }),
      Teacher.countDocuments({ institutionId, isActive: true }),
      Staff.countDocuments({ institutionId, isActive: true }),
      Attendance.countDocuments({
        institutionId,
        date: new Date().toISOString().split('T')[0],
        status: 'present'
      }),
      Fee.countDocuments({ institutionId, status: 'pending' }),
      Notice.countDocuments({ institutionId, isPublished: true })
    ]);

    res.json({
      totalStudents,
      totalTeachers,
      totalStaff,
      todayAttendance,
      pendingFees,
      activeNotices
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get attendance overview
router.get('/attendance-overview', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

    const [statusStats, classWise, trend] = await Promise.all([
      Attendance.aggregate([
        { $match: { institutionId, date: { $gte: startOfDay, $lt: endOfDay } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Attendance.aggregate([
        { $match: { institutionId, date: { $gte: startOfDay, $lt: endOfDay } } },
        {
          $group: {
            _id: '$classId',
            total: { $sum: 1 },
            present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
            late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } }
          }
        },
        { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'class' } },
        { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
        { $project: { className: '$class.name', total: 1, present: 1, absent: 1, late: 1, percentage: { $cond: [{ $gt: ['$total', 0] }, { $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 0] }, 0] } } }
      ]),
      Attendance.aggregate([
        { $match: { institutionId, date: { $gte: weekStart, $lt: endOfDay } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            total: { $sum: 1 },
            present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    const today = {
      total: statusStats.reduce((sum, item) => sum + item.count, 0),
      present: statusStats.find((item) => item._id === 'present')?.count || 0,
      absent: statusStats.find((item) => item._id === 'absent')?.count || 0,
      late: statusStats.find((item) => item._id === 'late')?.count || 0,
      leave: statusStats.find((item) => item._id === 'leave')?.count || 0,
    };

    res.json({
      today,
      classWise,
      trend: trend.map((item) => ({ date: item._id, total: item.total, present: item.present, percentage: item.total ? Math.round((item.present / item.total) * 100) : 0 })),
      legacy: statusStats,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get fee collection overview
router.get('/fee-overview', authenticate, authorize('head', 'finance_officer'), async (req, res) => {
  try {
    const institutionId = req.user.institutionId;

    const feeStats = await Fee.aggregate([
      { $match: { institutionId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    res.json(feeStats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get recent notices
router.get('/recent-notices', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;

    const notices = await Notice.find({
      institutionId,
      isPublished: true
    })
    .populate('postedBy', 'name')
    .sort({ publishedAt: -1 })
    .limit(5)
    .select('title category priority publishedAt');

    res.json(notices);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Summary cards for dashboard
router.get('/summary', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      totalStudents,
      totalTeachers,
      totalStaff,
      todayAttendanceCount,
      monthlyFeeCollectionAgg,
      currentMonthSalaryAgg,
      activeNotices,
      idCardsIssued
    ] = await Promise.all([
      Student.countDocuments({ institutionId, isActive: true }),
      Teacher.countDocuments({ institutionId, isActive: true }),
      Staff.countDocuments({ institutionId, isActive: true }),
      Attendance.countDocuments({ institutionId, date: { $gte: startOfDay, $lt: endOfDay }, status: 'present' }),
      Fee.aggregate([
        { $match: { institutionId, status: 'paid', paidDate: { $gte: startOfMonth, $lt: endOfMonth } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Salary.aggregate([
        { $match: { institutionId, status: 'paid', paymentDate: { $gte: startOfMonth, $lt: endOfMonth } } },
        { $group: { _id: null, total: { $sum: '$netSalary' } } }
      ]),
      Notice.countDocuments({ institutionId, isPublished: true }),
      IDCard.countDocuments({ institutionId, status: 'active' })
    ]);

    const monthlyFeeCollection = (monthlyFeeCollectionAgg[0] && monthlyFeeCollectionAgg[0].total) || 0;
    const currentMonthSalary = (currentMonthSalaryAgg[0] && currentMonthSalaryAgg[0].total) || 0;

    res.json({
      totalStudents,
      totalTeachers,
      totalStaff,
      todayAttendanceCount,
      monthlyFeeCollection,
      currentMonthSalary,
      activeNotices,
      idCardsIssued
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Charts endpoint: composition, attendance (dailyByClass, weekly, monthly), financial (last 12 months)
router.get('/charts', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const now = new Date();

    // Composition
    const [studentsCount, teachersCount, staffCount] = await Promise.all([
      Student.countDocuments({ institutionId, isActive: true }),
      Teacher.countDocuments({ institutionId, isActive: true }),
      Staff.countDocuments({ institutionId, isActive: true })
    ]);

    const composition = [
      { name: 'Students', value: studentsCount },
      { name: 'Teachers', value: teachersCount },
      { name: 'Staff', value: staffCount }
    ];

    // Attendance - daily by class (today)
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const dailyByClass = await Attendance.aggregate([
      { $match: { institutionId: toObjectId(institutionId), date: { $gte: startOfDay, $lt: endOfDay } } },
      { $group: {
        _id: '$classId',
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }
      } },
      { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'class' } },
      { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
      { $project: {
        classId: '$_id',
        className: '$class.name',
        total: 1,
        present: 1,
        percentage: { $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 0] }
      } }
    ]);

    // Weekly: last 7 days daily percentage
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push(d);
    }
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

    const weeklyAgg = await Attendance.aggregate([
      { $match: { institutionId: toObjectId(institutionId), date: { $gte: weekStart, $lt: endOfDay } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }
      } },
      { $sort: { _id: 1 } }
    ]);

    const weekly = days.map((d) => {
      const key = d.toISOString().split('T')[0];
      const found = weeklyAgg.find((w: any) => w._id === key);
      const total = found ? found.total : 0;
      const present = found ? found.present : 0;
      return { date: key, total, present, percentage: total > 0 ? Math.round((present / total) * 100) : 0 };
    });

    // Monthly attendance overview (last 12 months)
    const months: string[] = [];
    const monthlyStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    for (let i = 11; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
    }

    const monthlyAgg = await Attendance.aggregate([
      { $match: { institutionId: toObjectId(institutionId), date: { $gte: monthlyStart, $lt: endOfDay } } },
      { $group: {
        _id: { year: { $year: '$date' }, month: { $month: '$date' } },
        total: { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }
      } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const monthly = months.map((label) => {
      const [y, m] = label.split('-').map(Number);
      const found = monthlyAgg.find((it: any) => it._id.year === y && it._id.month === m);
      const total = found ? found.total : 0;
      const present = found ? found.present : 0;
      return { month: label, total, present, percentage: total > 0 ? Math.round((present / total) * 100) : 0 };
    });

    // Financial trends - last 12 months
    const financialMonths: string[] = [];
    const feeSeries: number[] = [];
    const salarySeries: number[] = [];
    const dueSeries: number[] = [];

    for (let i = 11; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = new Date(m.getFullYear(), m.getMonth(), 1);
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const label = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      financialMonths.push(label);

      const feeAgg = await Fee.aggregate([
        { $match: { institutionId: toObjectId(institutionId), status: 'paid', paidDate: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const feeTotal = (feeAgg[0] && feeAgg[0].total) || 0;
      feeSeries.push(feeTotal);

      const salaryAgg = await Salary.aggregate([
        { $match: { institutionId: toObjectId(institutionId), status: 'paid', paymentDate: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$netSalary' } } }
      ]);
      const salaryTotal = (salaryAgg[0] && salaryAgg[0].total) || 0;
      salarySeries.push(salaryTotal);

      const dueAgg = await Fee.aggregate([
        { $match: { institutionId: toObjectId(institutionId), status: { $in: ['pending', 'overdue'] }, dueDate: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const dueTotal = (dueAgg[0] && dueAgg[0].total) || 0;
      dueSeries.push(dueTotal);
    }

    res.json({
      composition,
      attendance: { dailyByClass, weekly, monthly },
      financial: { months: financialMonths, feeCollected: feeSeries, salaryPaid: salarySeries, dueFees: dueSeries }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error });
  }
});

// Compatibility composition route
router.get('/composition', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const [studentsCount, teachersCount, staffCount] = await Promise.all([
      Student.countDocuments({ institutionId, isActive: true }),
      Teacher.countDocuments({ institutionId, isActive: true }),
      Staff.countDocuments({ institutionId, isActive: true })
    ]);
    res.json([
      { name: 'Students', value: studentsCount },
      { name: 'Teachers', value: teachersCount },
      { name: 'Staff', value: staffCount }
    ]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

export default router;
