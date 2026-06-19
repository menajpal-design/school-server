// School subscription plans and SMS package configuration
// SMS minimum price: 0.50 BDT per SMS (no bulk discount below this floor)
// Student plan includes free SMS equal to student count each billing cycle

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

// SMS Package system: 1 credit = 1 SMS
// Schools buy SMS credits. Each SMS sent deducts 1 credit from smsBalance.
// Minimum price = 0.50 BDT (50 পয়সা) per SMS — no bulk discount below this floor.
export const SMS_PACKAGES = [
  { code: 'sms_50',   smsCount: 50,   price: 30,   label: '৫০ SMS',   pricePerSms: 0.60 },
  { code: 'sms_100',  smsCount: 100,  price: 55,   label: '১০০ SMS',  pricePerSms: 0.55 },
  { code: 'sms_200',  smsCount: 200,  price: 100,  label: '২০০ SMS',  pricePerSms: 0.50 },
  { code: 'sms_300',  smsCount: 300,  price: 150,  label: '৩০০ SMS',  pricePerSms: 0.50 },
  { code: 'sms_500',  smsCount: 500,  price: 250,  label: '৫০০ SMS',  pricePerSms: 0.50 },
  { code: 'sms_1000', smsCount: 1000, price: 500,  label: '১০০০ SMS', pricePerSms: 0.50 },
  { code: 'sms_2000', smsCount: 2000, price: 1000, label: '২০০০ SMS', pricePerSms: 0.50 },
  { code: 'sms_5000', smsCount: 5000, price: 2500, label: '৫০০০ SMS', pricePerSms: 0.50 },
];

export const getSmsPackageByCode = (code?: string) => SMS_PACKAGES.find((pkg) => pkg.code === code);
export const getSmsPackageForStudentCount = (studentCount: number) =>
  SMS_PACKAGES.find((pkg) => pkg.smsCount >= studentCount) || SMS_PACKAGES[SMS_PACKAGES.length - 1];

export const EASY_SCHOOL_STORAGE_MONTHLY_PRICE = 100;

export const getPlanByCode = (code?: string) => SCHOOL_PLANS.find((plan) => plan.code === code) || SCHOOL_PLANS[0];

export const calculatePlanDue = (code?: string, billingCycle: BillingCycle = 'monthly', useEasySchoolStorage = false, smsChargeAmount = 0) => {
  const plan = getPlanByCode(code);
  const baseAmount = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
  const storageAmount = useEasySchoolStorage ? EASY_SCHOOL_STORAGE_MONTHLY_PRICE * (billingCycle === 'yearly' ? 12 : 1) : 0;
  return { plan, baseAmount, storageAmount, smsChargeAmount, total: baseAmount + storageAmount + Number(smsChargeAmount || 0) };
};
