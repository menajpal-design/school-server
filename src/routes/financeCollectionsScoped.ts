import express from 'express';
import mongoose from 'mongoose';
import { authenticate, normalizeRole } from '../middleware/auth';
import Student from '../models/Student';
import Fee from '../models/Fee';
import Payment from '../models/Payment';
import StudentInvoice from '../models/StudentInvoice';
import StudentFeePayment from '../models/StudentFeePayment';
import User from '../models/User';
import Teacher from '../models/Teacher';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';
import { writeAuditLog } from '../services/auditService';

const router = express.Router();
const connections = new Map<string, Promise<mongoose.Connection>>();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const receiptNumber = () => `RCPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const invoiceReceiptNumber = () => `INV-RCPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const money = (v: any) => Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0;
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
  if (!uri) { const error: any = new Error('School MongoDB URI missing. Settings active MongoDB URI save করুন।'); error.statusCode = 428; throw error; }
  return uri;
}
async function models(req: any) {
  const uri = await activeMongoUri(req);
  if (!connections.has(uri)) connections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise());
  const connection = await connections.get(uri)!;
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return { Student: model('Student', Student), Fee: model('Fee', Fee), Payment: model('Payment', Payment), StudentInvoice: model('StudentInvoice', StudentInvoice), StudentFeePayment: model('StudentFeePayment', StudentFeePayment), Teacher: model('Teacher', Teacher), Class: model('Class', ClassModel), Section: model('Section', Section) };
}
async function enrichUsers(rows: any[]) { const ids = [...new Set(rows.map((x: any) => String(x.userId?._id || x.userId || '')).filter(Boolean))]; const users = await primaryDb(() => User.find({ _id: { $in: ids } }).select('name phone email avatar').lean()); const map = new Map(users.map((u: any) => [String(u._id), u])); return rows.map((row: any) => ({ ...row, userId: typeof row.userId === 'object' && row.userId?.name ? row.userId : (map.get(String(row.userId?._id || row.userId || '')) || row.userId) })); }
function canOpenFinance(user: any) { const role = normalizeRole(user?.role); const permissions = Array.isArray(user?.permissions) ? user.permissions : []; return ['head', 'assistant_head', 'finance_officer', 'class_teacher'].includes(role) || permissions.includes('manage:finance'); }
async function classTeacherClassIds(M: any, req: any) { if (normalizeRole(req.user.role) !== 'class_teacher') return null; const teacher: any = await M.Teacher.findOne({ institutionId: req.user.institutionId, userId: req.user._id, isActive: { $ne: false } }).select('assignedClasses').lean(); return (teacher?.assignedClasses || []).map((x: any) => String(x?._id || x)).filter(Boolean); }
async function assertClassTeacherStudent(M: any, req: any, student: any) { const scope = await classTeacherClassIds(M, req); if (!scope) return; if (!scope.length) throw Object.assign(new Error('No assigned class found for this class teacher.'), { statusCode: 403 }); if (!scope.includes(String(student.classId?._id || student.classId))) throw Object.assign(new Error('Class Teacher can collect fee only from own assigned class students.'), { statusCode: 403 }); }
function feeAppliesToStudent(fee: any, student: any) { const studentMatch = fee.studentId && String(fee.studentId) === String(student._id); const classMatch = !fee.studentId && fee.classId && String(fee.classId) === String(student.classId?._id || student.classId); return Boolean(studentMatch || classMatch); }
async function feeDueForStudent(M: any, fee: any, studentId: any) { const totalPaid = await M.Payment.aggregate([{ $match: { institutionId: fee.institutionId, feeId: fee._id, studentId: new mongoose.Types.ObjectId(String(studentId)) } }, { $group: { _id: null, total: { $sum: '$amount' } } }]); const paid = money(totalPaid[0]?.total || 0); return money(Number(fee.amount || 0) - paid); }
async function dueForStudent(M: any, student: any, fees: any[], invoices: any[]) { const invoiceDue = invoices.reduce((sum: number, inv: any) => String(inv.studentId) === String(student._id) ? sum + Number(inv.dueAmount || 0) : sum, 0); let feeDue = 0; for (const fee of fees.filter((f: any) => feeAppliesToStudent(f, student))) feeDue += await feeDueForStudent(M, fee, student._id); return money(invoiceDue + feeDue); }

router.use(authenticate);
router.use((req: any, res, next) => canOpenFinance(req.user) ? next() : res.status(403).json({ message: 'Access denied. Finance management only.' }));

