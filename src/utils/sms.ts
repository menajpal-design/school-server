import { canUseSms, incrementSmsUsage } from '../services/billingService';

interface SMSOptions {
  to: string | string[];
  message: string;
  institutionId?: any;
}

const SMS_PROVIDER = (process.env.SMS_PROVIDER || 'anoncify').toLowerCase();
const SMS_API_URL = process.env.SMS_API_URL || 'https://anoncify.xyz/api/sms';
const SMS_API_KEY = process.env.SMS_API_KEY || process.env.ANONCIFY_SMS_API_KEY || '';

const isFailureResponse = (text: string): boolean => /error|fail|invalid/i.test(text);
const recipientsFor = (to: string | string[]) => Array.isArray(to) ? to : [to];

const ensureSmsQuota = async (options: SMSOptions) => {
  const recipients = recipientsFor(options.to);
  if (!options.institutionId) return true;
  const quota = await canUseSms(options.institutionId, recipients.length);
  if (!quota.allowed) {
    console.error(`SMS blocked: ${quota.message}`);
    return false;
  }
  return true;
};

const markSmsUsed = async (options: SMSOptions) => {
  if (options.institutionId) {
    await incrementSmsUsage(options.institutionId, recipientsFor(options.to).length);
  }
};

const sendViaAnoncify = async (options: SMSOptions): Promise<boolean> => {
  if (!SMS_API_KEY) {
    console.error('SMS_API_KEY is required for Anoncify SMS delivery');
    return false;
  }
  if (!(await ensureSmsQuota(options))) return false;

  const recipients = recipientsFor(options.to);
  try {
    for (const phoneNumber of recipients) {
      const url = new URL(SMS_API_URL);
      url.searchParams.set('key', SMS_API_KEY);
      url.searchParams.set('number', phoneNumber);
      url.searchParams.set('msg', options.message);

      const response = await fetch(url.toString(), { method: 'GET' });
      const responseText = await response.text();
      if (!response.ok || isFailureResponse(responseText)) {
        console.error(`SMS send failed for ${phoneNumber}: ${response.status} ${responseText}`);
        return false;
      }
    }

    await markSmsUsed(options);
    console.log(`SMS sent to ${recipients.join(', ')}`);
    return true;
  } catch (error) {
    console.error('Error sending SMS via Anoncify:', error);
    return false;
  }
};

export const sendSMS = async (options: SMSOptions): Promise<boolean> => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';

  if (!smsEnabled) {
    if (!(await ensureSmsQuota(options))) return false;
    await markSmsUsed(options);
    console.log(`SMS service is disabled. Would send SMS to ${recipientsFor(options.to).join(', ')}`);
    return true;
  }

  if (SMS_PROVIDER === 'anoncify') {
    return sendViaAnoncify(options);
  }

  console.error(`Unsupported SMS provider: ${SMS_PROVIDER}`);
  return false;
};

export const sendBulkSMS = async (recipients: string[], message: string, institutionId?: any): Promise<boolean> => (
  sendSMS({ to: recipients, message, institutionId })
);

export const sendAttendanceReminderSMS = async (phoneNumber: string, studentName: string, institutionId?: any): Promise<boolean> => {
  const message = `Dear Parent, ${studentName} was marked absent today. Please contact the school if this is an error.`;
  return sendSMS({ to: phoneNumber, message, institutionId });
};

export const sendFeeDueSMS = async (phoneNumber: string, studentName: string, dueAmount: number, institutionId?: any): Promise<boolean> => {
  const message = `Dear Parent, fee of ${dueAmount} is due for ${studentName}. Please pay within 7 days.`;
  return sendSMS({ to: phoneNumber, message, institutionId });
};

export const sendNotificationSMS = async (phoneNumber: string, message: string, institutionId?: any): Promise<boolean> => (
  sendSMS({ to: phoneNumber, message: message.substring(0, 160), institutionId })
);
