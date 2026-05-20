import express from 'express';
import Institution from '../models/Institution';
import { authenticate } from '../middleware/auth';
import { calculatePlanDue, EASY_SCHOOL_STORAGE_MONTHLY_PRICE, SCHOOL_PLANS } from '../config/plans';
import { activateBilling } from '../services/billingService';
import { verifyGatewayPayment } from '../services/paymentGateway';

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
    paymentOrderId: input.paymentOrderId ?? current.paymentOrderId,
    paymentTime: input.paymentTime ?? current.paymentTime,
    paymentVerificationRequestId: input.paymentVerificationRequestId ?? current.paymentVerificationRequestId,
    paymentVerificationRedirectUrl: input.paymentVerificationRedirectUrl ?? current.paymentVerificationRedirectUrl,
    paymentVerificationResponse: input.paymentVerificationResponse ?? current.paymentVerificationResponse,
    receivedAt: isPaymentReceived ? input.receivedAt || current.receivedAt || new Date() : current.receivedAt,
  };
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
    paymentTrxId: payload.payment_ref || payload.transaction_id || payload.transactionId || payload.trxId || details.payment_ref || details.transaction_id || details.transactionId || details.trxId || '',
    paymentSenderNumber: payload.payer_number || payload.payerNumber || details.payer_number || details.payerNumber || '',
    paymentOrderId: payload.orderId || payload.order_id || details.orderId || details.order_id || '',
    receivedAmount: typeof (payload.amount ?? details.amount) === 'number' ? Number(payload.amount ?? details.amount) : undefined,
    paymentTime: verifiedAt ? String(verifiedAt) : undefined,
    paymentVerifiedAt: verifiedAt ? new Date(verifiedAt) : verification.verified ? new Date() : undefined,
  };
};

const normalizePaymentBody = (input: any = {}) => {
  const payload = input.popupPaymentResponse?.data || input.popupPaymentResponse || input.rawResponse?.data || input.rawResponse || input;
  const details = input.popupVerification || payload?.verification || payload?.data?.verification || {};
  const amount = Number(input.receivedAmount ?? payload?.receivedAmount ?? payload?.amount ?? payload?.paidAmount ?? details?.amount ?? 0);
  const paymentTrxId = input.paymentTrxId || input.transaction_id || input.payment_ref || payload?.transaction_id || payload?.payment_ref || payload?.transactionId || payload?.trxId || details?.transaction_id || details?.payment_ref || details?.transactionId || details?.trxId || '';
  const paymentOrderId = input.paymentOrderId || input.orderId || input.order_id || payload?.orderId || payload?.order_id || details?.orderId || details?.order_id || '';
  const paymentSenderNumber = input.paymentSenderNumber || input.payer_number || payload?.payer_number || payload?.payerNumber || payload?.senderNumber || payload?.mobileNumber || details?.payer_number || details?.payerNumber || '';
  const paymentTime = input.paymentTime || input.verifiedAt || payload?.verifiedAt || payload?.verified_at || details?.verifiedAt || details?.verified_at || payload?.payment_time || payload?.paymentTime;

  return {
    ...input,
    paymentGateway: input.paymentGateway || payload?.paymentGateway || payload?.gateway || 'popup',
    paymentOrderId,
    paymentTime,
    paymentTrxId,
    paymentSenderNumber,
    receivedAmount: amount,
    paymentVerificationResponse: input.paymentVerificationResponse || payload,
    popupPaymentStatus: input.popupPaymentStatus || payload?.status,
    popupPaymentResponse: input.popupPaymentResponse || payload,
  };
};

const isPopupVerifiedPayment = (input: any = {}, dueAmount = 0) => {
  const payload = input.popupPaymentResponse?.data || input.popupPaymentResponse || input.paymentVerificationResponse || {};
  const details = input.popupVerification || payload.verification || {};
  const status = String(input.popupPaymentStatus || payload.status || '').toLowerCase();
  const amount = Number(input.receivedAmount ?? payload.amount ?? details.amount ?? 0);
  const hasVerifiedStatus = ['verified', 'success', 'paid'].includes(status) || input.type === 'payment_status';
  const hasRequiredRefs = Boolean(input.paymentTrxId || payload.transaction_id || payload.payment_ref || details.transaction_id || details.payment_ref);
  const amountMatches = Number(dueAmount || 0) > 0 && amount === Number(dueAmount);
  return hasVerifiedStatus && hasRequiredRefs && amountMatches;
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
    const institution = (req as any).institution || await Institution.findById(req.user.institutionId).lean().maxTimeMS(3000);
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

    const normalizedBody = normalizePaymentBody(req.body);
    const billing = buildBilling(
      {
        ...normalizedBody,
        isPaymentReceived: true,
        billingStatus: 'pending',
        receivedAt: new Date(),
      },
      (institution as any).billing?.toObject?.() || (institution as any).billing || {}
    );
    billing.receivedBy = req.user._id;
    billing.billingStatus = 'pending';

    const verification = await verifyGatewayPayment({
      trxId: billing.paymentTrxId,
      amount: Number(billing.receivedAmount || billing.dueAmount || 0),
      senderNumber: billing.paymentSenderNumber,
      gateway: billing.paymentGateway,
      orderId: billing.paymentOrderId,
      paymentTime: billing.paymentTime ? String(billing.paymentTime) : undefined,
      domain: process.env.PAYMENT_GATEWAY_DOMAIN,
    });

    const popupVerified = isPopupVerifiedPayment(normalizedBody, Number(billing.dueAmount || 0));
    const finalVerification = verification.verified
      ? verification
      : popupVerified
        ? {
          ...verification,
          verified: true,
          status: 'verified',
          data: normalizedBody.popupPaymentResponse || normalizedBody.paymentVerificationResponse || normalizedBody,
          message: 'Payment verified by popup widget response.',
        }
        : verification;

    Object.assign(billing, extractVerificationMeta(finalVerification));
    if (finalVerification.verified) {
      institution.billing = activateBilling({
        ...billing,
        ...extractVerificationMeta(finalVerification),
      }, new Date()) as any;
      institution.isActive = true;
    } else {
      institution.billing = billing as any;
    }
    await institution.save();

    res.json({ institution, verification: finalVerification, message: finalVerification.verified ? 'Payment verified and school activated.' : 'Payment submitted. Admin will verify and activate the school.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save payment', error });
  }
});

export default router;
