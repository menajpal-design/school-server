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

const roleHierarchy = ['super_admin', 'admin', 'head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'];
const getManagedRoles = (role?: string) => {
  const index = roleHierarchy.indexOf(role || '');
  return index >= 0 ? roleHierarchy.slice(index + 1) : [];
};

const buildBilling = (input: any = {}, current: any = {}) => {
  const billingCycle = input.billingCycle || current.billingCycle || 'monthly';
  const useEasySchoolStorage = input.useEasySchoolStorage ?? current.useEasySchoolStorage ?? true;
  const smsChargeAmount = Number(input.smsChargeAmount ?? current.smsChargeAmount ?? 0);
  const { plan, baseAmount, storageAmount } = calculatePlanDue(input.planCode || current.planCode, billingCycle, useEasySchoolStorage);
  const total = baseAmount + storageAmount + smsChargeAmount;
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
    baseDueAmount: baseAmount + storageAmount,
    storageAmount,
    smsChargeAmount,
    smsChargeBreakdown: input.smsChargeBreakdown ?? current.smsChargeBreakdown ?? {},
    smsChargePeriodStart: input.smsChargePeriodStart ?? current.smsChargePeriodStart,
    smsChargePeriodEnd: input.smsChargePeriodEnd ?? current.smsChargePeriodEnd,
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

const moneyNumber = (value: any) => Number(value || 0);

router.get('/accounting', async (req, res) => {
  try {
    const query: any = {};
    if (req.query.status && req.query.status !== 'all') query['billing.billingStatus'] = req.query.status;
    if (req.query.cycle && req.query.cycle !== 'all') query['billing.billingCycle'] = req.query.cycle;
    if (req.query.search) {
      const pattern = new RegExp(String(req.query.search), 'i');
      query.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }, { eiin: pattern }];
    }

    const schools = await Institution.find(query)
      .select('name email phone eiin isActive billing createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .lean();

    const summary = schools.reduce((acc: any, school: any) => {
      const billing = school.billing || {};
      const status = billing.billingStatus || 'pending';
      const cycle = billing.billingCycle || 'monthly';
      const dueAmount = moneyNumber(billing.dueAmount);
      const receivedAmount = moneyNumber(billing.receivedAmount);
      const balance = Math.max(dueAmount - receivedAmount, 0);

      acc.totalSchools += 1;
      acc.totalDue += dueAmount;
      acc.totalReceived += receivedAmount;
      acc.totalBalance += balance;
      acc.statusCounts[status] = (acc.statusCounts[status] || 0) + 1;
      acc.cycleCounts[cycle] = (acc.cycleCounts[cycle] || 0) + 1;
      if (school.isActive) acc.activeSchools += 1;
      else acc.blockedSchools += 1;
      return acc;
    }, {
      totalSchools: 0,
      activeSchools: 0,
      blockedSchools: 0,
      totalDue: 0,
      totalReceived: 0,
      totalBalance: 0,
      statusCounts: { active: 0, pending: 0, expired: 0, cancelled: 0 },
      cycleCounts: { monthly: 0, yearly: 0 },
    });

    const rows = schools.map((school: any) => {
      const billing = school.billing || {};
      const dueAmount = moneyNumber(billing.dueAmount);
      const receivedAmount = moneyNumber(billing.receivedAmount);
      return {
        _id: school._id,
        name: school.name,
        email: school.email,
        phone: school.phone,
        eiin: school.eiin,
        isActive: school.isActive,
        planName: billing.planName || 'No plan',
        planCode: billing.planCode,
        billingCycle: billing.billingCycle || 'monthly',
        billingStatus: billing.billingStatus || 'pending',
        dueAmount,
        receivedAmount,
        balanceAmount: Math.max(dueAmount - receivedAmount, 0),
        paymentGateway: billing.paymentGateway || '',
        paymentTrxId: billing.paymentTrxId || '',
        paymentSenderNumber: billing.paymentSenderNumber || '',
        receivedAt: billing.receivedAt,
        subscriptionExpiresAt: billing.subscriptionExpiresAt,
        smsUsed: moneyNumber(billing.smsUsed),
        monthlySmsLimit: moneyNumber(billing.monthlySmsLimit),
        updatedAt: school.updatedAt,
      };
    });

    res.json({ summary, rows });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load admin accounting report', error });
  }
});

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
    const managedRoles = getManagedRoles(req.user?.role);
    if (!managedRoles.length) return res.json({ users: [] });

    const query: any = {};
    if (req.query.institutionId) query.institutionId = req.query.institutionId;
    if (req.query.role) {
      const requestedRole = String(req.query.role);
      if (!managedRoles.includes(requestedRole)) return res.json({ users: [] });
      query.role = requestedRole;
    } else {
      query.role = { $in: managedRoles };
    }
    if (req.query.search) {
      const pattern = new RegExp(String(req.query.search), 'i');
      query.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }, { username: pattern }];
    }
    const users = await User.find(query)
      .populate('institutionId', 'name type eiin')
      .select('name username email role phone isActive permissions institutionId createdAt lastLogin')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load users', error });
  }
});

export default router;