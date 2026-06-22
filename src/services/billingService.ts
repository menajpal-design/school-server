import Institution from '../models/Institution';
import SmsLog from '../models/SmsLog';

export const SMS_CHARGE_RATES = {
  attendance_absent: 0.6,
  attendance_daily: 0,
  attendance_weekly: 0,
  result: 0.45,
  monthly_parent: 0.45,
  credentials: 0,
  notification: 0.45,
  admission: 0,
  fee: 0.45,
  notice: 0.45,
  other: 0.45,
} as const;

// Monthly auto SMS (guardian monthly summary) → uses purchased SMS package (smsBalance)
// Regular SMS (attendance, notification, etc.) → uses plan's monthlySmsLimit
const isMonthlyParentSms = (type?: string, purpose?: string): boolean => {
  const t = String(type || '').toLowerCase();
  const p = String(purpose || '').toLowerCase();
  return t === 'monthly_parent' || p.includes('monthly_parent') || p.includes('monthly_guardian') || p.includes('monthly_summary');
};

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
  if (normalizedPurpose.includes('attendance_weekly') || normalizedPurpose.includes('weekly_present')) return 'attendance_weekly';
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
export const getSmsChargeRate = (type?: string, purpose?: string) => {
  const category = getSmsChargeCategory(type, purpose) as keyof typeof SMS_CHARGE_RATES;
  return SMS_CHARGE_RATES[category] ?? SMS_CHARGE_RATES.other;
};
export const getSmsChargeAmount = (count = 1, type?: string, purpose?: string) => Number((getSmsChargeRate(type, purpose) * Number(count || 0)).toFixed(2));
export const isFreeSmsCategory = (type?: string, purpose?: string) => getSmsChargeRate(type, purpose) <= 0;

export const activateBilling = (billing: any, at = new Date()) => {
  const planSmsCredits = Number(billing.monthlySmsLimit || billing.studentLimit || 0);
  const extraSmsCredits = Number(billing.extraSmsCredits || 0);
  const paidDays = billing.billingCycle === 'yearly' ? 365 : 30;
  const subscriptionExpiresAt = nextSubscriptionEnd(billing.billingCycle || 'monthly', at);
  return {
    ...billing,
    billingStatus: 'active',
    isPaymentReceived: true,
    activatedAt: billing.activatedAt || at,
    subscriptionStartedAt: at,
    subscriptionExpiresAt,
    planExpiry: subscriptionExpiresAt,
    validUntil: subscriptionExpiresAt,
    billingPeriodEnd: subscriptionExpiresAt,
    paidDays,
    remainingDays: Math.max(0, Math.ceil((subscriptionExpiresAt.getTime() - Date.now()) / 86400000)),
    planSmsCredits,
    extraSmsCredits,
    smsBalance: planSmsCredits + extraSmsCredits,
    smsBalanceResetAt: at,
  };
};

export const isSubscriptionExpired = (institution: any) => {
  const billing = institution?.billing || {};
  const expiresAt = billing?.subscriptionExpiresAt || billing?.planExpiry || billing?.validUntil || billing?.billingPeriodEnd || billing?.expiresAt;
  if (billing?.billingStatus && billing.billingStatus !== 'active' && billing.billingStatus !== 'trial') return true;
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
  institution.billing = { ...(typeof institution.billing?.toObject === 'function' ? institution.billing.toObject() : institution.billing || {}), billingStatus: 'expired' };
  await institution.save();
  return institution;
};

export const canUseSms = async (institutionId: any, units = 1, type?: string, purpose?: string) => {
  const institution = await Institution.findById(institutionId).select('billing');
  if (!institution) return { allowed: false, message: 'Institution not found' };
  const billing: any = (institution as any).billing || {};

  // Monthly auto SMS → requires purchased SMS package (smsBalance)
  if (isMonthlyParentSms(type, purpose)) {
    const smsBalance = Number(billing.smsBalance ?? 0);
    if (smsBalance < units) return { allowed: false, balance: smsBalance, message: 'SMS balance exhausted. Please buy an SMS package for monthly auto SMS.' };
    return { allowed: true, balance: smsBalance, packageBased: true };
  }

  // Regular SMS → uses plan monthlySmsLimit quota
  const monthlyLimit = Number(billing.monthlySmsLimit ?? 0);
  const smsUsed = Number(billing.smsUsed ?? 0);
  if (monthlyLimit > 0 && smsUsed >= monthlyLimit) {
    return { allowed: false, used: smsUsed, monthlyLimit, message: 'Monthly SMS limit reached. Contact admin to increase your plan.' };
  }
  return { allowed: true, used: smsUsed, monthlyLimit, unlimited: monthlyLimit === 0 };
};

