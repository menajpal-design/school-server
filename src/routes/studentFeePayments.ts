import express from 'express';
import mongoose from 'mongoose';
import { authenticate, normalizeRole } from '../middleware/auth';
import Fee from '../models/Fee';
import Payment from '../models/Payment';
import ClassFeeStructure from '../models/ClassFeeStructure';
import StudentInvoice from '../models/StudentInvoice';
import StudentFeePayment from '../models/StudentFeePayment';
import Student from '../models/Student';
import Parent from '../models/Parent';
import User from '../models/User';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';
import { writeAuditLog } from '../services/auditService';

const router = express.Router();
const connections = new Map<string, Promise<mongoose.Connection>>();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const num = (v: any) => Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0;
const idOf = (value: any) => String(value?._id || value?.id || value || '');
const digits = (value: any) => String(value || '').replace(/\D/g, '');
const invoiceNo = (studentId: any, month: number, year: number) => `INV-${year}${String(month).padStart(2, '0')}-${String(studentId).slice(-6)}-${Date.now().toString().slice(-5)}`;
const roleOf = (user: any) => normalizeRole(user?.role);
const GATEWAYFLOW_ORIGIN = 'https://payment-gateway-server-ten.vercel.app';

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
  await connection.db.admin().ping();
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return { Fee: model('Fee', Fee), Payment: model('Payment', Payment), ClassFeeStructure: model('ClassFeeStructure', ClassFeeStructure), StudentInvoice: model('StudentInvoice', StudentInvoice), StudentFeePayment: model('StudentFeePayment', StudentFeePayment), Student: model('Student', Student), Parent: model('Parent', Parent), Class: model('Class', ClassModel), Section: model('Section', Section) };
}

const publicPaymentSettings = (cfg: any = {}) => {
  const recommended = cfg.recommendedGateway || {};
  const enabledProviders = Array.isArray(cfg.enabledProviders) ? cfg.enabledProviders : [];
  const onlineEnabled = Boolean(cfg.onlinePaymentEnabled ?? cfg.enabled ?? enabledProviders.some((p: string) => !['manual_cash', 'manual_bank'].includes(p)));
  const methods = Array.isArray(recommended.paymentMethods) ? recommended.paymentMethods : String(recommended.paymentMethods || 'bkash,nagad').split(',').map((x) => x.trim()).filter(Boolean);
  return {
    onlineEnabled,
    defaultProvider: cfg.defaultProvider || 'recommended_gateway',
    enabledProviders,
    recommendedGatewayUrl: recommended.origin || recommended.endpoint || cfg.recommendedGatewayUrl || GATEWAYFLOW_ORIGIN,
    gatewayFlow: {
      origin: recommended.origin || recommended.endpoint || GATEWAYFLOW_ORIGIN,
      widgetScript: recommended.widgetScript || `${GATEWAYFLOW_ORIGIN}/widget.js`,
      apiKey: recommended.apiKey || '',
      receiverNumber: recommended.receiverNumber || '',
      receiverName: recommended.receiverName || '',
      paymentMethods: methods.length ? methods : ['bkash', 'nagad'],
    },
  };
};
const paymentSettings = async (institutionId: any) => {
  const scoped: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config', institutionId }).lean())?.value || null);
  const global: any = scoped || await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  return publicPaymentSettings(global?.paymentGatewaySettings || {});
};

