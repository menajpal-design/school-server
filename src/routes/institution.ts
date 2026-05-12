import express from 'express';
import Institution from '../models/Institution';
import { authenticate } from '../middleware/auth';
import { calculatePlanDue, EASY_SCHOOL_STORAGE_MONTHLY_PRICE, SCHOOL_PLANS } from '../config/plans';

const router = express.Router();

const buildBilling = (input: any = {}, current: any = {}) => {
  const planCode = input.planCode || current.planCode || 'students_100';
  const billingCycle = input.billingCycle || current.billingCycle || 'monthly';
  const useEasySchoolStorage = input.useEasySchoolStorage ?? current.useEasySchoolStorage ?? true;
  const { plan, storageAmount, total } = calculatePlanDue(planCode, billingCycle, useEasySchoolStorage);
  const isPaymentReceived = input.isPaymentReceived ?? current.isPaymentReceived ?? false;
  const receivedAmount = Number(input.receivedAmount ?? current.receivedAmount ?? 0);
  const billingStatus = input.billingStatus || (isPaymentReceived && receivedAmount >= total ? 'active' : 'pending');

  return {
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
    paymentGateway: input.paymentGateway ?? current.paymentGateway,
    paymentTrxId: input.paymentTrxId ?? current.paymentTrxId,
    paymentSenderNumber: input.paymentSenderNumber ?? current.paymentSenderNumber,
    receivedAt: isPaymentReceived ? input.receivedAt || current.receivedAt || new Date() : current.receivedAt,
  };
};

router.get('/plans', (req, res) => {
  res.json({
    plans: SCHOOL_PLANS,
    storage: {
      easySchoolMonthlyPrice: EASY_SCHOOL_STORAGE_MONTHLY_PRICE,
      ownMongoDbAndImgBbPrice: 0,
    },
    paymentGateway: {
      bkashNumber: process.env.PAYMENT_BKASH_NUMBER || '0179007328',
      apiConfigured: Boolean(process.env.PAYMENT_GATEWAY_API_KEY),
    },
  });
});

router.get('/profile', authenticate, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });
    res.json({ institution });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load institution profile', error });
  }
});

router.put('/profile', authenticate, async (req, res) => {
  try {
    const allowed = ['name', 'eiin', 'type', 'address', 'phone', 'email', 'website', 'domains', 'logo', 'seal', 'headSignature'];
    const update = allowed.reduce((acc: any, key) => {
      if (req.body[key] !== undefined) acc[key] = req.body[key];
      return acc;
    }, {});
    if (Array.isArray(update.domains)) {
      update.domains = update.domains.map((domain: string) => String(domain).trim().toLowerCase()).filter(Boolean);
    }
    if (req.body.settings) {
      const current = await Institution.findById(req.user.institutionId).select('settings');
      const currentSettings = (current as any)?.settings;
      update.settings = {
        ...(typeof currentSettings?.toObject === 'function' ? currentSettings.toObject() : currentSettings || {}),
        ...req.body.settings,
      };
      if (Array.isArray(req.body.settings.academicYears)) {
        update.settings.academicYears = req.body.settings.academicYears
          .map((item: any) => ({
            year: String(item.year || '').trim(),
            mongodbUri: item.mongodbUri,
            imgbbApiKey: item.imgbbApiKey,
            isActive: item.isActive === true,
          }))
          .filter((item: any) => item.year);
      }
    }
    if (req.body.billing) {
      const current = await Institution.findById(req.user.institutionId).select('billing');
      const currentBilling = (current as any)?.billing;
      update.billing = buildBilling(req.body.billing, typeof currentBilling?.toObject === 'function' ? currentBilling.toObject() : currentBilling || {});
      update.billing.billingStatus = (currentBilling as any)?.billingStatus || 'pending';
    }

    const institution = await Institution.findOneAndUpdate(
      { _id: req.user.institutionId },
      update,
      { new: true, runValidators: true }
    );

    if (!institution) return res.status(404).json({ message: 'Institution not found' });
    res.json({ institution, message: 'Institution profile updated' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update institution profile', error });
  }
});

router.post('/billing/payment', authenticate, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });

    const billing = buildBilling(
      {
        ...req.body,
        isPaymentReceived: true,
        billingStatus: 'pending',
        receivedAt: new Date(),
      },
      (institution as any).billing?.toObject?.() || (institution as any).billing || {}
    );
    billing.receivedBy = req.user._id;
    billing.billingStatus = 'pending';

    institution.billing = billing as any;
    await institution.save();

    res.json({ institution, message: 'Payment submitted. Admin will verify and activate the school.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save payment', error });
  }
});

export default router;
