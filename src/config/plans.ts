export type BillingCycle = 'monthly' | 'yearly';

export const SCHOOL_PLANS = [
  { code: 'students_100', name: '100 Students', studentLimit: 100, monthlyPrice: 300, yearlyPrice: 3000, monthlySmsLimit: 100 },
  { code: 'students_200', name: '200 Students', studentLimit: 200, monthlyPrice: 500, yearlyPrice: 5000, monthlySmsLimit: 200 },
  { code: 'students_300', name: '300 Students', studentLimit: 300, monthlyPrice: 600, yearlyPrice: 6000, monthlySmsLimit: 300 },
  { code: 'students_500', name: '500 Students', studentLimit: 500, monthlyPrice: 1000, yearlyPrice: 9000, monthlySmsLimit: 500 },
  { code: 'students_1000', name: '1000 Students', studentLimit: 1000, monthlyPrice: 2000, yearlyPrice: 17500, monthlySmsLimit: 1000 },
].map((plan) => ({
  ...plan,
  yearlyDiscountPercent: Math.round((1 - plan.yearlyPrice / (plan.monthlyPrice * 12)) * 100),
}));

export const EASY_SCHOOL_STORAGE_MONTHLY_PRICE = 100;

export const getPlanByCode = (code?: string) => SCHOOL_PLANS.find((plan) => plan.code === code) || SCHOOL_PLANS[0];

export const calculatePlanDue = (code?: string, billingCycle: BillingCycle = 'monthly', useEasySchoolStorage = false, smsChargeAmount = 0) => {
  const plan = getPlanByCode(code);
  const baseAmount = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  const storageAmount = useEasySchoolStorage ? EASY_SCHOOL_STORAGE_MONTHLY_PRICE * (billingCycle === 'yearly' ? 12 : 1) : 0;
  return { plan, baseAmount, storageAmount, smsChargeAmount, total: baseAmount + storageAmount + Number(smsChargeAmount || 0) };
};
