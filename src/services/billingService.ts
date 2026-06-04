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
  const limit = Number(billing.monthlySmsLimit || 0);
  // If no limit configured, allow SMS (unlimited)
  if (!limit) return { allowed: true, used: 0, limit: 0, unlimited: true };

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

export const recordSmsCharge = async (institutionId: any, count = 1, type?: string, purpose?: string) => {
  if (!institutionId || !count) return { count: 0, amount: 0, rate: 0, category: 'other' };

  const category = getSmsChargeCategory(type, purpose);
  const rate = getSmsChargeRate(type, purpose);
  const amount = Number((rate * Number(count || 0)).toFixed(2));
  const { start, end } = currentSmsPeriod();
  const institution = await Institution.findById(institutionId).select('billing');
  if (!institution) return { count, amount, rate, category, start, end };

  const billing: any = (institution as any).billing || {};
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

  if (!samePeriod) {
    Object.assign(updatedBilling, {
      'billing.smsUsed': Number(count || 0),
      'billing.smsPeriodStart': start,
      'billing.smsPeriodEnd': end,
    });
  }

  if (samePeriod) {
    updatedBilling['billing.smsUsed'] = Number(billing.smsUsed || 0) + Number(count || 0);
  }

  // Attempt atomic debit of smsBalance and update billing in one operation.
  const balance = Number(institution ? (institution as any).billing?.smsBalance || 0 : 0);
  // If smsBalance is not configured (0 and never set), skip balance check and allow SMS
  const hasBalanceConfigured = balance > 0 || (billing && billing.smsBalance !== undefined && billing.smsBalance !== null);
  if (hasBalanceConfigured && balance < amount) {
    // Insufficient SMS balance
    return { count, amount, rate, category, start, end, insufficient: true };
  }

  const updateQuery: Record<string, any> = { $set: updatedBilling };
  if (hasBalanceConfigured) {
    updateQuery['$inc'] = { 'billing.smsBalance': -amount, 'billing.smsUsed': count };
  } else {
    updateQuery['$inc'] = { 'billing.smsUsed': count };
  }

  await Institution.findByIdAndUpdate(institutionId, updateQuery, { new: true });

  return { count, amount, rate, category, start, end, insufficient: false };
};

export const refundSmsCharge = async (institutionId: any, count = 1, amount = 0, type?: string, purpose?: string) => {
  if (!institutionId || !count) return { refunded: 0 };
  const { start } = currentSmsPeriod();
  const institution = await Institution.findById(institutionId).select('billing');
  if (!institution) return { refunded: 0 };

  const billing: any = (institution as any).billing || {};
  const periodStart = billing.smsChargePeriodStart ? new Date(billing.smsChargePeriodStart) : null;
  const samePeriod = periodStart && periodStart.getTime() === start.getTime();
  const category = getSmsChargeCategory(type, purpose);
  const currentBreakdown = samePeriod ? { ...(billing.smsChargeBreakdown || {}) } : {};
  const currentEntry = currentBreakdown[category] || { count: 0, amount: 0, rate: getSmsChargeRate(type, purpose) };

  currentBreakdown[category] = {
    count: Math.max(0, Number(currentEntry.count || 0) - Number(count || 0)),
    amount: Number(Math.max(0, Number(currentEntry.amount || 0) - Number(amount || 0)).toFixed(2)),
    rate: currentEntry.rate,
  };

  const updatedBilling: Record<string, any> = {
    'billing.smsChargeAmount': Number(Math.max(0, Number(billing.smsChargeAmount || 0) - Number(amount || 0)).toFixed(2)),
    'billing.smsChargeBreakdown': currentBreakdown,
  };

  // Atomic refund: increment balance, decrement smsUsed
  await Institution.findByIdAndUpdate(institutionId, { $set: updatedBilling, $inc: { 'billing.smsBalance': Number(amount || 0), 'billing.smsUsed': -count } });
  return { refunded: amount, count };
};

export const getCurrentSmsBillingSummary = async (institutionId: any) => {
  const { start, end } = currentSmsPeriod();
  const logs = await SmsLog.find({ institutionId, sentAt: { $gte: start, $lt: end }, status: 'sent' }).select('type purpose').lean();
  const summary = logs.reduce((acc: any, log: any) => {
    const category = getSmsChargeCategory(log.type, log.purpose);
    const rate = getSmsChargeRate(log.type, log.purpose);
    const entry = acc.breakdown[category] || { count: 0, amount: 0, rate };
    entry.count += 1;
    entry.amount = Number((entry.amount + rate).toFixed(2));
    entry.rate = rate;
    acc.breakdown[category] = entry;
    acc.totalCount += 1;
    acc.totalAmount = Number((acc.totalAmount + rate).toFixed(2));
    return acc;
  }, { totalCount: 0, totalAmount: 0, breakdown: {} as Record<string, { count: number; amount: number; rate: number }> });

  return {
    periodStart: start,
    periodEnd: end,
    totalCount: summary.totalCount,
    totalAmount: summary.totalAmount,
    breakdown: summary.breakdown,
  };
};
