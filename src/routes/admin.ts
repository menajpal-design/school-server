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
import Attendance from '../models/Attendance';
import Fee from '../models/Fee';
import Document from '../models/Document';
import IDCard from '../models/IDCard';
import Notice from '../models/Notice';
import Class from '../models/Class';
import Section from '../models/Section';
import Parent from '../models/Parent';
import Subject from '../models/Subject';
import Exam from '../models/Exam';
import Result from '../models/Result';
import ClassRoutine from '../models/ClassRoutine';
import { resolveTenantStorageContext, runWithTenantStorage } from '../config/tenantStorage';

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
  const isFree = total === 0;
  const receivedAmount = isFree ? 0 : Number(input.receivedAmount ?? current.receivedAmount ?? 0);
  const isPaymentReceived = isFree ? true : (input.isPaymentReceived ?? current.isPaymentReceived ?? receivedAmount > 0);
  const billingStatus = isFree ? 'active' : (input.billingStatus || (isPaymentReceived && receivedAmount >= total ? 'active' : current.billingStatus || 'pending'));

  const next = {
    ...current,
    planCode: plan.code,
    planName: plan.name,
    studentLimit: plan.studentLimit,
    monthlyPrice: plan.monthlyPrice,
    yearlyPrice: plan.yearlyPrice,
    monthlySmsLimit: plan.monthlySmsLimit,
    attendanceSmsMode: (plan as any).attendanceSmsMode || 'none',
    attendanceSmsMonthlyRatePerStudent: Number((plan as any).attendanceSmsMonthlyRatePerStudent || 0),
    attendanceSmsMonthlyAmount: Number((plan as any).attendanceSmsMonthlyAmount || 0),
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
      const currentBilling = (school as any).billing?.toObject?.() || (school as any).billing || {};
      // Preserve existing subscriptionExpiresAt if it is still in the future (avoid resetting a paid subscription)
      const existingExpiry = currentBilling.subscriptionExpiresAt || currentBilling.planExpiry || currentBilling.validUntil;
      const activatedBilling = activateBilling(currentBilling) as any;
      if (existingExpiry && new Date(existingExpiry) > new Date()) {
        activatedBilling.subscriptionExpiresAt = new Date(existingExpiry);
        activatedBilling.planExpiry = new Date(existingExpiry);
        activatedBilling.validUntil = new Date(existingExpiry);
        activatedBilling.billingPeriodEnd = new Date(existingExpiry);
        const msLeft = new Date(existingExpiry).getTime() - Date.now();
        activatedBilling.remainingDays = Math.max(0, Math.ceil(msLeft / 86400000));
      }
      school.billing = activatedBilling;
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
    // Admin routes: super_admin sees all, admin sees all except super_admin, others see only lower roles
    const managedRoles = getManagedRoles(req.user?.role);
    let allowedRoles: string[] = [];
    if (req.user?.role === 'super_admin') {
      allowedRoles = roleHierarchy.slice(); // all roles
    } else if (req.user?.role === 'admin') {
      allowedRoles = roleHierarchy.filter(r => r !== 'super_admin'); // admin sees all except super_admin
    } else {
      allowedRoles = managedRoles;
    }

    if (!allowedRoles.length) return res.json({ users: [] });

    const query: any = {};
    if (req.query.institutionId) query.institutionId = req.query.institutionId;
    if (req.query.role) {
      const requestedRole = String(req.query.role);
      if (!allowedRoles.includes(requestedRole)) return res.json({ users: [] });
      query.role = requestedRole;
    } else {
      query.role = { $in: allowedRoles };
    }
    if (req.query.search) {
      const pattern = new RegExp(String(req.query.search), 'i');
      query.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }, { username: pattern }];
    }

    const selectFields = 'name username email role phone isActive permissions institutionId createdAt lastLogin';
    const populateInstitution = (rows: any[]) => rows.map((row: any) => ({
      ...row,
      institutionId: row.institutionId && typeof row.institutionId === 'object'
        ? row.institutionId
        : row.institutionId,
    }));

    const fetchPrimaryUsers = async () => runWithTenantStorage(null, async () => {
      const users = await User.find(query)
        .populate('institutionId', 'name type eiin')
        .select(selectFields)
        .sort({ createdAt: -1 })
        .lean();
      return populateInstitution(users as any[]);
    });

    const fetchPrimaryInstitutions = async () => runWithTenantStorage(null, async () => Institution.find({}).select('_id settings billing').lean());

    const institutionList = await fetchPrimaryInstitutions();
    const tenantUsers = await Promise.all(institutionList.map(async (institution: any) => {
      const tenantContext = resolveTenantStorageContext(institution);
      if (!tenantContext?.mongoUri) return [];
      try {
        return await runWithTenantStorage(tenantContext, async () => {
          const users = await User.find(query)
            .populate('institutionId', 'name type eiin')
            .select(selectFields)
            .sort({ createdAt: -1 })
            .lean();
          return populateInstitution(users as any[]);
        });
      } catch {
        return [];
      }
    }));

    const merged = [...(await fetchPrimaryUsers()), ...tenantUsers.flat()];
    const deduped = Array.from(new Map(merged.map((user: any) => [String(user._id), user])).values())
      .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    res.json({ users: deduped });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load users', error });
  }
});

