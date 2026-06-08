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
const idOf = (v: any) => String(v?._id || v?.id || v || '');
const safe = (v: any) => String(v || '').trim();
const isOid = (v: any) => /^[a-f0-9]{24}$/i.test(String(v || ''));
const show = (v: any, fallback = '-') => { const s = safe(v); return s && !isOid(s) ? s : fallback; };

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
  const uri = safe(activeMongo?.uri || setting.mongodbUrl || req.user?.institution?.settings?.mongodbUri);
  if (!uri) { const error: any = new Error('School MongoDB URI missing. Settings-এ active MongoDB URI save করুন।'); error.statusCode = 428; throw error; }
  return uri;
}

async function connectionFor(req: any) {
  const uri = await activeMongoUri(req);
  if (!connections.has(uri)) connections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise());
  const connection = await connections.get(uri)!;
  await connection.db.admin().ping();
  return connection;
}

async function models(req: any) {
  const c = await connectionFor(req);
  const model = (name: string, base: any) => c.models[name] || c.model(name, base.schema, base.collection?.name || name);
  return { Fee: model('Fee', Fee), Payment: model('Payment', Payment), Salary: model('Salary', Salary), User: model('User', User), Student: model('Student', Student), Class: model('Class', ClassModel), Section: model('Section', Section), StudentInvoice: model('StudentInvoice', StudentInvoice), StudentFeePayment: model('StudentFeePayment', StudentFeePayment) };
}

const range = (q: any) => { const now = new Date(); const start = q.startDate ? new Date(`${q.startDate}T00:00:00.000Z`) : new Date(now.getFullYear(), now.getMonth(), 1); const endBase = q.endDate ? new Date(`${q.endDate}T00:00:00.000Z`) : now; const end = new Date(endBase); end.setDate(end.getDate() + 1); return { start, end }; };
const day = (v: any) => { const d = new Date(v || Date.now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function enrich(M: any, rows: any[]) {
  const ids = [...new Set(rows.map((r: any) => idOf(r.studentId?._id || r.studentId)).filter(Boolean))];
  if (!ids.length) return rows;
  const students = await M.Student.find({ _id: { $in: ids } }).populate('userId', 'name username email phone avatar').populate('classId', 'name grade').populate('sectionId', 'name').lean().catch(() => []);
  const map = new Map(students.map((s: any) => [idOf(s._id), s]));
  return rows.map((row: any) => {
    const sid = idOf(row.studentId?._id || row.studentId);
    const s: any = map.get(sid) || (typeof row.studentId === 'object' ? row.studentId : null);
    if (!s) return row;
    const student = { ...s, name: show(s.userId?.name || s.name || s.guardianName, 'Student'), rollNumber: show(s.rollNumber), className: show(s.classId?.name || s.className), sectionName: show(s.sectionId?.name || s.sectionName), guardianName: show(s.guardianName, ''), guardianPhone: show(s.guardianPhone, '') };
    return { ...row, studentId: student, student, studentName: student.name, rollNumber: student.rollNumber, className: student.className, sectionName: student.sectionName };
  });
}

router.use(authenticate, canManageFinance());

router.get('/', async (req: any, res) => {
  try {
    const M = await models(req);
    const { start, end } = range(req.query);
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
    const collections = await enrich(M, [...paymentsRaw, ...invoicePayments]);
    const dues = await enrich(M, [...duesRaw, ...invoiceDuesRaw.map((inv: any) => ({ ...inv, amount: inv.dueAmount, type: inv.feeType || 'monthly', month: inv.month, year: inv.year }))]);
    const trendMap = new Map<string, number>();
    [...paymentsRaw, ...invoicePayments].forEach((p: any) => trendMap.set(day(p.paymentDate), (trendMap.get(day(p.paymentDate)) || 0) + Number(p.amount || 0)));
    const typeMap = new Map<string, number>();
    allFeesRaw.forEach((f: any) => typeMap.set(f.type || 'other', (typeMap.get(f.type || 'other') || 0) + Number(f.amount || 0)));
    allInvoicesRaw.forEach((i: any) => typeMap.set(i.feeType || 'monthly', (typeMap.get(i.feeType || 'monthly') || 0) + Number(i.totalAmount || 0)));
    const classMap = new Map<string, any>();
    collections.forEach((p: any) => { const key = `${p.className || p.studentId?.className || '-'}-${p.sectionName || p.studentId?.sectionName || '-'}`; const row = classMap.get(key) || { className: p.className || p.studentId?.className || '-', sectionName: p.sectionName || p.studentId?.sectionName || '-', totalAmount: 0, count: 0, students: [] }; row.totalAmount += Number(p.amount || 0); row.count += 1; row.students.push({ name: p.studentName || p.studentId?.name || 'Student', rollNumber: p.rollNumber || p.studentId?.rollNumber || '-', amount: Number(p.amount || 0), receiptNumber: p.receiptNumber || p.receiptNo, paymentDate: p.paymentDate }); classMap.set(key, row); });
    const summary = { totalCollection: [...paymentsRaw, ...invoicePayments].reduce((s: number, p: any) => s + Number(p.amount || 0), 0), totalDue: dues.reduce((s: number, d: any) => s + Number(d.amount || d.dueAmount || 0), 0), totalSalary: salariesRaw.reduce((s: number, p: any) => s + Number(p.netSalary || 0), 0), collectionCount: paymentsRaw.length + invoicePayments.length, dueCount: dues.length, salaryCount: salariesRaw.length };
    res.json({ reports: { collections, dues, salaries: salariesRaw, trend: [...trendMap.entries()].map(([name, value]) => ({ name, value })), byType: [...typeMap.entries()].map(([name, value]) => ({ name, value })), classSummary: [...classMap.values()], summary }, source: 'settings-active-mongodb-direct' });
  } catch (error: any) { res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load finance reports', error }); }
});

export default router;
