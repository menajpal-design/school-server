import express from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth';
import Fee from '../models/Fee';
import Payment from '../models/Payment';
import Student from '../models/Student';
import Parent from '../models/Parent';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';
import { writeAuditLog } from '../services/auditService';

const router = express.Router();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const num = (v: any) => Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0;

const paymentSettings = async (institutionId: any) => {
  const scoped: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config', institutionId }).lean())?.value || null);
  const global: any = scoped || await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  const cfg = global?.paymentGatewaySettings || {};
  const enabledProviders = Array.isArray(cfg.enabledProviders) ? cfg.enabledProviders : [];
  const onlineEnabled = Boolean(cfg.onlinePaymentEnabled ?? cfg.enabled ?? enabledProviders.some((p: string) => !['manual_cash', 'manual_bank'].includes(p)));
  return { onlineEnabled, defaultProvider: cfg.defaultProvider || 'recommended_gateway', enabledProviders, recommendedGatewayUrl: cfg.recommendedGatewayUrl || cfg.recommendedGateway?.endpoint || 'https://gateway-client-rho.vercel.app/' };
};

const populatePayment = () => Payment.find().populate({ path: 'studentId', populate: { path: 'userId', select: 'name avatar email phone' } }).populate('feeId', 'type month year amount dueDate status').populate('collectedBy', 'name role');
const studentFeeQuery = (student: any, institutionId: any) => ({ institutionId, $or: [{ studentId: student._id }, { studentId: { $exists: false }, classId: student.classId }, { studentId: null, classId: student.classId }] });

router.get('/my-fees', authenticate, async (req: any, res) => {
  try {
    const settings = await paymentSettings(req.user.institutionId);
    const build = async (student: any) => {
      const fees = await Fee.find(studentFeeQuery(student, req.user.institutionId)).populate('classId', 'name grade').sort({ dueDate: -1 }).lean();
      const payments = await populatePayment().where({ studentId: student._id, institutionId: req.user.institutionId }).sort({ paymentDate: -1 }).lean();
      return { ...student, fees, payments };
    };
    if (req.user.role === 'student') {
      const student: any = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).populate('userId', 'name avatar email phone').populate('classId', 'name grade').populate('sectionId', 'name').lean();
      if (!student) return res.json({ myFees: [], fees: [], payments: [], children: [], paymentSettings: settings });
      const row: any = await build(student);
      return res.json({ myFees: row.fees, fees: row.fees, payments: row.payments, children: [row], paymentSettings: settings });
    }
    if (req.user.role !== 'parent') return res.status(403).json({ message: 'Only student or parent can view own fee portal.' });
    const parent: any = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).lean();
    if (!parent) return res.json({ myFees: [], fees: [], payments: [], children: [], paymentSettings: settings });
    const children = (await Promise.all((parent.children || []).map(async (id: any) => {
      const student: any = await Student.findOne({ _id: id, institutionId: req.user.institutionId }).populate('userId', 'name avatar email phone').populate('classId', 'name grade').populate('sectionId', 'name').lean();
      return student ? await build(student) : null;
    }))).filter(Boolean) as any[];
    res.json({ myFees: children.flatMap((c: any) => c.fees || []), fees: children.flatMap((c: any) => c.fees || []), payments: children.flatMap((c: any) => c.payments || []), children, paymentSettings: settings });
  } catch (error) { res.status(500).json({ message: 'Failed to load fee data', error }); }
});

router.post('/my-fees/pay', authenticate, async (req: any, res) => {
  try {
    const settings = await paymentSettings(req.user.institutionId);
    if (!settings.onlineEnabled) return res.status(403).json({ message: 'Online payment is not enabled for this school.' });
    const allowed: string[] = [];
    if (req.user.role === 'student') {
      const student: any = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).lean();
      if (student) allowed.push(String(student._id));
    } else if (req.user.role === 'parent') {
      const parent: any = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).lean();
      (parent?.children || []).forEach((id: any) => allowed.push(String(id)));
    }
    const fee: any = await Fee.findOne({ _id: req.body.feeId, institutionId: req.user.institutionId, status: { $in: ['pending', 'overdue'] } }).lean();
    if (!fee) return res.status(404).json({ message: 'Due fee not found.' });
    const studentId = String(fee.studentId || req.body.studentId || '');
    if (!allowed.includes(studentId)) return res.status(403).json({ message: 'You can only pay your own or child fee.' });
    const amount = num(req.body.amount || fee.amount);
    if (amount <= 0 || amount > num(fee.amount)) return res.status(400).json({ message: 'Invalid payment amount.' });
    const orderId = `FEE-${Date.now()}-${String(fee._id).slice(-6)}`;
    await writeAuditLog(req, 'initiate', 'student-online-fee-payment', fee._id, { orderId, amount, provider: settings.defaultProvider }).catch(() => undefined);
    res.json({ orderId, amount, feeId: fee._id, studentId, provider: settings.defaultProvider, gatewayUrl: settings.recommendedGatewayUrl, redirectUrl: `${settings.recommendedGatewayUrl}?orderId=${encodeURIComponent(orderId)}&amount=${encodeURIComponent(String(amount))}&purpose=student_fee&feeId=${encodeURIComponent(String(fee._id))}` });
  } catch (error) { res.status(500).json({ message: 'Failed to initiate online fee payment', error }); }
});

export default router;
