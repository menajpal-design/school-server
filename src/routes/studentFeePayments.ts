import express from 'express';
import { authenticate, normalizeRole } from '../middleware/auth';
import Fee from '../models/Fee';
import Payment from '../models/Payment';
import ClassFeeStructure from '../models/ClassFeeStructure';
import StudentInvoice from '../models/StudentInvoice';
import StudentFeePayment from '../models/StudentFeePayment';
import Student from '../models/Student';
import Parent from '../models/Parent';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';
import { writeAuditLog } from '../services/auditService';

const router = express.Router();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const num = (v: any) => Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0;
const invoiceNo = (studentId: any, month: number, year: number) => `INV-${year}${String(month).padStart(2, '0')}-${String(studentId).slice(-6)}-${Date.now().toString().slice(-5)}`;
const roleOf = (user: any) => normalizeRole(user?.role);

const paymentSettings = async (institutionId: any) => {
  const scoped: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config', institutionId }).lean())?.value || null);
  const global: any = scoped || await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  const cfg = global?.paymentGatewaySettings || {};
  const enabledProviders = Array.isArray(cfg.enabledProviders) ? cfg.enabledProviders : [];
  const onlineEnabled = Boolean(cfg.onlinePaymentEnabled ?? cfg.enabled ?? enabledProviders.some((p: string) => !['manual_cash', 'manual_bank'].includes(p)));
  return { onlineEnabled, defaultProvider: cfg.defaultProvider || 'recommended_gateway', enabledProviders, recommendedGatewayUrl: cfg.recommendedGatewayUrl || cfg.recommendedGateway?.endpoint || 'https://gateway-client-rho.vercel.app/' };
};
async function ensureCurrentMonthInvoiceForStudent(req: any, student: any) {
  const now = new Date(); const month = now.getMonth() + 1; const year = now.getFullYear(); const institutionId = req.user.institutionId;
  if (!student?._id || !student?.classId) return;
  const existing = await StudentInvoice.exists({ institutionId, studentId: student._id, month, year, feeType: 'monthly_tuition' }); if (existing) return;
  const structure = await ClassFeeStructure.findOne({ institutionId, feeType: 'monthly_tuition', classId: student.classId?._id || student.classId, isActive: true, $or: [{ effectiveFromYear: { $lt: year } }, { effectiveFromYear: year, effectiveFromMonth: { $lte: month } }] }).sort({ effectiveFromYear: -1, effectiveFromMonth: -1 }).lean(); if (!structure) return;
  await StudentInvoice.create({ institutionId, studentId: student._id, classId: student.classId?._id || student.classId, section: structure.section || 'All', month, year, feeType: 'monthly_tuition', invoiceNo: invoiceNo(student._id, month, year), items: [{ name: 'Monthly Tuition Fee', amount: num(structure.amount), discount: 0, lateFee: 0 }], totalAmount: num(structure.amount), paidAmount: 0, dueAmount: num(structure.amount), status: 'unpaid', dueDate: new Date(year, month - 1, Math.min(Number(structure.dueDay || 10), 28)), generatedBy: req.user._id });
}
const populatePayment = () => Payment.find().populate({ path: 'studentId', populate: { path: 'userId', select: 'name avatar email phone' } }).populate('feeId', 'type month year amount dueDate status').populate('collectedBy', 'name role');
const populateInvoicePayment = () => StudentFeePayment.find().populate({ path: 'studentId', populate: { path: 'userId', select: 'name avatar email phone' } }).populate('invoiceId', 'invoiceNo feeType month year totalAmount dueAmount status dueDate').populate('collectedBy', 'name role');
const studentFeeQuery = (student: any, institutionId: any) => ({ institutionId, $or: [{ studentId: student._id }, { studentId: { $exists: false }, classId: student.classId }, { studentId: null, classId: student.classId }] });
const normalizeInvoicePayment = (p: any) => ({ ...p, receiptNumber: p.receiptNo, paymentDate: p.paidAt || p.createdAt, feeId: p.invoiceId ? { _id: p.invoiceId._id, type: p.invoiceId.feeType || 'monthly', month: p.invoiceId.month, year: p.invoiceId.year, amount: p.invoiceId.totalAmount, dueDate: p.invoiceId.dueDate, status: p.invoiceId.status } : undefined, paymentMethod: p.paymentMethod || 'cash', notes: p.note });

