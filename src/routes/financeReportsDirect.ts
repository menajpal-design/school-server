import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageFinance } from '../middleware/auth';
import Fee from '../models/Fee';
import Payment from '../models/Payment';
import Salary from '../models/Salary';
import User from '../models/User';
import Student from '../models/Student';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import StudentInvoice from '../models/StudentInvoice';
import StudentFeePayment from '../models/StudentFeePayment';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const connections = new Map<string, Promise<mongoose.Connection>>();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);

const normalizeMongoItems = (config: any = {}) => {
  const existing = Array.isArray(config.mongodbUris) ? config.mongodbUris : [];
  const items = existing.map((item: any, index: number) => ({ id: item.id || `mongo-${index + 1}`, uri: item.uri || item.mongodbUrl || '', isActive: item.isActive === true })).filter((item: any) => item.uri);
  if (config.mongodbUrl && !items.some((item: any) => item.uri === config.mongodbUrl)) items.push({ id: `mongo-${items.length + 1}`, uri: config.mongodbUrl, isActive: true });
  if (items.length && !items.some((item: any) => item.isActive)) items[items.length - 1].isActive = true;
  return items;
};

async function activeMongoUri(req: any) {
  const scoped: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config', institutionId: req.user.institutionId }).lean())?.value || null);
  const setting: any = scoped || await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  const items = normalizeMongoItems(setting);
  const activeMongo = items.find((item: any) => item.isActive) || items[items.length - 1];
  const uri = String(activeMongo?.uri || setting.mongodbUrl || req.user?.institution?.settings?.mongodbUri || '').trim();
  if (!uri) { const error: any = new Error('School MongoDB URI missing. Settings-এ active MongoDB URI save করুন।'); error.statusCode = 428; throw error; }
  return uri;
}

async function getConnection(req: any) {
  const uri = await activeMongoUri(req);
  if (!connections.has(uri)) connections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise());
  try { const connection = await connections.get(uri)!; await connection.db.admin().ping(); return connection; }
  catch (error: any) { connections.delete(uri); const e: any = new Error(`Active Settings MongoDB connection failed for Finance Reports: ${error?.message || 'unknown error'}`); e.statusCode = 503; throw e; }
}

async function models(req: any) {
  const connection = await getConnection(req);
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  const Class = model('Class', ClassModel);
  const SectionModel = model('Section', Section);
  return { Fee: model('Fee', Fee), Payment: model('Payment', Payment), Salary: model('Salary', Salary), Student: model('Student', Student), Class, Section: SectionModel, StudentInvoice: model('StudentInvoice', StudentInvoice), StudentFeePayment: model('StudentFeePayment', StudentFeePayment) };
}

