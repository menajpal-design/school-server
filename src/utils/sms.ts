import { canUseSms, incrementSmsUsage } from '../services/billingService';
import SmsLog from '../models/SmsLog';

interface SMSOptions {
  to: string | string[];
  message: string;
  institutionId?: any;
  recipientName?: string | string[]; // Name of recipient(s)
  recipientPhone?: string | string[]; // Phone number(s)
  type?: 'attendance' | 'fee' | 'notice' | 'notification' | 'other';
  studentId?: any;
  parentId?: any;
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

const logSmsAttempt = async (options: SMSOptions, status: 'sent' | 'failed' | 'pending', failureReason?: string, apiResponse?: string) => {
  if (!options.institutionId) return;

  const phoneNumbers = recipientsFor(options.recipientPhone || options.to);
  const names = options.recipientName ? recipientsFor(options.recipientName) : phoneNumbers;

  try {
    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i];
      const recipientName = names[i] || `Unknown (${phoneNumber})`;

      await SmsLog.create({
        institutionId: options.institutionId,
        phoneNumber,
        recipientName,
        message: options.message,
        type: options.type || 'notification',
        status,
        studentId: options.studentId,
        parentId: options.parentId,
        sentAt: new Date(),
        failureReason,
        apiResponse,
      });
    }
  } catch (error) {
    console.error('Error logging SMS:', error);
  }
};

const sendViaAnoncify = async (options: SMSOptions): Promise<boolean> => {
  if (!SMS_API_KEY) {
    console.error('SMS_API_KEY is required for Anoncify SMS delivery');
    await logSmsAttempt(options, 'failed', 'SMS_API_KEY not configured');
    return false;
  }
  if (!(await ensureSmsQuota(options))) {
    await logSmsAttempt(options, 'failed', 'SMS quota exceeded');
    return false;
  }

  const recipients = recipientsFor(options.to);
  const phoneNumbers = recipientsFor(options.recipientPhone || options.to);
  const names = options.recipientName ? recipientsFor(options.recipientName) : phoneNumbers;

  try {
    let allSuccess = true;
    for (let i = 0; i < recipients.length; i++) {
      const phoneNumber = recipients[i];
      const recipientPhone = phoneNumbers[i];
      const recipientName = names[i] || `Unknown (${phoneNumber})`;

      try {
        const url = new URL(SMS_API_URL);
        url.searchParams.set('key', SMS_API_KEY);
        url.searchParams.set('number', phoneNumber);
        url.searchParams.set('msg', options.message);

        const response = await fetch(url.toString(), { method: 'GET' });
        const responseText = await response.text();
        
        if (!response.ok || isFailureResponse(responseText)) {
          console.error(`SMS send failed for ${phoneNumber}: ${response.status} ${responseText}`);
          await logSmsAttempt(
            { ...options, recipientPhone: phoneNumber, recipientName },
            'failed',
            `HTTP ${response.status}`,
            responseText
          );
          allSuccess = false;
        } else {
          await logSmsAttempt(
            { ...options, recipientPhone: phoneNumber, recipientName },
            'sent',
            undefined,
            responseText
          );
        }
      } catch (error) {
        console.error(`Error sending SMS to ${phoneNumber}:`, error);
        await logSmsAttempt(
          { ...options, recipientPhone: phoneNumber, recipientName },
          'failed',
          String(error)
        );
        allSuccess = false;
      }
    }

    if (allSuccess) {
      await markSmsUsed(options);
      console.log(`SMS sent to ${recipients.join(', ')}`);
    }
    return allSuccess;
  } catch (error) {
    console.error('Error sending SMS via Anoncify:', error);
    await logSmsAttempt(options, 'failed', String(error));
    return false;
  }
};

export const sendSMS = async (options: SMSOptions): Promise<boolean> => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';

  if (!smsEnabled) {
    if (!(await ensureSmsQuota(options))) {
      await logSmsAttempt(options, 'pending', 'SMS service disabled, quota exceeded');
      return false;
    }
    await markSmsUsed(options);
    await logSmsAttempt(options, 'pending', 'SMS service disabled');
    console.log(`SMS service is disabled. Would send SMS to ${recipientsFor(options.to).join(', ')}`);
    return true;
  }

  if (SMS_PROVIDER === 'anoncify') {
    return sendViaAnoncify(options);
  }

  console.error(`Unsupported SMS provider: ${SMS_PROVIDER}`);
  await logSmsAttempt(options, 'failed', `Unsupported SMS provider: ${SMS_PROVIDER}`);
  return false;
};

export const sendBulkSMS = async (recipients: string[], message: string, institutionId?: any): Promise<boolean> => (
  sendSMS({ to: recipients, message, institutionId })
);

export const sendAttendanceReminderSMS = async (phoneNumber: string, studentName: string, institutionId?: any): Promise<boolean> => {
  const message = `Dear Parent, ${studentName} was marked absent today. Please contact the school if this is an error.`;
  return sendSMS({ to: phoneNumber, message, institutionId, type: 'attendance', recipientName: `Parent of ${studentName}` });
};

export const sendFeeDueSMS = async (phoneNumber: string, studentName: string, dueAmount: number, institutionId?: any): Promise<boolean> => {
  const message = `Dear Parent, fee of ${dueAmount} is due for ${studentName}. Please pay within 7 days.`;
  return sendSMS({ to: phoneNumber, message, institutionId, type: 'fee', recipientName: `Parent of ${studentName}` });
};

export const sendNotificationSMS = async (phoneNumber: string, message: string, institutionId?: any): Promise<boolean> => (
  sendSMS({ to: phoneNumber, message: message.substring(0, 160), institutionId, type: 'notification' })
);