router.get('/', authenticate, async (req: any, res) => {
  try {
    const settings = await paymentSettings(req.user.institutionId);
    const role = roleOf(req.user);
    const build = async (student: any) => {
      await ensureCurrentMonthInvoiceForStudent(req, student);
      const [fees, invoices, oldPayments, invoicePayments] = await Promise.all([
        Fee.find(studentFeeQuery(student, req.user.institutionId)).populate('classId', 'name grade').sort({ dueDate: -1 }).lean(),
        StudentInvoice.find({ institutionId: req.user.institutionId, studentId: student._id }).populate('classId', 'name grade').sort({ year: -1, month: -1 }).lean(),
        populatePayment().where({ studentId: student._id, institutionId: req.user.institutionId }).sort({ paymentDate: -1 }).lean(),
        populateInvoicePayment().where({ studentId: student._id, institutionId: req.user.institutionId }).sort({ paidAt: -1 }).lean(),
      ]);
      const invoiceFees = invoices.map((inv: any) => ({ _id: `invoice-${inv._id}`, invoiceId: inv._id, studentId: inv.studentId, classId: inv.classId, type: inv.feeType || 'monthly', month: inv.month, year: inv.year, amount: inv.dueAmount, originalAmount: inv.totalAmount, paidAmount: inv.paidAmount, status: inv.status === 'paid' ? 'paid' : inv.status === 'overdue' ? 'overdue' : 'pending', dueDate: inv.dueDate, invoiceNo: inv.invoiceNo, source: 'invoice' }));
      const payments = [...oldPayments, ...invoicePayments.map(normalizeInvoicePayment)].sort((a: any, b: any) => new Date(b.paymentDate || b.createdAt || 0).getTime() - new Date(a.paymentDate || a.createdAt || 0).getTime());
      return { ...student, fees: [...invoiceFees, ...fees], invoices, payments };
    };
    if (role === 'student') {
      const student: any = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).populate('userId', 'name avatar email phone').populate('classId', 'name grade').populate('sectionId', 'name').lean();
      if (!student) return res.json({ myFees: [], fees: [], invoices: [], payments: [], children: [], paymentSettings: settings });
      const row: any = await build(student);
      return res.json({ myFees: row.fees, fees: row.fees, invoices: row.invoices, payments: row.payments, children: [row], paymentSettings: settings });
    }
    if (role !== 'parent') return res.status(403).json({ message: 'Only student or parent can view own fee portal.' });
    const parent: any = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).lean();
    if (!parent) return res.json({ myFees: [], fees: [], invoices: [], payments: [], children: [], paymentSettings: settings });
    const children = (await Promise.all((parent.children || []).map(async (id: any) => { const student: any = await Student.findOne({ _id: id, institutionId: req.user.institutionId }).populate('userId', 'name avatar email phone').populate('classId', 'name grade').populate('sectionId', 'name').lean(); return student ? await build(student) : null; }))).filter(Boolean) as any[];
    res.json({ myFees: children.flatMap((c: any) => c.fees || []), fees: children.flatMap((c: any) => c.fees || []), invoices: children.flatMap((c: any) => c.invoices || []), payments: children.flatMap((c: any) => c.payments || []), children, paymentSettings: settings });
  } catch (error: any) { res.status(500).json({ message: 'Failed to load fee data', error: error?.message || error }); }
});

router.post('/pay', authenticate, async (req: any, res) => {
  try {
    const settings = await paymentSettings(req.user.institutionId);
    if (!settings.onlineEnabled) return res.status(403).json({ message: 'Online payment is not enabled for this school.' });
    const role = roleOf(req.user); const allowed: string[] = [];
    if (role === 'student') { const student: any = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).lean(); if (student) allowed.push(String(student._id)); }
    else if (role === 'parent') { const parent: any = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).lean(); (parent?.children || []).forEach((id: any) => allowed.push(String(id))); }
    let fee: any = null; let studentId = '';
    if (String(req.body.feeId || '').startsWith('invoice-') || req.body.invoiceId) { const invoiceId = String(req.body.invoiceId || req.body.feeId).replace(/^invoice-/, ''); const invoice: any = await StudentInvoice.findOne({ _id: invoiceId, institutionId: req.user.institutionId, status: { $in: ['unpaid', 'partial', 'overdue'] } }).lean(); if (!invoice) return res.status(404).json({ message: 'Due invoice not found.' }); fee = { _id: `invoice-${invoice._id}`, amount: invoice.dueAmount }; studentId = String(invoice.studentId); }
    else { fee = await Fee.findOne({ _id: req.body.feeId, institutionId: req.user.institutionId, status: { $in: ['pending', 'overdue'] } }).lean(); if (!fee) return res.status(404).json({ message: 'Due fee not found.' }); studentId = String(fee.studentId || req.body.studentId || ''); }
    if (!allowed.includes(studentId)) return res.status(403).json({ message: 'You can only pay your own or child fee.' });
    const amount = num(req.body.amount || fee.amount); if (amount <= 0 || amount > num(fee.amount)) return res.status(400).json({ message: 'Invalid payment amount.' });
    const orderId = `FEE-${Date.now()}-${String(fee._id).slice(-6)}`;
    await writeAuditLog(req, 'initiate', 'student-online-fee-payment', fee._id, { orderId, amount, provider: settings.defaultProvider }).catch(() => undefined);
    res.json({ orderId, amount, feeId: fee._id, studentId, provider: settings.defaultProvider, gatewayUrl: settings.recommendedGatewayUrl, redirectUrl: `${settings.recommendedGatewayUrl}?orderId=${encodeURIComponent(orderId)}&amount=${encodeURIComponent(String(amount))}&purpose=student_fee&feeId=${encodeURIComponent(String(fee._id))}` });
  } catch (error: any) { res.status(500).json({ message: 'Failed to initiate online fee payment', error: error?.message || error }); }
});

export default router;
