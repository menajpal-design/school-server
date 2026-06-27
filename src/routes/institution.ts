import express from 'express';
import multer from 'multer';
import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import Institution from '../models/Institution';
import { authenticate, authorize } from '../middleware/auth';
import { calculatePlanDue, EASY_SCHOOL_STORAGE_MONTHLY_PRICE, SCHOOL_PLANS, SMS_PACKAGES, getSmsPackageByCode } from '../config/plans';
import { activateBilling, getCurrentSmsBillingSummary } from '../services/billingService';
import SmsTopup from '../models/SmsTopup';
import { verifyGatewayPayment, isPaymentConfirmed } from '../services/paymentGateway';
import { writeAuditLog } from '../services/auditService';
import { deleteImageById, extractImageId, storeImage } from '../services/gridFsImageService';

const router = express.Router();
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripeCurrency = process.env.STRIPE_CURRENCY || 'usd';
const getFrontendBaseUrl = () => String(process.env.FRONTEND_URL || process.env.MOBILE_URL || 'http://localhost:3000').replace(/\/$/, '');
const getStripeClient = () => {
  if (!stripeSecretKey) return null;
  return new Stripe(stripeSecretKey, { apiVersion: '2026-04-22.dahlia' });
};

type StripeCheckoutSession = any;

const buildBilling = (input: any = {}, current: any = {}) => {
  const planCode = input.planCode || current.planCode || 'students_100';
  const billingCycle = input.billingCycle || current.billingCycle || 'monthly';
  const useEasySchoolStorage = input.useEasySchoolStorage ?? current.useEasySchoolStorage ?? true;
  const smsChargeAmount = Number(input.smsChargeAmount ?? current.smsChargeAmount ?? 0);
  const { plan, baseAmount, storageAmount, total } = calculatePlanDue(planCode, billingCycle, useEasySchoolStorage, smsChargeAmount);
  const isFree = total === 0;
  const isPaymentReceived = isFree ? true : (input.isPaymentReceived ?? current.isPaymentReceived ?? false);
  const receivedAmount = isFree ? 0 : Number(input.receivedAmount ?? current.receivedAmount ?? 0);
  const billingStatus = isFree ? 'active' : (input.billingStatus || (isPaymentReceived && receivedAmount >= total ? 'active' : 'pending'));

  return {
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
  const hasVerifiedStatus = ['verified', 'success', 'paid', 'already_verified', 'manual_accepted'].includes(status) || input.type === 'payment_status';
  const hasRequiredRefs = Boolean(input.paymentTrxId || payload.transaction_id || payload.payment_ref || details.transaction_id || details.payment_ref);
  const amountMatches = Number(dueAmount || 0) > 0 && amount === Number(dueAmount);
  return hasVerifiedStatus && hasRequiredRefs && amountMatches;
};

const buildStripeCheckoutBilling = (institution: any, session: StripeCheckoutSession, metadata: Record<string, any> = {}) => {
  const planCode = metadata.planCode || institution?.billing?.planCode || 'students_100';
  const billingCycle = metadata.billingCycle || institution?.billing?.billingCycle || 'monthly';
  const useEasySchoolStorage = metadata.useEasySchoolStorage === undefined
    ? institution?.billing?.useEasySchoolStorage !== false
    : metadata.useEasySchoolStorage === true || metadata.useEasySchoolStorage === 'true';
  const currentBilling = (institution?.billing?.toObject?.() || institution?.billing || {});
  const smsChargeAmount = Number(metadata.smsChargeAmount ?? currentBilling.smsChargeAmount ?? 0);
  const { total } = calculatePlanDue(planCode, billingCycle, useEasySchoolStorage, smsChargeAmount);
  return buildBilling({
    planCode,
    billingCycle,
    useEasySchoolStorage,
    smsChargeAmount,
    smsChargeBreakdown: currentBilling.smsChargeBreakdown || {},
    paymentGateway: 'stripe',
    paymentOrderId: session.id,
    paymentTime: new Date().toISOString(),
    paymentTrxId: typeof session.payment_intent === 'string' ? session.payment_intent : '',
    paymentVerificationResponse: session,
    receivedAmount: total,
    isPaymentReceived: true,
    billingStatus: 'pending',
  }, currentBilling);
};

router.post('/billing/stripe/checkout', authenticate, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(503).json({ message: 'Stripe is not configured. Add STRIPE_SECRET_KEY to enable Stripe checkout.' });
    }

    const planCode = String(req.body?.planCode || institution.billing?.planCode || 'students_100');
    const billingCycle = req.body?.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const useEasySchoolStorage = req.body?.useEasySchoolStorage !== undefined
      ? Boolean(req.body.useEasySchoolStorage)
      : institution.billing?.useEasySchoolStorage !== false;
    const smsChargeAmount = Number(institution.billing?.smsChargeAmount || 0);
    const { plan, total } = calculatePlanDue(planCode, billingCycle, useEasySchoolStorage, smsChargeAmount);
    const frontendUrl = getFrontendBaseUrl();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: institution.email,
      line_items: [{
        price_data: {
          currency: stripeCurrency,
          product_data: {
            name: `${plan.name} subscription`,
          },
          unit_amount: Math.round(total * 100),
        },
        quantity: 1,
      }],
      success_url: `${frontendUrl}/billing?payment=stripe&status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/billing?payment=stripe&status=cancelled`,
      client_reference_id: String(institution._id),
      metadata: {
        institutionId: String(institution._id),
        planCode,
        billingCycle,
        useEasySchoolStorage: String(useEasySchoolStorage),
          smsChargeAmount: String(smsChargeAmount),
        amount: String(total),
      },
    });

    res.json({
      sessionId: session.id,
      url: session.url,
      paymentGateway: 'stripe',
      paymentOrderId: session.id,
      amount: total,
      planCode,
      billingCycle,
      useEasySchoolStorage,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create Stripe checkout session', error });
  }
});