// Create a new admin (only super_admin can create platform admins)
router.post('/users', async (req, res) => {
  try {
    if (req.user?.role !== 'super_admin') return res.status(403).json({ message: 'Only super_admin can create platform admin users' });
    const { name, email, password, role = 'admin', institutionId } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email and password are required' });
    if (!['admin', 'super_admin'].includes(role)) return res.status(400).json({ message: 'Invalid role for platform user' });

    // ensure institutionId provided (User schema requires it)
    if (!institutionId) return res.status(400).json({ message: 'institutionId is required for new user' });

    // Check existing
    const existing = await User.findOne({ email, institutionId });
    if (existing) return res.status(400).json({ message: 'User with this email already exists' });

    const bcrypt = await import('bcryptjs');
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashed, role, institutionId });
    await user.save();
    const created = await User.findById(user._id).select('name email role phone isActive institutionId createdAt');
    res.status(201).json({ user: created });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create admin user', error });
  }
});

export default router;

// Admin-level backup/export and import (super_admin only)
router.get('/backup/export-all', async (req: any, res) => {
  try {
    if (req.user?.role !== 'super_admin') return res.status(403).json({ message: 'Forbidden' });
    const collections: any = {};
    const institutionList = await Institution.find().lean();
    collections.institutions = institutionList;
    collections.users = await User.find().lean();
    collections.students = await Student.find().lean();
    collections.teachers = await Teacher.find().lean();
    collections.staff = await Staff.find().lean();
    collections.attendance = await Attendance.find().lean();
    collections.fees = await Fee.find().lean();
    collections.documents = await Document.find().lean();
    collections.idcards = await IDCard.find().lean();
    collections.notices = await Notice.find().lean();
    collections.classes = await Class.find().lean();
    collections.sections = await Section.find().lean();
    collections.subjects = await Subject.find().lean();
    collections.exams = await Exam.find().lean();
    collections.results = await Result.find().lean();
    collections.classroutines = await ClassRoutine.find().lean();

    const payload = { exportedAt: new Date().toISOString(), collections };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="easy-school-full-backup-${Date.now()}.json"`);
    return res.send(JSON.stringify(payload, null, 2));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to export all data', error });
  }
});

router.post('/backup/import-all', async (req: any, res) => {
  try {
    if (req.user?.role !== 'super_admin') return res.status(403).json({ message: 'Forbidden' });
    const data = req.body?.collections || req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ message: 'Invalid import payload' });

    // Helper to insert ignoring _id to let Mongo generate new ids
    const insertManySafe = async (Model: any, items: any[]) => {
      if (!Array.isArray(items) || items.length === 0) return { inserted: 0 };
      const docs = items.map((it: any) => {
        const copy = { ...it };
        delete copy._id;
        return copy;
      });
      const result = await Model.insertMany(docs, { ordered: false }).catch(() => []);
      return { inserted: Array.isArray(result) ? result.length : 0 };
    };

    const results: any = {};
    if (data.institutions) results.institutions = await insertManySafe(Institution, data.institutions);
    if (data.users) results.users = await insertManySafe(User, data.users);
    if (data.students) results.students = await insertManySafe(Student, data.students);
    if (data.teachers) results.teachers = await insertManySafe(Teacher, data.teachers);
    if (data.staff) results.staff = await insertManySafe(Staff, data.staff);
    if (data.attendance) results.attendance = await insertManySafe(Attendance, data.attendance);
    if (data.fees) results.fees = await insertManySafe(Fee, data.fees);
    if (data.documents) results.documents = await insertManySafe(Document, data.documents);
    if (data.idcards) results.idcards = await insertManySafe(IDCard, data.idcards);
    if (data.notices) results.notices = await insertManySafe(Notice, data.notices);
    if (data.classes) results.classes = await insertManySafe(Class, data.classes);
    if (data.sections) results.sections = await insertManySafe(Section, data.sections);
    if (data.subjects) results.subjects = await insertManySafe(Subject, data.subjects);
    if (data.exams) results.exams = await insertManySafe(Exam, data.exams);
    if (data.results) results.results = await insertManySafe(Result, data.results);
    if (data.classroutines) results.classroutines = await insertManySafe(ClassRoutine, data.classroutines);

    return res.json({ message: 'Import completed', results });
  } catch (error) {
    return res.status(500).json({ message: 'Import failed', error });
  }
});