async function enrichUsers(students: any[]) {
  const ids = [...new Set(students.map((s: any) => idOf(s.userId)).filter(Boolean))];
  const parentIds = [...new Set(students.map((s: any) => idOf(s.parentId)).filter(Boolean))];
  const users = await primaryDb(() => User.find({ _id: { $in: [...ids, ...parentIds] } }).select('name username phone email avatar role').lean()).catch(() => []);
  const map = new Map(users.map((u: any) => [String(u._id), u]));
  return students.map((s: any) => ({ ...s, userId: map.get(idOf(s.userId)) || s.userId, parentId: map.get(idOf(s.parentId)) || s.parentId }));
}
const normalizeStudent = (student: any) => student ? { ...student, _id: student._id, name: student.userId?.name || student.name || 'Student', className: student.classId?.name || student.className || '', sectionName: student.sectionId?.name || student.sectionName || '', rollNumber: student.rollNumber || '', guardianName: student.guardianName || student.parentId?.name || '', guardianPhone: student.guardianPhone || student.parentId?.phone || '', fatherName: student.fatherName || '', motherName: student.motherName || '', dateOfBirth: student.dateOfBirth || '', address: student.address || '' } : null;
const studentFeeQuery = (student: any, institutionId: any) => ({ institutionId, $or: [{ studentId: student._id }, { studentId: { $exists: false }, classId: student.classId?._id || student.classId }, { studentId: null, classId: student.classId?._id || student.classId }] });
const normalizeInvoicePayment = (p: any, student: any) => ({ ...p, receiptNumber: p.receiptNo || p.receiptNumber, paymentDate: p.paidAt || p.createdAt, studentId: student, feeId: p.invoiceId ? { _id: p.invoiceId._id, type: p.invoiceId.feeType || 'monthly', month: p.invoiceId.month, year: p.invoiceId.year, amount: p.invoiceId.totalAmount, paidAmount: p.invoiceId.paidAmount, dueAmount: p.invoiceId.dueAmount, dueDate: p.invoiceId.dueDate, status: p.invoiceId.status } : undefined, paymentMethod: p.paymentMethod || 'cash', notes: p.note });
const normalizeOldPayment = (p: any, student: any) => ({ ...p, studentId: student, receiptNumber: p.receiptNumber || p.receiptNo, paymentDate: p.paymentDate || p.paidAt || p.createdAt, paymentMethod: p.paymentMethod || 'cash' });

async function ensureCurrentMonthInvoiceForStudent(M: any, req: any, student: any) {
  const now = new Date(); const month = now.getMonth() + 1; const year = now.getFullYear(); const institutionId = req.user.institutionId;
  if (!student?._id || !student?.classId) return;
  const classId = student.classId?._id || student.classId;
  const existing = await M.StudentInvoice.exists({ institutionId, studentId: student._id, month, year, feeType: 'monthly_tuition' });
  if (existing) return;
  const structure = await M.ClassFeeStructure.findOne({ institutionId, feeType: 'monthly_tuition', classId, isActive: true, $or: [{ effectiveFromYear: { $lt: year } }, { effectiveFromYear: year, effectiveFromMonth: { $lte: month } }] }).sort({ effectiveFromYear: -1, effectiveFromMonth: -1 }).lean();
  if (!structure) return;
  await M.StudentInvoice.create({ institutionId, studentId: student._id, classId, section: structure.section || 'All', month, year, feeType: 'monthly_tuition', invoiceNo: invoiceNo(student._id, month, year), items: [{ name: 'Monthly Tuition Fee', amount: num(structure.amount), discount: 0, lateFee: 0 }], totalAmount: num(structure.amount), paidAmount: 0, dueAmount: num(structure.amount), status: 'unpaid', dueDate: new Date(year, month - 1, Math.min(Number(structure.dueDay || 10), 28)), generatedBy: req.user._id });
}
async function findStudentForLogin(M: any, req: any) {
  const userId = req.user._id;
  const phone = digits(req.user.phone);
  let student: any = await M.Student.findOne({ institutionId: req.user.institutionId, userId }).populate('classId', 'name grade').populate('sectionId', 'name').lean();
  if (!student && phone) student = await M.Student.findOne({ institutionId: req.user.institutionId, $or: [{ guardianPhone: new RegExp(phone + '$') }, { phone: new RegExp(phone + '$') }] }).populate('classId', 'name grade').populate('sectionId', 'name').lean();
  const [enriched] = student ? await enrichUsers([student]) : [];
  return enriched || null;
}
async function findChildrenForLogin(M: any, req: any) {
  const userId = req.user._id;
  const phone = digits(req.user.phone);
  const parent = await M.Parent.findOne({ institutionId: req.user.institutionId, userId }).lean().catch(() => null);
  const ids = new Set<string>((parent?.children || []).map((x: any) => idOf(x)).filter(Boolean));
  const or: any[] = [];
  if (ids.size) or.push({ _id: { $in: [...ids] } });
  or.push({ parentId: userId });
  if (phone) or.push({ guardianPhone: new RegExp(phone + '$') }, { phone: new RegExp(phone + '$') });
  const rows = await M.Student.find({ institutionId: req.user.institutionId, $or: or }).populate('classId', 'name grade').populate('sectionId', 'name').lean();
  return await enrichUsers(rows);
}

