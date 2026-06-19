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
import SiteSetting from '../models/SiteSetting';
import mongoose from 'mongoose';
import { runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();

const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const dashboardConnections = new Map<string, Promise<mongoose.Connection>>();
const toObjectId = (id: unknown) => new mongoose.Types.ObjectId(String(id));
const isObjectId = (id: unknown) => mongoose.Types.ObjectId.isValid(String(id || ''));

const normalizeMongoItems = (config: any = {}) => {
  const existing = Array.isArray(config.mongodbUris) ? config.mongodbUris : [];
  const items = existing
    .map((item: any, index: number) => ({ id: item.id || `mongo-${index + 1}`, uri: item.uri || item.mongodbUrl || '', isActive: item.isActive === true }))
    .filter((item: any) => item.uri);
  if (config.mongodbUrl && !items.some((item: any) => item.uri === config.mongodbUrl)) items.push({ id: `mongo-${items.length + 1}`, uri: config.mongodbUrl, isActive: true });
  if (items.length && !items.some((item: any) => item.isActive)) items[items.length - 1].isActive = true;
  return items;
};

async function activeMongoUri(req: any) {
  const setting: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  const items = normalizeMongoItems(setting);
  const activeMongo = items.find((item: any) => item.isActive) || items[items.length - 1];
  return String(activeMongo?.uri || setting.mongodbUrl || req.user?.institution?.settings?.mongodbUri || '').trim();
}

async function dashboardConnection(req: any) {
  const uri = await activeMongoUri(req);
  if (!uri) return null;
  if (!dashboardConnections.has(uri)) {
    dashboardConnections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise());
  }
  try {
    const connection = await dashboardConnections.get(uri)!;
    await connection.db.admin().ping();
    return connection;
  } catch (error) {
    dashboardConnections.delete(uri);
    console.warn('Dashboard active school MongoDB failed; falling back to current connection:', (error as any)?.message || error);
    return null;
  }
}

async function dashboardModels(req: any) {
  const connection = await dashboardConnection(req);
  if (!connection) return { Student, Teacher, Staff, Attendance, Fee, Notice, IDCard, Salary, Class: ClassModel, source: 'current-connection' };
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return {
    Student: model('Student', Student),
    Teacher: model('Teacher', Teacher),
    Staff: model('Staff', Staff),
    Attendance: model('Attendance', Attendance),
    Fee: model('Fee', Fee),
    Notice: model('Notice', Notice),
    IDCard: model('IDCard', IDCard),
    Salary: model('Salary', Salary),
    Class: model('Class', ClassModel),
    source: 'active-settings-mongo',
  };
}

const institutionFilter = (institutionId: any) => {
  const textId = String(institutionId || '');
  const values: any[] = [institutionId, textId].filter(Boolean);
  if (isObjectId(textId)) values.push(toObjectId(textId));
  return { institutionId: { $in: [...new Set(values.map((v) => String(v)))].map((v) => (isObjectId(v) ? toObjectId(v) : v)) } };
};

const activeFilter = (institutionId: any) => ({ ...institutionFilter(institutionId), isActive: { $ne: false } });
const aggInstitutionMatch = (institutionId: any, extra: any = {}) => ({ ...institutionFilter(institutionId), ...extra });

async function userRoleCount(institutionId: any, roles: string[]) {
  return primaryDb(() => User.countDocuments({ ...institutionFilter(institutionId), role: { $in: roles }, isActive: { $ne: false } }));
}

async function profileAndUserCount(model: any, institutionId: any, userRoles: string[]) {
  const [profileCount, primaryUserCount] = await Promise.all([
    model.countDocuments(activeFilter(institutionId)),
    userRoleCount(institutionId, userRoles),
  ]);
  return Math.max(Number(profileCount || 0), Number(primaryUserCount || 0));
}

async function dashboardCounts(req: any) {
  const institutionId = req.user.institutionId;
  const M = await dashboardModels(req);
  const [totalStudents, totalTeachers, totalStaff] = await Promise.all([
    profileAndUserCount(M.Student, institutionId, ['student']),
    profileAndUserCount(M.Teacher, institutionId, ['teacher', 'subject_teacher', 'class_teacher']),
    profileAndUserCount(M.Staff, institutionId, ['staff', 'finance_officer']),
  ]);
  return { M, totalStudents, totalTeachers, totalStaff };
}