router.post('/billing/stripe/webhook', async (req, res) => {
  try {
    const stripe = getStripeClient();
    const signature = req.header('stripe-signature');
    if (!stripe || !signature || !stripeWebhookSecret) {
      return res.status(400).json({ message: 'Stripe webhook is not configured.' });
    }

    const event = stripe.webhooks.constructEvent(req.body, signature, stripeWebhookSecret);
    if (event.type !== 'checkout.session.completed') {
      return res.json({ received: true, type: event.type });
    }

    const session = event.data.object as StripeCheckoutSession;
    if (session.payment_status !== 'paid') {
      return res.json({ received: true, type: event.type, status: session.payment_status });
    }

    const institutionId = String(session.client_reference_id || session.metadata?.institutionId || '');
    if (!institutionId) {
      return res.status(400).json({ message: 'Stripe session is missing institution metadata.' });
    }

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      return res.status(404).json({ message: 'Institution not found' });
    }

    const metadata = typeof session.metadata === 'object' && session.metadata ? session.metadata : {};
    const currentBilling = (institution as any).billing?.toObject?.() || (institution as any).billing || {};
    const billing = buildStripeCheckoutBilling(institution, session, metadata);
    billing.paymentVerifyStatus = 'verified';
    billing.paymentVerifiedAt = new Date();
    (institution as any).billing = activateBilling(billing, new Date()) as any;
    institution.isActive = true;
    await institution.save();

    res.json({
      received: true,
      institutionId,
      sessionId: session.id,
      paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
    });
  } catch (error) {
    res.status(400).json({ message: 'Stripe webhook verification failed', error });
  }
});

