import Institution from '../models/Institution';
import SmsLog from '../models/SmsLog';

export const SMS_CHARGE_RATES = {
  attendance_absent: 0.6,
  attendance_daily: 0.45,
  result: 0.45,
  monthly_parent: 0.45,
  credentials: 0.45,
  notification: 0.45,
  admission: 0.45,
  fee: 0.45,
  notice: 0.45,
  other: 0.45,
} as const;

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

export const getSmsChargeCategory = (type?: string, purpose?: string) => {
  const normalizedType = String(type || '').toLowerCase();
  const normalizedPurpose = String(purpose || '').toLowerCase();

  if (normalizedPurpose.includes('attendance_absent') || normalizedPurpose.includes('absent')) return 'attendance_absent';
  if (normalizedPurpose.includes('attendance_daily') || normalizedPurpose.includes('daily_attendance') || normalizedPurpose.includes('attendance_present') || normalizedPurpose.includes('present')) return 'attendance_daily';
  if (normalizedPurpose.includes('result')) return 'result';
  if (normalizedPurpose.includes('monthly_parent') || normalizedPurpose.includes('monthly') || normalizedPurpose.includes('summary')) return 'monthly_parent';
  if (normalizedPurpose.includes('credential') || normalizedPurpose.includes('login') || normalizedPurpose.includes('account')) return 'credentials';
  if (normalizedPurpose.includes('admission')) return 'admission';
  if (normalizedPurpose.includes('fee')) return 'fee';
  if (normalizedPurpose.includes('notice') || normalizedPurpose.includes('notification')) return 'notice';
  if (normalizedType === 'attendance') return 'attendance_daily';
  if (normalizedType === 'credentials') return 'credentials';
  if (normalizedType === 'monthly_parent') return 'monthly_parent';
  if (normalizedType === 'admission') return 'admission';
  if (normalizedType === 'fee') return 'fee';
  if (normalizedType === 'notice' || normalizedType === 'notification') return 'notice';
  return 'other';
};

export const getSmsChargeRate = (type?: string, purpose?: string) => SMS_CHARGE_RATES[getSmsChargeCategory(type, purpose) as keyof typeof SMS_CHARGE_RATES] || SMS_CHARGE_RATES.other;

export const getSmsChargeAmount = (count = 1, type?: string, purpose?: string) => {
  const amount = Number((getSmsChargeRate(type, purpose) * Number(count || 0)).toFixed(2));
  return amount;
};

export const activateBilling = (billing: any, at = new Date()) => {
  const planSmsCredits = Number(billing.monthlySmsLimit || billing.studentLimit || 0);
  // Extra credits bought separately via SMS packages (preserved across renewals)
  const extraSmsCredits = Number(billing.extraSmsCredits || 0);
  return {
    ...billing,
    billingStatus: 'active',
    isPaymentReceived: true,
    activatedAt: billing.activatedAt || at,
    subscriptionStartedAt: at,
    subscriptionExpiresAt: nextSubscriptionEnd(billing.billingCycle || 'monthly', at),
    // Grant free SMS credits = student limit every billing cycle
    planSmsCredits,
    extraSmsCredits,
    smsBalance: planSmsCredits + extraSmsCredits,
    smsBalanceResetAt: at,
  };
};

export const isSubscriptionExpired = (institution: any) => {
  const billing = institution?.billing || {};
  const expiresAt = billing?.subscriptionExpiresAt || billing?.expiresAt;
  // Treat institution as expired if explicit billing status is not 'active'
  if (billing?.billingStatus && billing.billingStatus !== 'active') return true;
  const dueAmount = Number(billing?.dueAmount || 0);
  const receivedAmount = Number(billing?.receivedAmount || 0);
  const balance = Math.max(dueAmount - receivedAmount, 0);
  const chargePeriodEnd = billing?.smsChargePeriodEnd || billing?.smsPeriodEnd;
  if (balance > 0 && chargePeriodEnd && new Date(chargePeriodEnd).getTime() < Date.now()) return true;
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

  // SMS Package credit system: smsBalance = remaining SMS count
  // Only treat as package-based if smsBalance is EXPLICITLY > 0
  // (smsBalance=0 or undefined means no package configured → allow unlimited)
  const smsBalance = Number(billing.smsBalance ?? 0);
  const hasPackage = smsBalance > 0;
  if (hasPackage) {
    if (smsBalance < units) return { allowed: false, message: 'SMS balance exhausted. Please buy an SMS package.' };
    return { allowed: true, balance: smsBalance, packageBased: true };
  }

  // No package / unlimited: allow SMS (track usage only)
  return { allowed: true, used: Number(billing.smsUsed || 0), unlimited: true };
};

export const incrementSmsUsage = async (institutionId: any, units = 1) => {
  const usage = await canUseSms(institutionId, units);
  if (!usage.allowed) return usage;
  const { start, end } = currentSmsPeriod();
  await Institution.findByIdAndUpdate(institutionId, {
    'billing.smsUsed': (usage.used || 0) + units,
    'billing.smsPeriodStart': start,
    'billing.smsPeriodEnd': end,
  });
  return usage;
};