router.get('/', authenticate, async (req: any, res) => {
  try {
    const M = await models(req);
    const settings = await paymentSettings(req.user.institutionId);
    const role = roleOf(req.user);
    const build = async (studentRaw: any) => {
      await ensureCurrentMonthInvoiceForStudent(M, req, studentRaw);
      const student = normalizeStudent(studentRaw);
      const [fees, invoices, oldPayments, invoicePayments] = await Promise.all([
        M.Fee.find(studentFeeQuery(studentRaw, req.user.institutionId)).populate('classId', 'name grade').sort({ dueDate: -1 }).lean(),
        M.StudentInvoice.find({ institutionId: req.user.institutionId, studentId: studentRaw._id }).populate('classId', 'name grade').sort({ year: -1, month: -1 }).lean(),
        M.Payment.find({ studentId: studentRaw._id, institutionId: req.user.institutionId }).populate('feeId', 'type month year amount dueDate status').sort({ paymentDate: -1, createdAt: -1 }).lean(),
        M.StudentFeePayment.find({ studentId: studentRaw._id, institutionId: req.user.institutionId }).populate('invoiceId', 'invoiceNo feeType month year totalAmount paidAmount dueAmount status dueDate').sort({ paidAt: -1, createdAt: -1 }).lean(),
      ]);
      const invoiceFees = invoices.map((inv: any) => ({ _id: `invoice-${inv._id}`, invoiceId: inv._id, studentId: studentRaw._id, classId: inv.classId, type: inv.feeType || 'monthly', month: inv.month, year: inv.year, amount: inv.dueAmount, originalAmount: inv.totalAmount, paidAmount: inv.paidAmount, status: inv.status === 'paid' ? 'paid' : inv.status === 'overdue' ? 'overdue' : inv.status === 'partial' ? 'partial' : 'pending', dueDate: inv.dueDate, invoiceNo: inv.invoiceNo, source: 'invoice' }));
      const payments = [...oldPayments.map((p: any) => normalizeOldPayment(p, student)), ...invoicePayments.map((p: any) => normalizeInvoicePayment(p, student))].sort((a: any, b: any) => new Date(b.paymentDate || b.paidAt || b.createdAt || 0).getTime() - new Date(a.paymentDate || a.paidAt || a.createdAt || 0).getTime());
      return { ...student, fees: [...invoiceFees, ...fees], invoices, payments };
    };
    if (role === 'student') {
      const student = await findStudentForLogin(M, req);
      if (!student) return res.json({ myFees: [], fees: [], invoices: [], payments: [], children: [], profileMissing: true, profileMissingReason: 'student_profile_not_linked', paymentSettings: settings });
      const row: any = await build(student);
      return res.json({ myFees: row.fees, fees: row.fees, invoices: row.invoices, payments: row.payments, children: [row], student: row, profileMissing: false, paymentSettings: settings, source: 'active-settings-mongodb' });
    }
    if (!['parent', 'guardian'].includes(role)) return res.status(403).json({ message: 'Only student or parent can view own fee portal.' });
    const children = (await Promise.all((await findChildrenForLogin(M, req)).map((student: any) => build(student)))).filter(Boolean) as any[];
    res.json({ myFees: children.flatMap((c: any) => c.fees || []), fees: children.flatMap((c: any) => c.fees || []), invoices: children.flatMap((c: any) => c.invoices || []), payments: children.flatMap((c: any) => c.payments || []), children, profileMissing: !children.length, profileMissingReason: children.length ? '' : 'children_not_linked', paymentSettings: settings, source: 'active-settings-mongodb' });
  } catch (error: any) { res.status(error?.statusCode || 500).json({ message: 'Failed to load fee data', error: error?.message || error }); }
});