router.get('/plans', (req, res) => {
  res.json({
    plans: SCHOOL_PLANS,
    storage: {
      easySchoolMonthlyPrice: EASY_SCHOOL_STORAGE_MONTHLY_PRICE,
      ownMongoDbAndLocalStoragePrice: 0,
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
    const smsBilling = await getCurrentSmsBillingSummary(req.user.institutionId).catch(() => null);
    const currentBilling = (institution as any).billing || {};
    const smsChargeAmount = Number(smsBilling?.smsChargeAmount ?? currentBilling.smsChargeAmount ?? 0);
    const baseDueAmount = Number(currentBilling.baseDueAmount ?? Math.max(Number(currentBilling.dueAmount || 0) - Number(currentBilling.smsChargeAmount || 0), 0));
    const billing = {
      ...currentBilling,
      baseDueAmount,
      smsChargeAmount,
      smsChargeBreakdown: smsBilling?.smsChargeBreakdown || currentBilling.smsChargeBreakdown || {},
      smsChargePeriodStart: smsBilling?.periodStart || currentBilling.smsChargePeriodStart,
      smsChargePeriodEnd: smsBilling?.periodEnd || currentBilling.smsChargePeriodEnd,
      dueAmount: Number(baseDueAmount + smsChargeAmount),
      monthlyBillAmount: Number(baseDueAmount + smsChargeAmount),
      smsMonthlySummary: smsBilling ? {
        totalCount: smsBilling.smsUsed,
        totalAmount: smsBilling.smsChargeAmount,
        breakdown: smsBilling.smsChargeBreakdown,
      } : currentBilling.smsMonthlySummary,
    };
    res.json({ institution: { ...institution, billing } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load institution profile', error });
  }
});

router.put('/profile', authenticate, async (req, res) => {
  try {
    const allowed = ['name', 'eiin', 'type', 'address', 'phone', 'email', 'website', 'domains', 'logo', 'seal', 'headSignature', 'subdomain'];
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

    let institution: any = null;
    try {
      const updatePayload: any = { ...update };
      const updateQuery: any = {};
      if (updatePayload.subdomain !== undefined) {
        const normalizedSubdomain = String(updatePayload.subdomain).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
        if (normalizedSubdomain) {
          updatePayload.subdomain = normalizedSubdomain;
          updateQuery.$set = updatePayload;
        } else {
          delete updatePayload.subdomain;
          updateQuery.$set = updatePayload;
          updateQuery.$unset = { subdomain: 1 };
        }
      } else {
        updateQuery.$set = updatePayload;
      }

      institution = await Institution.findOneAndUpdate(
        { _id: req.user.institutionId },
        updateQuery,
        { new: true, runValidators: true }
      );
    } catch (err: any) {
      // handle duplicate key (unique subdomain) gracefully
      if (err && (err.code === 11000 || (err?.message || '').toLowerCase().includes('duplicate'))) {
        return res.status(409).json({ message: 'Subdomain already in use. Please choose a different subdomain.' });
      }
      throw err;
    }

    if (!institution) return res.status(404).json({ message: 'Institution not found' });
    res.json({ institution, message: 'Institution profile updated' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update institution profile', error });
  }
});

router.post('/upload-image', authenticate, imageUpload.single('image'), async (req: any, res) => {
  try {
    const imageType = String(req.body?.imageType || '').trim();
    const allowedTypes = new Set(['logo', 'seal', 'headSignature']);
    if (!allowedTypes.has(imageType)) {
      return res.status(400).json({ message: 'Invalid imageType. Use logo, seal or headSignature.' });
    }

    const image = await storeImage(req.file, {
      category: 'institution',
      imageType,
      institutionId: String(req.user?.institutionId || ''),
      uploadedBy: String(req.user?._id || req.user?.id || ''),
    });

    const institution = await Institution.findByIdAndUpdate(
      req.user.institutionId,
      { $set: { [imageType]: image.url } },
      { new: true }
    );
    if (!institution) return res.status(404).json({ message: 'Institution not found' });

    return res.status(201).json({ ...image, institution, imageType });
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to upload institution image', error });
  }
});

router.delete('/delete-image', authenticate, async (req: any, res) => {
  try {
    const imageType = String(req.query?.imageType || '').trim();
    const allowedTypes = new Set(['logo', 'seal', 'headSignature']);
    if (!allowedTypes.has(imageType)) {
      return res.status(400).json({ message: 'Invalid imageType. Use logo, seal or headSignature.' });
    }

    const institution: any = await Institution.findById(req.user.institutionId);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });
    const previousId = extractImageId(institution[imageType]);
    institution[imageType] = undefined;
    await institution.save();
    if (previousId) await deleteImageById(previousId).catch(() => false);

    return res.json({ deleted: Boolean(previousId), institution, imageType });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete institution image', error });
  }
});

// Check subdomain availability
// Public endpoint: check subdomain availability without authentication
router.get('/subdomain/check', async (req, res) => {
  try {
    const subdomain = String(req.query.subdomain || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
    if (!subdomain) return res.status(400).json({ available: false, message: 'subdomain is required' });
    const existing = await Institution.findOne({ subdomain });
    if (!existing) return res.json({ available: true });

    // Optional auth extraction to check if user owns this subdomain
    let userInstitutionId: string | null = null;
    try {
      let token = req.header('Authorization')?.replace('Bearer ', '');
      if (!token) {
        const authCookieName = process.env.AUTH_COOKIE_NAME || 'es_token';
        const cookieHeader = req.headers.cookie || '';
        const match = cookieHeader.split(';').map(s => s.trim()).find((c) => c.startsWith(`${authCookieName}=`));
        if (match) token = decodeURIComponent(match.split('=')[1] || '');
      }
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
        if (decoded && decoded.institutionId) {
          userInstitutionId = String(decoded.institutionId);
        }
      }
    } catch (e) {
      // Ignore verification errors for optional auth
    }

    if (userInstitutionId && String(existing._id) === userInstitutionId) {
      return res.json({ available: true });
    }
    return res.json({ available: false });
  } catch (err) {
    return res.status(500).json({ available: false, message: 'Failed to check subdomain' });
  }
});

// Validate subdomain (check if registered)
// Public endpoint used by frontend middleware to check if subdomain should load or redirect
// Note: we only check that the subdomain exists — active status is managed inside the app
router.get('/subdomain/validate', async (req, res) => {
  try {
    const subdomain = String(req.query.subdomain || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
    if (!subdomain) return res.status(400).json({ valid: false, message: 'subdomain is required' });
    const inst = await Institution.findOne({ subdomain }).select('_id subdomain').lean().maxTimeMS(3000);
    return res.json({ valid: Boolean(inst) });
  } catch (err) {
    return res.status(500).json({ valid: false, message: 'Failed to validate subdomain' });
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

    // The school may ONLY be activated when the payment gateway itself confirms the payment.
    // The popup widget's onComplete fires on cancel too, so client status can never activate
    // the subscription on its own — it is recorded for audit only.
    const finalVerification = verification;

    Object.assign(billing, extractVerificationMeta(finalVerification));
    if (isPaymentConfirmed(finalVerification)) {
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

// Return current subscription/billing info
router.get('/billing/subscription', authenticate, async (req, res) => {
  try {
    const institution = (req as any).institution || await Institution.findById(req.user.institutionId).lean().maxTimeMS(3000);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });
    res.json({ billing: institution.billing });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load subscription', error });
  }
});

// Change plan (updates billing to new plan and marks pending or activates free plan immediately)
router.post('/billing/change-plan', authenticate, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });
    const currentBilling = (institution as any).billing?.toObject?.() || (institution as any).billing || {};
    const newBilling = buildBilling({ planCode: req.body.planCode, billingCycle: req.body.billingCycle, useEasySchoolStorage: req.body.useEasySchoolStorage }, currentBilling);
    
    if (newBilling.dueAmount === 0) {
      newBilling.billingStatus = 'active';
      institution.billing = activateBilling(newBilling, new Date()) as any;
      institution.isActive = true;
    } else {
      newBilling.billingStatus = 'pending';
      institution.billing = newBilling as any;
    }
    
    await institution.save();
    await writeAuditLog(req, 'update', 'billing', institution._id, newBilling, currentBilling).catch(() => undefined);
    res.json({ message: 'Plan change requested', billing: institution.billing });
  } catch (error) {
    res.status(500).json({ message: 'Failed to change plan', error });
  }
});

// Cancel subscription immediately (sets status cancelled and expires now)
router.post('/billing/cancel', authenticate, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });
    const currentBilling = (institution as any).billing?.toObject?.() || (institution as any).billing || {};
    const updated = {
      ...currentBilling,
      billingStatus: 'cancelled',
      subscriptionExpiresAt: new Date(),
    };
    institution.billing = updated as any;
    institution.isActive = false;
    await institution.save();
    await writeAuditLog(req, 'update', 'billing', institution._id, updated, currentBilling).catch(() => undefined);
    res.json({ message: 'Subscription cancelled', billing: institution.billing });
  } catch (error) {
    res.status(500).json({ message: 'Failed to cancel subscription', error });
  }
});