const dayKey = (value: any) => { const date = new Date(value || Date.now()); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const dateRange = (query: any) => { const now = new Date(); const start = query.startDate ? new Date(`${query.startDate}T00:00:00.000Z`) : new Date(now.getFullYear(), now.getMonth(), 1); const endBase = query.endDate ? new Date(`${query.endDate}T00:00:00.000Z`) : now; const end = new Date(endBase); end.setDate(end.getDate() + 1); return { start, end }; };

async function enrichStudents(items: any[]) {
  const studentIds = [...new Set(items.map((item: any) => String(item.studentId?._id || item.studentId || '')).filter(Boolean))];
  if (!studentIds.length) return items;
  const students = await primaryDb(() => Student.find({ _id: { $in: studentIds } }).select('userId rollNumber guardianName guardianPhone classId sectionId').lean().catch(() => []));
  const studentMap = new Map((students as any[]).map((s: any) => [String(s._id), s]));
  const userIds = [...new Set((students as any[]).map((s: any) => String(s.userId || '')).filter(Boolean))];
  const users = await primaryDb(() => User.find({ _id: { $in: userIds } }).select('name username email phone avatar').lean().catch(() => []));
  const userMap = new Map((users as any[]).map((u: any) => [String(u._id), u]));
  return items.map((item: any) => {
    const plain = typeof item?.toObject === 'function' ? item.toObject() : item;
    const sid = String(plain.studentId?._id || plain.studentId || '');
    const student: any = studentMap.get(sid);
    if (!student) return plain;
    return { ...plain, studentId: { ...student, userId: userMap.get(String(student.userId)) || student.userId } };
  });
}

router.use(authenticate, canManageFinance());

router.get('/', async (req: any, res) => {
  try {
    const M = await models(req);
    const { start, end } = dateRange(req.query);
    const institutionId = req.user.institutionId;

    const [paymentsRaw, invoicePaymentsRaw, duesRaw, invoiceDuesRaw, salariesRaw, allFeesRaw, allInvoicesRaw] = await Promise.all([
      M.Payment.find({ institutionId, paymentDate: { $gte: start, $lt: end } }).populate('feeId', 'type month year amount').sort({ paymentDate: -1 }).lean(),
      M.StudentFeePayment.find({ institutionId, paidAt: { $gte: start, $lt: end } }).populate('invoiceId', 'invoiceNo feeType month year totalAmount dueAmount').sort({ paidAt: -1 }).lean(),
      M.Fee.find({ institutionId, status: { $in: ['pending', 'overdue'] }, dueDate: { $lt: end } }).populate('classId', 'name grade').sort({ dueDate: 1 }).lean(),
      M.StudentInvoice.find({ institutionId, status: { $in: ['unpaid', 'partial', 'overdue'] }, dueDate: { $lt: end } }).populate('classId', 'name grade').sort({ dueDate: 1 }).lean(),
      M.Salary.find({ institutionId, paymentDate: { $gte: start, $lt: end } }).sort({ paymentDate: -1 }).lean(),
      M.Fee.find({ institutionId }).lean(),
      M.StudentInvoice.find({ institutionId }).lean(),
    ]);

    const invoicePayments = invoicePaymentsRaw.map((p: any) => ({ ...p, receiptNumber: p.receiptNo, paymentDate: p.paidAt || p.createdAt, feeId: p.invoiceId ? { type: p.invoiceId.feeType || 'monthly', month: p.invoiceId.month, year: p.invoiceId.year, amount: p.invoiceId.totalAmount } : undefined }));
    const collections = await enrichStudents([...paymentsRaw, ...invoicePayments]);
    const dues = await enrichStudents([...duesRaw, ...invoiceDuesRaw.map((inv: any) => ({ ...inv, amount: inv.dueAmount, type: inv.feeType || 'monthly', month: inv.month, year: inv.year }))]);
    const salaries = salariesRaw;

    const trendMap = new Map<string, number>();
    for (const payment of [...paymentsRaw, ...invoicePayments] as any[]) { const key = dayKey(payment.paymentDate); trendMap.set(key, (trendMap.get(key) || 0) + Number(payment.amount || 0)); }
    const trend = [...trendMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => ({ name, value }));

    const typeMap = new Map<string, number>();
    for (const fee of allFeesRaw as any[]) { const type = fee.type || 'other'; typeMap.set(type, (typeMap.get(type) || 0) + Number(fee.amount || 0)); }
    for (const inv of allInvoicesRaw as any[]) { const type = inv.feeType || 'monthly'; typeMap.set(type, (typeMap.get(type) || 0) + Number(inv.totalAmount || 0)); }
    const byType = [...typeMap.entries()].map(([name, value]) => ({ name, value }));

    const summary = {
      totalCollection: [...paymentsRaw, ...invoicePayments].reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0),
      totalDue: dues.reduce((sum: number, item: any) => sum + Number(item.amount || item.dueAmount || 0), 0),
      totalSalary: salariesRaw.reduce((sum: number, item: any) => sum + Number(item.netSalary || 0), 0),
      collectionCount: paymentsRaw.length + invoicePayments.length,
      dueCount: dues.length,
      salaryCount: salariesRaw.length,
    };

    res.json({ reports: { collections, dues, salaries, trend, byType, summary }, source: 'settings-active-mongodb-direct' });
  } catch (error: any) { res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load finance reports', error }); }
});

export default router;