router.get('/', async (req: any, res) => {
  try {
    const M = await models(req); const role = normalizeRole(req.user.role); const term = String(req.query.search || '').trim().toLowerCase(); const studentQuery: any = { institutionId: req.user.institutionId };
    const scope = await classTeacherClassIds(M, req); if (scope) { if (!scope.length) return res.json({ students: [], collections: [], source: 'class-teacher-no-class-scope' }); studentQuery.classId = { $in: scope }; }
    const rows = await M.Student.find(studentQuery).populate('classId', 'name grade').populate('sectionId', 'name').limit(200).lean(); const students = await enrichUsers(rows);
    const [fees, invoices] = await Promise.all([
      M.Fee.find({ institutionId: req.user.institutionId, status: { $in: ['pending', 'overdue'] } }).lean(),
      M.StudentInvoice.find({ institutionId: req.user.institutionId, status: { $in: ['unpaid', 'partial', 'overdue'] } }).lean(),
    ]);
    const filtered = students.filter((s: any) => !term || [s.userId?.name, s.userId?.phone, s.rollNumber, s.guardianName, s.guardianPhone, s.classId?.name, s.sectionId?.name].join(' ').toLowerCase().includes(term));
    const result = await Promise.all(filtered.map(async (student: any) => ({ ...student, dueAmount: await dueForStudent(M, student, fees, invoices) })));
    res.json({ students: result, collections: [], source: role === 'class_teacher' ? 'class-teacher-own-class' : 'settings-active-mongodb-direct' });
  } catch (error: any) { res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load collections', error }); }
});

router.post('/collect', async (req: any, res) => {
  try {
    const M = await models(req); const student: any = await M.Student.findOne({ _id: req.body.studentId, institutionId: req.user.institutionId }).lean(); if (!student) return res.status(404).json({ message: 'Student not found.' }); await assertClassTeacherStudent(M, req, student);
    const invoice = await M.StudentInvoice.findOne({ institutionId: req.user.institutionId, studentId: student._id, status: { $in: ['unpaid', 'partial', 'overdue'] } }).sort({ year: 1, month: 1, dueDate: 1 });
    if (invoice) {
      const paidAmount = money(req.body.amount); const payableAmount = money(invoice.dueAmount); if (paidAmount <= 0) return res.status(400).json({ message: 'Enter a valid payment amount.' }); if (paidAmount > payableAmount) return res.status(400).json({ message: 'Payment amount cannot be greater than due amount.', dueAmount: payableAmount });
      const record = await M.StudentFeePayment.create({ invoiceId: invoice._id, studentId: student._id, amount: paidAmount, paymentMethod: req.body.paymentMethod || 'cash', status: 'verified', collectedBy: req.user._id, collectedByRole: normalizeRole(req.user.role), note: req.body.notes || 'Offline fee collection', receiptNo: invoiceReceiptNumber(), institutionId: req.user.institutionId });
      invoice.paidAmount = money(Number(invoice.paidAmount || 0) + paidAmount); invoice.dueAmount = money(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0)); invoice.status = invoice.dueAmount <= 0 ? 'paid' : 'partial'; await invoice.save();
      await writeAuditLog(req, 'create', 'student-invoice-collection', record._id, record).catch(() => undefined); return res.status(201).json({ payment: record, invoice, message: 'Fee collected successfully.' });
    }
    const fee = await M.Fee.findOne({ institutionId: req.user.institutionId, status: { $in: ['pending', 'overdue'] }, $or: [{ studentId: student._id }, { studentId: { $exists: false }, classId: student.classId }, { studentId: null, classId: student.classId }] }).sort({ dueDate: 1 });
    if (!fee) return res.status(404).json({ message: 'No due fee found for this student.' });
    const paidAmount = money(req.body.amount); const payableAmount = await feeDueForStudent(M, fee, student._id); if (paidAmount <= 0) return res.status(400).json({ message: 'Enter a valid payment amount.' }); if (payableAmount <= 0) return res.status(400).json({ message: 'This student has no due amount for this fee.' }); if (paidAmount > payableAmount) return res.status(400).json({ message: 'Payment amount cannot be greater than due amount.', dueAmount: payableAmount });
    const payment = await M.Payment.create({ feeId: fee._id, studentId: student._id, amount: paidAmount, paymentMethod: req.body.paymentMethod || 'cash', paymentDate: new Date(), collectedBy: req.user._id, notes: req.body.notes || 'Offline fee collection', receiptNumber: receiptNumber(), institutionId: req.user.institutionId });
    if (fee.studentId) { const remaining = money(payableAmount - paidAmount); fee.amount = remaining; fee.status = remaining <= 0 ? 'paid' : 'pending'; fee.paidDate = remaining <= 0 ? new Date() : undefined; fee.paymentMethod = req.body.paymentMethod || 'cash'; await fee.save(); }
    const [enrichedStudent] = await enrichUsers([student]); const created = { ...(payment.toObject ? payment.toObject() : payment), studentId: enrichedStudent, feeId: fee };
    await writeAuditLog(req, 'create', 'fee-collection', payment._id, created).catch(() => undefined); res.status(201).json({ payment: created, message: 'Fee collected successfully.' });
  } catch (error: any) { res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to collect fee.', error }); }
});
export default router;