// Request unsubscribe (creates an audit request for platform admins)
router.post('/billing/request-unsubscribe', authenticate, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });
    const note = String(req.body.note || 'Unsubscribe requested by head');
    await writeAuditLog(req, 'request', 'unsubscribe', institution._id, { requestedBy: req.user._id, note });
    res.json({ message: 'Unsubscribe request submitted. Platform admin will process it.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to request unsubscribe', error });
  }
});

// Manual SMS credit adjustment (platform admin override only — NO payment verification).
// Regular school users MUST use /sms/topup/payment or /sms/package/purchase which verify payment.
router.post('/sms/topup', authenticate, authorize('admin', 'super_admin'), async (req, res) => {
  try {
    const amount = Math.floor(Number(req.body?.amount || 0));
    const method = String(req.body?.method || 'manual');
    const meta = req.body?.meta || {};
    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid top-up amount' });
    if (amount > 100000) return res.status(400).json({ message: 'Top-up amount too large' });

    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });

    // Record the top-up transaction (clearly flagged as a manual admin override)
    const topup = await SmsTopup.create({ institutionId: institution._id, amount: Number(amount), method: `manual:${method}`, meta: { ...meta, manualAdminOverride: true, grantedBy: req.user._id }, createdBy: req.user._id });

    // Atomically increment smsBalance AND extraSmsCredits so it survives subscription renewal
    const updated = await Institution.findByIdAndUpdate(institution._id, { $inc: { 'billing.smsBalance': Number(amount), 'billing.extraSmsCredits': Number(amount) } }, { new: true });

    res.json({ message: 'SMS balance topped up (manual admin override)', topup, billing: (updated as any).billing });
  } catch (error) {
    res.status(500).json({ message: 'Failed to top-up SMS balance', error });
  }
});