// Get dashboard statistics
router.get('/stats', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const { M, totalStudents, totalTeachers, totalStaff } = await dashboardCounts(req);
    const [todayAttendance, pendingFees, activeNotices] = await Promise.all([
      M.Attendance.countDocuments({ ...institutionFilter(institutionId), date: new Date().toISOString().split('T')[0], status: 'present' }),
      M.Fee.countDocuments({ ...institutionFilter(institutionId), status: 'pending' }),
      M.Notice.countDocuments({ ...institutionFilter(institutionId), isPublished: true }),
    ]);

    res.json({ totalStudents, totalTeachers, totalStaff, todayAttendance, pendingFees, activeNotices });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get attendance overview
router.get('/attendance-overview', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const M = await dashboardModels(req);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

    const [statusStats, classWise, trend] = await Promise.all([
      M.Attendance.aggregate([
        { $match: aggInstitutionMatch(institutionId, { date: { $gte: startOfDay, $lt: endOfDay } }) },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      M.Attendance.aggregate([
        { $match: aggInstitutionMatch(institutionId, { date: { $gte: startOfDay, $lt: endOfDay } }) },
        { $group: { _id: '$classId', total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }, late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } } } },
        { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'class' } },
        { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
        { $project: { className: '$class.name', total: 1, present: 1, absent: 1, late: 1, percentage: { $cond: [{ $gt: ['$total', 0] }, { $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 0] }, 0] } } },
      ]),
      M.Attendance.aggregate([
        { $match: aggInstitutionMatch(institutionId, { date: { $gte: weekStart, $lt: endOfDay } }) },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const today = {
      total: statusStats.reduce((sum: number, item: any) => sum + item.count, 0),
      present: statusStats.find((item: any) => item._id === 'present')?.count || 0,
      absent: statusStats.find((item: any) => item._id === 'absent')?.count || 0,
      late: statusStats.find((item: any) => item._id === 'late')?.count || 0,
      leave: statusStats.find((item: any) => item._id === 'leave')?.count || 0,
    };

    res.json({ today, classWise, trend: trend.map((item: any) => ({ date: item._id, total: item.total, present: item.present, percentage: item.total ? Math.round((item.present / item.total) * 100) : 0 })), legacy: statusStats });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get fee collection overview
router.get('/fee-overview', authenticate, authorize('admin', 'super_admin', 'head', 'finance_officer'), async (req, res) => {
  try {
    const M = await dashboardModels(req);
    const feeStats = await M.Fee.aggregate([
      { $match: institutionFilter(req.user.institutionId) },
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]);
    res.json(feeStats);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get recent notices
router.get('/recent-notices', authenticate, async (req, res) => {
  try {
    const M = await dashboardModels(req);
    const notices = await (M.Notice as any).find({ ...institutionFilter(req.user.institutionId), isPublished: true })
      .populate('postedBy', 'name')
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(5)
      .select('title category priority publishedAt createdAt');
    res.json(notices);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Summary cards for dashboard
router.get('/summary', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const { M, totalStudents, totalTeachers, totalStaff } = await dashboardCounts(req);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [todayAttendanceCount, monthlyFeeCollectionAgg, currentMonthSalaryAgg, activeNotices, idCardsIssued] = await Promise.all([
      M.Attendance.countDocuments({ ...institutionFilter(institutionId), date: { $gte: startOfDay, $lt: endOfDay }, status: 'present' }),
      M.Fee.aggregate([{ $match: aggInstitutionMatch(institutionId, { status: 'paid', paidDate: { $gte: startOfMonth, $lt: endOfMonth } }) }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      M.Salary.aggregate([{ $match: aggInstitutionMatch(institutionId, { status: 'paid', paymentDate: { $gte: startOfMonth, $lt: endOfMonth } }) }, { $group: { _id: null, total: { $sum: '$netSalary' } } }]),
      M.Notice.countDocuments({ ...institutionFilter(institutionId), isPublished: true }),
      M.IDCard.countDocuments({ ...institutionFilter(institutionId), status: 'active' }),
    ]);

    res.json({
      totalStudents,
      totalTeachers,
      totalStaff,
      todayAttendanceCount,
      monthlyFeeCollection: (monthlyFeeCollectionAgg[0] && monthlyFeeCollectionAgg[0].total) || 0,
      currentMonthSalary: (currentMonthSalaryAgg[0] && currentMonthSalaryAgg[0].total) || 0,
      activeNotices,
      idCardsIssued,
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});

// Charts endpoint: composition, attendance (dailyByClass, weekly, monthly), financial (last 12 months)
router.get('/charts', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const { M, totalStudents, totalTeachers, totalStaff } = await dashboardCounts(req);
    const now = new Date();
    const composition = [
      { name: 'Students', value: totalStudents },
      { name: 'Teachers', value: totalTeachers },
      { name: 'Staff', value: totalStaff },
    ];

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dailyByClass = await M.Attendance.aggregate([
      { $match: aggInstitutionMatch(institutionId, { date: { $gte: startOfDay, $lt: endOfDay } }) },
      { $group: { _id: '$classId', total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } } } },
      { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'class' } },
      { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
      { $project: { classId: '$_id', className: '$class.name', total: 1, present: 1, percentage: { $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 0] } } },
    ]);

    const days = [];
    for (let i = 6; i >= 0; i--) days.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const weeklyAgg = await M.Attendance.aggregate([
      { $match: aggInstitutionMatch(institutionId, { date: { $gte: weekStart, $lt: endOfDay } }) },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]);
    const weekly = days.map((d) => {
      const key = d.toISOString().split('T')[0];
      const found = weeklyAgg.find((w: any) => w._id === key);
      const total = found ? found.total : 0;
      const present = found ? found.present : 0;
      return { date: key, total, present, percentage: total > 0 ? Math.round((present / total) * 100) : 0 };
    });

    const months: string[] = [];
    const monthlyStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    for (let i = 11; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
    }
    const monthlyAgg = await M.Attendance.aggregate([
      { $match: aggInstitutionMatch(institutionId, { date: { $gte: monthlyStart, $lt: endOfDay } }) },
      { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' } }, total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);
    const monthly = months.map((label) => {
      const [y, m] = label.split('-').map(Number);
      const found = monthlyAgg.find((it: any) => it._id.year === y && it._id.month === m);
      const total = found ? found.total : 0;
      const present = found ? found.present : 0;
      return { month: label, total, present, percentage: total > 0 ? Math.round((present / total) * 100) : 0 };
    });

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
      const [feeAgg, salaryAgg, dueAgg] = await Promise.all([
        M.Fee.aggregate([{ $match: aggInstitutionMatch(institutionId, { status: 'paid', paidDate: { $gte: start, $lt: end } }) }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        M.Salary.aggregate([{ $match: aggInstitutionMatch(institutionId, { status: 'paid', paymentDate: { $gte: start, $lt: end } }) }, { $group: { _id: null, total: { $sum: '$netSalary' } } }]),
        M.Fee.aggregate([{ $match: aggInstitutionMatch(institutionId, { status: { $in: ['pending', 'overdue'] }, dueDate: { $gte: start, $lt: end } }) }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      ]);
      feeSeries.push((feeAgg[0] && feeAgg[0].total) || 0);
      salarySeries.push((salaryAgg[0] && salaryAgg[0].total) || 0);
      dueSeries.push((dueAgg[0] && dueAgg[0].total) || 0);
    }

    res.json({ composition, attendance: { dailyByClass, weekly, monthly }, financial: { months: financialMonths, feeCollected: feeSeries, salaryPaid: salarySeries, dueFees: dueSeries } });
  } catch (error) {
    console.error('Dashboard charts error:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});

// Compatibility composition route
router.get('/composition', authenticate, async (req, res) => {
  try {
    const { totalStudents, totalTeachers, totalStaff } = await dashboardCounts(req);
    res.json([
      { name: 'Students', value: totalStudents },
      { name: 'Teachers', value: totalTeachers },
      { name: 'Staff', value: totalStaff },
    ]);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

export default router;