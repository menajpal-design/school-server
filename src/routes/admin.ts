import express from 'express';
import Institution from '../models/Institution';
import User from '../models/User';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import { authenticate, authorize } from '../middleware/auth';
import { calculatePlanDue, EASY_SCHOOL_STORAGE_MONTHLY_PRICE, SCHOOL_PLANS } from '../config/plans';
import { activateBilling } from '../services/billingService';
import { verifyGatewayPayment } from '../services/paymentGateway';

const router = express.Router();

router.use(authenticate);
router.use(authorize('admin', 'super_admin'));

const buildBilling = (input: any = {}, current: any = {}) => {
  const billingCycle = input.billingCycle || current.billingCycle || 'monthly';
  const useEasySchoolStorage = input.useEasySchoolStorage ?? current.useEasySchoolStorage ?? true;
  const { plan, storageAmount, total } = calculatePlanDue(input.planCode || current.planCode, billingCycle, useEasySchoolStorage);
  const receivedAmount = Number(input.receivedAmount ?? current.receivedAmount ?? 0);
  const isPaymentReceived = input.isPaymentReceived ?? current.isPaymentReceived ?? receivedAmount > 0;
  const billingStatus = input.billingStatus || (isPaymentReceived && receivedAmount >= total ? 'active' : current.billingStatus || 'pending');

  const next = {
    ...current,
    planCode: plan.code,
    planName: plan.name,
    studentLimit: plan.studentLimit,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    monthlySmsLimit: plan.monthlySmsLimit,
    yearlyDiscountPercent: plan.yearlyDiscountPercent,
    billingCycle,
    useEasySchoolStorage,
    storageMonthlyPrice: EASY_SCHOOL_STORAGE_MONTHLY_PRICE,
    storageAmount,
    dueAmount: total,
    billingStatus,
    isPaymentReceived,
    receivedAmount,
    receivedAt: isPaymentReceived ? input.receivedAt || current.receivedAt || new Date() : current.receivedAt,
    receivedBy: isPaymentReceived ? input.receivedBy || current.receivedBy : current.receivedBy,
    paymentGateway: input.paymentGateway ?? current.paymentGateway,
    paymentTrxId: input.paymentTrxId ?? current.paymentTrxId,
    paymentSenderNumber: input.paymentSenderNumber ?? current.paymentSenderNumber,
    paymentOrderId: input.paymentOrderId ?? current.paymentOrderId,
    paymentTime: input.paymentTime ?? current.paymentTime,
    paymentVerificationRequestId: input.paymentVerificationRequestId ?? current.paymentVerificationRequestId,
    paymentVerificationRedirectUrl: input.paymentVerificationRedirectUrl ?? current.paymentVerificationRedirectUrl,
    paymentVerificationResponse: input.paymentVerificationResponse ?? current.paymentVerificationResponse,
  };
  return billingStatus === 'active' ? activateBilling(next, new Date()) : next;
};

const extractVerificationMeta = (verification: any = {}) => {
  const payload = verification.data || {};
  const details = payload.verification || {};
  const verifiedAt = payload.verifiedAt || details.verifiedAt || details.verified_at;

  return {
    paymentVerifyStatus: verification.status || payload.status || (payload.success ? 'verified' : 'pending'),
    paymentVerificationRequestId: payload.requestId || payload.request_id || payload.id || details.requestId || details.request_id || details.id || '',
    paymentVerificationRedirectUrl: payload.redirectUrl || payload.redirect_url || details.redirectUrl || details.redirect_url || '',
    paymentVerificationResponse: payload,
    paymentTrxId: payload.payment_ref || payload.transaction_id || details.payment_ref || details.transaction_id || '',
    paymentSenderNumber: payload.payer_number || details.payer_number || '',
    paymentOrderId: payload.order_id || details.order_id || '',
    receivedAmount: typeof (payload.amount ?? details.amount) === 'number' ? Number(payload.amount ?? details.amount) : undefined,
    paymentTime: verifiedAt ? String(verifiedAt) : undefined,
    paymentVerifiedAt: verifiedAt ? new Date(verifiedAt) : verification.verified ? new Date() : undefined,
  };
};