router.get('/sms/topup/history', authenticate, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'super_admin', 'finance_officer', 'head'];
    if (!allowedRoles.includes((req.user as any).role)) return res.status(403).json({ message: 'Permission denied' });

    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const history = await SmsTopup.find({ institutionId: req.user.institutionId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('createdBy', 'name username role')
      .lean();

    res.json({ history });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load SMS top-up history', error });
  }
});

router.post('/sms/topup/payment', authenticate, async (req, res) => {
  try {
    const amount = Number(req.body?.amount || 0);
    const paymentGateway = String(req.body?.paymentGateway || 'popup');
    const paymentOrderId = String(req.body?.paymentOrderId || '');
    const paymentTrxId = String(req.body?.paymentTrxId || '');
    const paymentSenderNumber = String(req.body?.paymentSenderNumber || '');
    const paymentTime = req.body?.paymentTime ? String(req.body.paymentTime) : new Date().toISOString();
    const popupPaymentResponse = req.body?.popupPaymentResponse || {};
    const popupVerification = req.body?.popupVerification || {};

    if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid top-up amount' });

    const allowedRoles = ['admin', 'super_admin', 'finance_officer', 'head'];
    if (!allowedRoles.includes((req.user as any).role)) return res.status(403).json({ message: 'Permission denied' });

    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });

    const verification = await verifyGatewayPayment({
      trxId: paymentTrxId,
      amount,
      senderNumber: paymentSenderNumber,
      gateway: paymentGateway,
      orderId: paymentOrderId,
      paymentTime,
      domain: process.env.PAYMENT_GATEWAY_DOMAIN,
    });

    // SMS credits may ONLY be granted when the payment gateway itself confirms the payment.
    // Client-supplied popup data is untrusted (the widget callback also fires on cancel), so it
    // is recorded for audit only — it can never credit the balance on its own.
    if (!isPaymentConfirmed(verification)) {
      return res.status(400).json({ message: verification.message || 'SMS top-up payment verification failed', verification });
    }

    const topup = await SmsTopup.create({
      institutionId: institution._id,
      amount,
      method: paymentGateway,
      meta: {
        verification: verification.data || {},
        popupPaymentResponse,
        popupVerification,
      },
      createdBy: req.user._id,
    });

    const updated = await Institution.findByIdAndUpdate(
      institution._id,
      { $inc: { 'billing.smsBalance': amount, 'billing.extraSmsCredits': amount } },
      { new: true }
    );

    res.json({ message: 'SMS balance topped up successfully', topup, billing: (updated as any)?.billing, verification });
  } catch (error) {
    res.status(500).json({ message: 'Failed to process SMS top-up payment', error });
  }
});