router.post('/pay', authenticate, async (req: any, res) => {
  try {
    const M = await models(req);
    const settings = await paymentSettings(req.user.institutionId);
    if (!settings.onlineEnabled) return res.status(403).json({ message: 'Online payment is not enabled for this school.' });
    const role = roleOf(req.user);
    const allowed: string[] = [];
    if (role === 'student') { const student = await findStudentForLogin(M, req); if (student?._id) allowed.push(String(student._id)); }
    else if (['parent', 'guardian'].includes(role)) (await findChildrenForLogin(M, req)).forEach((child: any) => allowed.push(idOf(child?._id || child)));
    let fee: any = null; let studentId = '';
    if (String(req.body.feeId || '').startsWith('invoice-') || req.body.invoiceId) {
      const invoiceId = String(req.body.invoiceId || req.body.feeId).replace(/^invoice-/, '');
      const invoice: any = await M.StudentInvoice.findOne({ _id: invoiceId, institutionId: req.user.institutionId, status: { $in: ['unpaid', 'partial', 'overdue'] } }).lean();
      if (!invoice) return res.status(404).json({ message: 'Due invoice not found.' });
      fee = { _id: `invoice-${invoice._id}`, amount: invoice.dueAmount };
      studentId = String(invoice.studentId);
    } else {
      fee = await M.Fee.findOne({ _id: req.body.feeId, institutionId: req.user.institutionId, status: { $in: ['pending', 'overdue'] } }).lean();
      if (!fee) return res.status(404).json({ message: 'Due fee not found.' });
      studentId = String(fee.studentId || req.body.studentId || '');
    }
    if (!allowed.includes(studentId)) return res.status(403).json({ message: 'You can only pay your own or child fee.' });
    const amount = num(req.body.amount || fee.amount);
    if (amount <= 0 || amount > num(fee.amount)) return res.status(400).json({ message: 'Invalid payment amount.' });
    const orderId = `FEE-${Date.now()}-${String(fee._id).slice(-6)}`;
    await writeAuditLog(req, 'initiate', 'student-online-fee-payment', fee._id, { orderId, amount, provider: settings.defaultProvider }).catch(() => undefined);
    const origin = String(req.headers.origin || req.headers.referer || '').replace(/\/[^/]*$/, '');
    const domain = (() => { try { return new URL(origin || 'https://www.easyschool.live').hostname; } catch { return 'www.easyschool.live'; } })();
    if (settings.defaultProvider === 'recommended_gateway') {
      if (!settings.gatewayFlow?.apiKey) return res.status(428).json({ message: 'GatewayFlow API key is not configured in school settings.' });
      return res.json({ orderId, amount, feeId: fee._id, studentId, provider: 'recommended_gateway', gatewayUrl: settings.gatewayFlow.origin, gatewayFlow: { apiKey: settings.gatewayFlow.apiKey, domain, receiverNumber: settings.gatewayFlow.receiverNumber, paymentMethods: settings.gatewayFlow.paymentMethods, callback: `${origin || 'https://www.easyschool.live'}/finance/my-fees` } });
    }
    res.json({ orderId, amount, feeId: fee._id, studentId, provider: settings.defaultProvider, gatewayUrl: settings.recommendedGatewayUrl, redirectUrl: `${settings.recommendedGatewayUrl}?orderId=${encodeURIComponent(orderId)}&amount=${encodeURIComponent(String(amount))}&purpose=student_fee&feeId=${encodeURIComponent(String(fee._id))}` });
  } catch (error: any) { res.status(500).json({ message: 'Failed to initiate online fee payment', error: error?.message || error }); }
});

export default router;