export const recordSmsCharge = async (institutionId: any, count = 1, type?: string, purpose?: string) => {
  if (!institutionId || !count) return { count: 0, amount: 0, rate: 0, category: 'other' };

  const category = getSmsChargeCategory(type, purpose);
  const rate = getSmsChargeRate(type, purpose);
  const amount = Number((rate * Number(count || 0)).toFixed(2));
  const { start, end } = currentSmsPeriod();
  const institution = await Institution.findById(institutionId).select('billing');
  if (!institution) return { count, amount, rate, category, start, end };

  const billing: any = (institution as any).billing || {};

  const smsBalance = Number(billing.smsBalance ?? 0);
  const isPackageBased = smsBalance > 0;
  if (isPackageBased) {
    // Deduct 1 SMS credit per message segment sent (not money)
    if (smsBalance < count) return { count, amount, rate, category, start, end, insufficient: true };
    await Institution.findByIdAndUpdate(institutionId, {
      $inc: { 'billing.smsBalance': -count, 'billing.smsUsed': count },
      $set: { 'billing.smsPeriodStart': start, 'billing.smsPeriodEnd': end },
    });
    return { count, amount, rate, category, start, end, insufficient: false, packageBased: true };
  }

  // Legacy: monetary billing tracking (no balance deduction)
  const periodStart = billing.smsChargePeriodStart ? new Date(billing.smsChargePeriodStart) : null;
  const samePeriod = periodStart && periodStart.getTime() === start.getTime();
  const currentBreakdown = samePeriod ? { ...(billing.smsChargeBreakdown || {}) } : {};
  const currentEntry = currentBreakdown[category] || { count: 0, amount: 0, rate };
  currentBreakdown[category] = {
    count: Number(currentEntry.count || 0) + Number(count || 0),
    amount: Number((Number(currentEntry.amount || 0) + amount).toFixed(2)),
    rate,
  };

  const updatedBilling: Record<string, any> = {
    'billing.smsChargeAmount': Number((Number(samePeriod ? billing.smsChargeAmount || 0 : 0) + amount).toFixed(2)),
    'billing.smsChargeBreakdown': currentBreakdown,
    'billing.smsChargePeriodStart': start,
    'billing.smsChargePeriodEnd': end,
  };
  const incFields: Record<string, any> = { 'billing.smsUsed': count };
  if (!samePeriod) {
    updatedBilling['billing.smsPeriodStart'] = start;
    updatedBilling['billing.smsPeriodEnd'] = end;
  }

  await Institution.findByIdAndUpdate(institutionId, { $set: updatedBilling, $inc: incFields }, { new: true });
  return { count, amount, rate, category, start, end, insufficient: false };
};

export const refundSmsCharge = async (institutionId: any, count = 1, amount = 0, type?: string, purpose?: string) => {
  if (!institutionId || !count) return { refunded: 0, count: 0 };
  const { start } = currentSmsPeriod();
  const institution = await Institution.findById(institutionId).select('billing');
  if (!institution) return { refunded: 0, count: 0 };

  const billing: any = (institution as any).billing || {};
  const periodStart = billing.smsChargePeriodStart ? new Date(billing.smsChargePeriodStart) : null;
  const samePeriod = periodStart && periodStart.getTime() === start.getTime();
  const category = getSmsChargeCategory(type, purpose);
  const currentBreakdown = samePeriod ? { ...(billing.smsChargeBreakdown || {}) } : {};
  const currentEntry = currentBreakdown[category] || { count: 0, amount: 0, rate: getSmsChargeRate(type, purpose) };
  const smsBalance = Number(billing.smsBalance ?? -1);
  const isPackageBased = smsBalance >= 0;

  currentBreakdown[category] = {
    count: Math.max(0, Number(currentEntry.count || 0) - Number(count || 0)),
    amount: Number(Math.max(0, Number(currentEntry.amount || 0) - Number(amount || 0)).toFixed(2)),
    rate: currentEntry.rate,
  };

  const updatedBilling: Record<string, any> = {
    'billing.smsChargeAmount': Number(Math.max(0, Number(billing.smsChargeAmount || 0) - Number(amount || 0)).toFixed(2)),
    'billing.smsChargeBreakdown': currentBreakdown,
  };

  // Package-based billing stores smsBalance as SMS credits, not money.
  // Refund the same credit/segment count that was reserved before sending.
  const incFields: Record<string, any> = { 'billing.smsUsed': -Number(count || 0) };
  if (isPackageBased) incFields['billing.smsBalance'] = Number(count || 0);

  await Institution.findByIdAndUpdate(institutionId, { $set: updatedBilling, $inc: incFields });
  return { refunded: amount, count };
};

export const getCurrentSmsBillingSummary = async (institutionId: any) => {
  const institution: any = await Institution.findById(institutionId).select('billing').lean();
  const billing = institution?.billing || {};
  const { start, end } = currentSmsPeriod();
  const periodStart = billing.smsChargePeriodStart ? new Date(billing.smsChargePeriodStart) : null;
  const samePeriod = periodStart && periodStart.getTime() === start.getTime();
  const breakdown = samePeriod ? billing.smsChargeBreakdown || {} : {};
  const smsBalance = Number(billing.smsBalance ?? -1);
  return {
    periodStart: start,
    periodEnd: end,
    smsUsed: Number(billing.smsUsed || 0),
    smsBalance: smsBalance >= 0 ? smsBalance : null,
    smsChargeAmount: Number(samePeriod ? billing.smsChargeAmount || 0 : 0),
    smsChargeBreakdown: breakdown,
  };
};