// Get all available SMS packages
router.get('/sms/packages', (req, res) => {
  res.json({ packages: SMS_PACKAGES });
});

// Purchase an SMS package — adds SMS credits to smsBalance
router.post('/sms/package/purchase', authenticate, async (req, res) => {
  try {
    const allowedRoles = ['admin', 'super_admin', 'finance_officer', 'head'];
    if (!allowedRoles.includes((req.user as any).role)) return res.status(403).json({ message: 'Permission denied' });

    const packageCode = String(req.body?.packageCode || '');
    const smsPackage = getSmsPackageByCode(packageCode);
    if (!smsPackage) return res.status(400).json({ message: 'Invalid SMS package code', availablePackages: SMS_PACKAGES.map((p) => p.code) });

    const paymentGateway = String(req.body?.paymentGateway || 'popup');
    const paymentOrderId = String(req.body?.paymentOrderId || '');
    const paymentTrxId = String(req.body?.paymentTrxId || '');
    const paymentSenderNumber = String(req.body?.paymentSenderNumber || '');
    const paymentTime = req.body?.paymentTime ? String(req.body.paymentTime) : new Date().toISOString();
    const popupPaymentResponse = req.body?.popupPaymentResponse || {};
    const popupVerification = req.body?.popupVerification || {};
    const receivedAmount = Number(req.body?.receivedAmount || req.body?.amount || 0);

    if (!receivedAmount || receivedAmount <= 0) return res.status(400).json({ message: 'Invalid payment amount' });
    if (receivedAmount < smsPackage.price) {
      return res.status(400).json({ message: `Payment amount ${receivedAmount} is less than package price ${smsPackage.price}` });
    }

    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });

    // Verify payment
    const verification = await verifyGatewayPayment({
      trxId: paymentTrxId,
      amount: smsPackage.price,
      senderNumber: paymentSenderNumber,
      gateway: paymentGateway,
      orderId: paymentOrderId,
      paymentTime,
      domain: process.env.PAYMENT_GATEWAY_DOMAIN,
    });

    // SMS package credits may ONLY be granted when the payment gateway confirms the payment.
    // The popup widget's onComplete also fires on cancel, so client status can never credit SMS.
    if (!isPaymentConfirmed(verification)) {
      return res.status(400).json({ message: verification.message || 'SMS package payment verification failed', verification });
    }

    // Record topup transaction
    await SmsTopup.create({
      institutionId: institution._id,
      amount: smsPackage.price,
      method: paymentGateway,
      meta: {
        packageCode: smsPackage.code,
        packageLabel: smsPackage.label,
        smsCount: smsPackage.smsCount,
        pricePerSms: smsPackage.pricePerSms,
        verification: verification.data || {},
        popupPaymentResponse,
        popupVerification,
        paymentTrxId,
        paymentOrderId,
        paymentSenderNumber,
      },
      createdBy: req.user._id,
    });

    // Credit SMS balance: add smsCount to smsBalance AND extraSmsCredits (tracks paid packages separately from free plan credits)
    const updated = await Institution.findByIdAndUpdate(
      institution._id,
      {
        $inc: {
          'billing.smsBalance': smsPackage.smsCount,
          'billing.extraSmsCredits': smsPackage.smsCount,
        },
        $set: {
          'billing.lastSmsPackageCode': smsPackage.code,
          'billing.lastSmsPackagePurchasedAt': new Date(),
        },
      },
      { new: true }
    );

    res.json({
      message: `SMS package purchased: ${smsPackage.label}. ${smsPackage.smsCount} SMS credits added.`,
      package: smsPackage,
      billing: (updated as any)?.billing,
      verification,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to purchase SMS package', error });
  }
});

export default router;