const countsForInstitutions = async (institutionIds: any[]) => {
  const [students, teachers, staff, users] = await Promise.all([
    Student.aggregate([{ $match: { institutionId: { $in: institutionIds } } }, { $group: { _id: '$institutionId', count: { $sum: 1 } } }]),
    Teacher.aggregate([{ $match: { institutionId: { $in: institutionIds } } }, { $group: { _id: '$institutionId', count: { $sum: 1 } } }]),
    Staff.aggregate([{ $match: { institutionId: { $in: institutionIds } } }, { $group: { _id: '$institutionId', count: { $sum: 1 } } }]),
    User.aggregate([{ $match: { institutionId: { $in: institutionIds } } }, { $group: { _id: '$institutionId', count: { $sum: 1 } } }]),
  ]);
  const map = (items: any[]) => items.reduce((acc: any, item) => ({ ...acc, [String(item._id)]: item.count }), {});
  return { students: map(students), teachers: map(teachers), staff: map(staff), users: map(users) };
};

router.get('/schools', async (req, res) => {
  try {
    const query: any = {};
    if (req.query.status === 'active') query.isActive = true;
    if (req.query.status === 'suspended') query.isActive = false;
    if (req.query.search) {
      const pattern = new RegExp(String(req.query.search), 'i');
      query.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }, { eiin: pattern }];
    }

    const schools = await Institution.find(query).sort({ createdAt: -1 }).lean();
    const ids = schools.map((school: any) => school._id);
    const counts = await countsForInstitutions(ids);
    res.json({
      plans: SCHOOL_PLANS,
      schools: schools.map((school: any) => ({
        ...school,
        counts: {
          students: counts.students[String(school._id)] || 0,
          teachers: counts.teachers[String(school._id)] || 0,
          staff: counts.staff[String(school._id)] || 0,
          users: counts.users[String(school._id)] || 0,
        },
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load schools', error });
  }
});

router.patch('/schools/:id', async (req, res) => {
  try {
    const school = await Institution.findById(req.params.id);
    if (!school) return res.status(404).json({ message: 'School not found' });

    if (req.body.billing) {
      school.billing = buildBilling({ ...req.body.billing, receivedBy: req.user._id }, (school as any).billing?.toObject?.() || (school as any).billing || {}) as any;
    }
    if (req.body.isActive !== undefined) school.isActive = req.body.isActive === true;
    if (req.body.statusAction === 'suspend') school.isActive = false;
    if (req.body.statusAction === 'activate') school.isActive = true;
    if ((school as any).billing?.billingStatus === 'active' || req.body.statusAction === 'activate') {
      school.billing = activateBilling((school as any).billing?.toObject?.() || (school as any).billing || {}) as any;
      school.isActive = true;
    }

    await school.save();
    res.json({ school, message: 'School updated' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update school', error });
  }
});

router.post('/schools/:id/verify-payment', async (req, res) => {
  try {
    const school = await Institution.findById(req.params.id);
    if (!school) return res.status(404).json({ message: 'School not found' });
    const billing: any = (school as any).billing || {};
    const verification = await verifyGatewayPayment({
      trxId: billing.paymentTrxId,
      amount: Number(billing.receivedAmount || billing.dueAmount || 0),
      senderNumber: billing.paymentSenderNumber,
      gateway: billing.paymentGateway,
      orderId: billing.paymentOrderId,
      paymentTime: billing.paymentTime ? String(billing.paymentTime) : undefined,
      domain: process.env.PAYMENT_GATEWAY_DOMAIN,
    });

    Object.assign(billing, extractVerificationMeta(verification));
    if (verification.verified) {
      school.billing = activateBilling({
        ...billing,
        ...extractVerificationMeta(verification),
      }, new Date()) as any;
      school.isActive = true;
    } else {
      school.billing = billing;
    }
    await school.save();
    res.json({ school, verification, message: verification.message });
  } catch (error) {
    res.status(500).json({ message: 'Payment verification failed', error });
  }
});

router.get('/schools/:id/select', async (req, res) => {
  const school = await Institution.findById(req.params.id).lean();
  if (!school) return res.status(404).json({ message: 'School not found' });
  res.json({ school, selectedInstitutionId: school._id });
});

router.get('/users', async (req, res) => {
  try {
    const query: any = {};
    if (req.query.institutionId) query.institutionId = req.query.institutionId;
    if (req.query.role) query.role = req.query.role;
    if (req.query.search) {
      const pattern = new RegExp(String(req.query.search), 'i');
      query.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }, { username: pattern }];
    }
    const users = await User.find(query)
      .populate('institutionId', 'name type eiin')
      .select('name username email role phone isActive permissions institutionId createdAt lastLogin')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load users', error });
  }
});

export default router;