export const getAttendanceSmsMode = async (institutionId: any): Promise<'none' | 'daily' | 'weekly'> => {
  const institution: any = await Institution.findById(institutionId).select('billing.planCode billing.attendanceSmsMode').lean();
  const billing = institution?.billing || {};
  const explicit = String(billing.attendanceSmsMode || '').toLowerCase();
  if (explicit === 'daily' || explicit === 'weekly') return explicit;
  const code = String(billing.planCode || '').toLowerCase();
  if (code.includes('attendance_daily')) return 'daily';
  if (code.includes('attendance_weekly')) return 'weekly';
  return 'none';
};

export const incrementSmsUsage = async (institutionId: any, units = 1) => {
  const usage = await canUseSms(institutionId, units);
  if (!usage.allowed) return usage;
  const { start, end } = currentSmsPeriod();
  await Institution.findByIdAndUpdate(institutionId, { 'billing.smsUsed': (usage.used || 0) + units, 'billing.smsPeriodStart': start, 'billing.smsPeriodEnd': end });
  return usage;
};

export const recordSmsCharge = async (institutionId: any, count = 1, type?: string, purpose?: string) => {
  if (!institutionId || !count) return { count: 0, amount: 0, rate: 0, category: 'other' };
  const category = getSmsChargeCategory(type, purpose);
  const rate = getSmsChargeRate(type, purpose);
  const amount = Number((rate * Number(count || 0)).toFixed(2));
  if (rate <= 0) return { count, amount: 0, rate, category, free: true, insufficient: false };
  const { start, end } = currentSmsPeriod();
  const institution = await Institution.findById(institutionId).select('billing');
  if (!institution) return { count, amount, rate, category, start, end };
  const billing: any = (institution as any).billing || {};
  const smsBalance = Number(billing.smsBalance ?? 0);

  // Monthly parent SMS → deduct from purchased package (smsBalance) only
  if (isMonthlyParentSms(type, purpose)) {
    if (smsBalance < count) return { count, amount, rate, category, start, end, insufficient: true };
    await Institution.findByIdAndUpdate(institutionId, { $inc: { 'billing.smsBalance': -count, 'billing.smsUsed': count }, $set: { 'billing.smsPeriodStart': start, 'billing.smsPeriodEnd': end } });
    return { count, amount, rate, category, start, end, insufficient: false, packageBased: true };
  }

  // Regular SMS → track against monthlySmsLimit (do NOT deduct from smsBalance)
  const periodStart = billing.smsChargePeriodStart ? new Date(billing.smsChargePeriodStart) : null;
  const samePeriod = periodStart && periodStart.getTime() === start.getTime();
  const currentBreakdown = samePeriod ? { ...(billing.smsChargeBreakdown || {}) } : {};
  const currentEntry = currentBreakdown[category] || { count: 0, amount: 0, rate };
  currentBreakdown[category] = { count: Number(currentEntry.count || 0) + Number(count || 0), amount: Number((Number(currentEntry.amount || 0) + amount).toFixed(2)), rate };
  const updatedBilling: Record<string, any> = { 'billing.smsChargeAmount': Number((Number(samePeriod ? billing.smsChargeAmount || 0 : 0) + amount).toFixed(2)), 'billing.smsChargeBreakdown': currentBreakdown, 'billing.smsChargePeriodStart': start, 'billing.smsChargePeriodEnd': end };
  const incFields: Record<string, any> = { 'billing.smsUsed': count };
  if (!samePeriod) { updatedBilling['billing.smsPeriodStart'] = start; updatedBilling['billing.smsPeriodEnd'] = end; }
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
  currentBreakdown[category] = { count: Math.max(0, Number(currentEntry.count || 0) - Number(count || 0)), amount: Number(Math.max(0, Number(currentEntry.amount || 0) - Number(amount || 0)).toFixed(2)), rate: currentEntry.rate };
  const updatedBilling: Record<string, any> = { 'billing.smsChargeAmount': Number(Math.max(0, Number(billing.smsChargeAmount || 0) - Number(amount || 0)).toFixed(2)), 'billing.smsChargeBreakdown': currentBreakdown };
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
  return { periodStart: start, periodEnd: end, smsUsed: Number(billing.smsUsed || 0), smsBalance: smsBalance >= 0 ? smsBalance : null, smsChargeAmount: Number(samePeriod ? billing.smsChargeAmount || 0 : 0), smsChargeBreakdown: breakdown };
};
