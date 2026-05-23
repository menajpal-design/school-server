import { canUseSms, incrementSmsUsage } from '../services/billingService';
import SmsLog from '../models/SmsLog';

interface SMSOptions {
  to: string | string[];
  message: string;
  institutionId?: any;
  recipientName?: string | string[];
  recipientPhone?: string | string[];
  recipientId?: any;
  recipientType?: 'student' | 'teacher' | 'staff' | 'guardian' | 'parent' | 'other';
  type?: 'attendance' | 'fee' | 'notice' | 'notification' | 'admission' | 'credentials' | 'monthly_parent' | 'other';
  purpose?: string;
  studentId?: any;
  parentId?: any;
}

interface CredentialSmsOptions {
  appName?: string;
  loginUrl?: string;
  summary: string;
  username: string;
  password: string;
  parentUsername?: string;
  parentPassword?: string;
}

const SMS_PROVIDER = (process.env.SMS_PROVIDER || 'anoncify').toLowerCase();
const SMS_API_URL = process.env.SMS_API_URL || 'https://anoncify.xyz/api/sms';
const SMS_API_KEY = process.env.SMS_API_KEY || process.env.ANONCIFY_SMS_API_KEY || '';
const isFailureResponse = (text: string): boolean => /error|fail|invalid/i.test(text);
const recipientsFor = (to: string | string[]) => Array.isArray(to) ? to : [to];
const normalizePhone = (value: any) => {
  const digits = String(value || '').replace(/\D/g, '').replace(/^88/, '');
  return digits && !digits.startsWith('0') ? `0${digits}` : digits;
};

const ensureSmsQuota = async (options: SMSOptions) => {
  const recipients = recipientsFor(options.to).filter(Boolean);
  if (!options.institutionId) return true;
  const quota = await canUseSms(options.institutionId, recipients.length);
  return Boolean(quota.allowed);
};
const markSmsUsed = async (options: SMSOptions, count?: number) => {
  if (options.institutionId) await incrementSmsUsage(options.institutionId, count ?? recipientsFor(options.to).filter(Boolean).length);
};

export const buildCredentialSmsMessage = ({
  appName = process.env.APP_NAME || 'EASY SCHOOL',
  loginUrl = process.env.FRONTEND_URL || 'https://www.easyschool.live/login',
  summary,
  username,
  password,
  parentUsername,
  parentPassword,
}: CredentialSmsOptions) => {
  const lines = [
    `${appName} ${summary}.`,
    `Username: ${username}. Password: ${password}.`,
  ];
  if (parentUsername) lines.push(`Parent username: ${parentUsername}. Parent password: ${parentPassword || 'N/A'}.`);
  lines.push(`Login: ${loginUrl}.`, 'Please log in and change your password after the first sign in.');
  return lines.join(' ');
};

const logSmsAttempt = async (options: SMSOptions, status: 'sent' | 'failed' | 'pending' | 'delivered', failureReason?: string, apiResponse?: string) => {
  if (!options.institutionId) return;
  const phoneNumbers = recipientsFor(options.recipientPhone || options.to).map(normalizePhone).filter(Boolean);
  const names = options.recipientName ? recipientsFor(options.recipientName) : phoneNumbers;
  for (let i = 0; i < phoneNumbers.length; i += 1) {
    const phoneNumber = phoneNumbers[i];
    try {
      await SmsLog.create({
        institutionId: options.institutionId,
        phoneNumber,
        recipientPhone: phoneNumber,
        recipientName: String(names[i] || `Unknown (${phoneNumber})`),
        recipientId: options.recipientId,
        recipientType: options.recipientType || 'other',
        message: options.message,
        type: options.type || 'notification',
        purpose: options.purpose || options.type || 'notification',
        provider: SMS_PROVIDER,
        status,
        studentId: options.studentId,
        parentId: options.parentId,
        sentAt: new Date(),
        failureReason,
        errorMessage: failureReason,
        apiResponse,
      });
    } catch (error) {
      console.error('Error logging SMS:', error);
    }
  }
};

const sendViaAnoncify = async (options: SMSOptions): Promise<boolean> => {
  if (!SMS_API_KEY) {
    await logSmsAttempt(options, 'failed', 'SMS_API_KEY not configured');
    return false;
  }
  if (!(await ensureSmsQuota(options))) {
    await logSmsAttempt(options, 'failed', 'SMS quota exceeded');
    return false;
  }
  const recipients = recipientsFor(options.to).map(normalizePhone).filter(Boolean);
  let successCount = 0;
  for (let i = 0; i < recipients.length; i += 1) {
    const phoneNumber = recipients[i];
    try {
      const url = new URL(SMS_API_URL);
      url.searchParams.set('key', SMS_API_KEY);
      url.searchParams.set('number', phoneNumber);
      url.searchParams.set('msg', options.message);
      const response = await fetch(url.toString(), { method: 'GET' });
      const responseText = await response.text();
      if (!response.ok || isFailureResponse(responseText)) await logSmsAttempt({ ...options, to: phoneNumber, recipientPhone: phoneNumber }, 'failed', `HTTP ${response.status}`, responseText);
      else { successCount += 1; await logSmsAttempt({ ...options, to: phoneNumber, recipientPhone: phoneNumber }, 'sent', undefined, responseText); }
    } catch (error) {
      await logSmsAttempt({ ...options, to: phoneNumber, recipientPhone: phoneNumber }, 'failed', String(error));
    }
  }
  if (successCount > 0) await markSmsUsed(options, successCount);
  return successCount === recipients.length;
};

export const sendSMS = async (options: SMSOptions): Promise<boolean> => {
  const recipients = recipientsFor(options.to).map(normalizePhone).filter(Boolean);
  if (!recipients.length) { await logSmsAttempt(options, 'failed', 'No phone number found'); return false; }
  const smsEnabled = process.env.SMS_ENABLED === 'true';
  if (!smsEnabled) {
    if (!(await ensureSmsQuota({ ...options, to: recipients }))) { await logSmsAttempt(options, 'failed', 'SMS quota exceeded'); return false; }
    await markSmsUsed(options, recipients.length);
    await logSmsAttempt({ ...options, to: recipients, recipientPhone: options.recipientPhone || recipients }, 'sent', 'SMS service disabled; logged for monitoring');
    return true;
  }
  if (SMS_PROVIDER === 'anoncify') return sendViaAnoncify({ ...options, to: recipients });
  await logSmsAttempt(options, 'failed', `Unsupported SMS provider: ${SMS_PROVIDER}`);
  return false;
};

export const sendBulkSMS = async (recipients: string[], message: string, institutionId?: any): Promise<boolean> => sendSMS({ to: recipients, message, institutionId, type: 'notification', purpose: 'bulk' });
export const sendAttendanceReminderSMS = async (phoneNumber: string, studentName: string, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: `Dear Parent, ${studentName} was marked absent today. Please contact the school if this is an error.`, institutionId, type: 'attendance', purpose: 'attendance_absent', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendFeeDueSMS = async (phoneNumber: string, studentName: string, dueAmount: number, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: `Dear Parent, fee of ${dueAmount} is due for ${studentName}. Please pay within 7 days.`, institutionId, type: 'fee', purpose: 'fee_due', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendNotificationSMS = async (phoneNumber: string, message: string, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: message.substring(0, 160), institutionId, type: 'notification', purpose: 'notification' });
