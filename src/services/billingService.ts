import Institution from '../models/Institution';

export const nextSubscriptionEnd = (cycle: 'monthly' | 'yearly' = 'monthly', from = new Date()) => {
  const date = new Date(from);
  date.setMonth(date.getMonth() + (cycle === 'yearly' ? 12 : 1));
  return date;
};

export const currentSmsPeriod = (from = new Date()) => {
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  return { start, end };
};

export const activateBilling = (billing: any, at = new Date()) => ({
  ...billing,
  billingStatus: 'active',
  isPaymentReceived: true,
  activatedAt: billing.activatedAt || at,
  subscriptionStartedAt: at,
  subscriptionExpiresAt: nextSubscriptionEnd(billing.billingCycle || 'monthly', at),
});

export const isSubscriptionExpired = (institution: any) => {
  const billing = institution?.billing || {};
  const expiresAt = billing?.subscriptionExpiresAt || billing?.expiresAt;
  // Treat institution as expired if explicit billing status is not 'active'
  if (billing?.billingStatus && billing.billingStatus !== 'active') return true;
  if (!institution?.isActive) return false;
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
};

export const expireInstitutionIfNeeded = async (institution: any) => {
  if (!institution || !isSubscriptionExpired(institution)) return institution;
  institution.isActive = false;
  institution.billing = {
    ...(typeof institution.billing?.toObject === 'function' ? institution.billing.toObject() : institution.billing || {}),
    billingStatus: 'expired',
  };
  await institution.save();
  return institution;
};

export const canUseSms = async (institutionId: any, units = 1) => {
  const institution = await Institution.findById(institutionId).select('billing');
  if (!institution) return { allowed: false, message: 'Institution not found' };

  const billing: any = (institution as any).billing || {};
  const limit = Number(billing.monthlySmsLimit || 0);
  if (!limit) return { allowed: false, message: 'SMS limit not configured' };

  const { start, end } = currentSmsPeriod();
  const periodStart = billing.smsPeriodStart ? new Date(billing.smsPeriodStart) : null;
  const samePeriod = periodStart && periodStart.getTime() === start.getTime();
  const used = samePeriod ? Number(billing.smsUsed || 0) : 0;
  if (used + units > limit) return { allowed: false, message: 'Monthly SMS limit reached' };
  return { allowed: true, used, limit, start, end };
};

export const incrementSmsUsage = async (institutionId: any, units = 1) => {
  const usage = await canUseSms(institutionId, units);
  if (!usage.allowed) return usage;
  await Institution.findByIdAndUpdate(institutionId, {
    'billing.smsUsed': (usage.used || 0) + units,
    'billing.smsPeriodStart': usage.start,
    'billing.smsPeriodEnd': usage.end,
  });
  return usage;
};
