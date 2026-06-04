import Institution from '../models/Institution';
import { canUseSms, getSmsChargeAmount, getSmsChargeRate, recordSmsCharge } from '../services/billingService';
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
  smsChargeRate?: number;
  smsChargeAmount?: number;
  smsProvider?: string;
  smsApiUrl?: string;
  smsApiKey?: string;
  smsEnabled?: boolean;
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
const SMS_API_KEY = process.env.SMS_API_KEY || process.env.ANONCIFY_SMS_API_KEY || process.env.SMSLAYER_API_KEY || process.env.SMS_KEY || process.env.API_KEY || '';
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || process.env.SENDER_ID || process.env.SMS_FROM || '';

const recipientsFor = (to: string | string[]) => Array.isArray(to) ? to : [to];
const normalizePhone = (value: any) => {
  const digits = String(value || '').replace(/\D/g, '').replace(/^88/, '');
  return digits && !digits.startsWith('0') ? `0${digits}` : digits;
};

const parseGatewayResponse = (text: string) => {
  const raw = String(text || '').trim();
  if (!raw) return { ok: true, raw };
  try {
    const json: any = JSON.parse(raw);
    const status = String(json.status ?? json.success ?? json.response ?? json.message ?? '').toLowerCase();
    const ok = json.success === true || json.ok === true || ['success', 'sent', 'queued', 'submitted', 'ok', 'true', '1'].some((word) => status.includes(word));
    const failed = json.success === false || ['error', 'fail', 'failed', 'invalid', 'unauthorized', 'insufficient'].some((word) => status.includes(word));
    return { ok: ok || !failed, raw };
  } catch (_) {
    const lower = raw.toLowerCase();
    const ok = /success|sent|queued|submitted|ok|accepted/.test(lower);
    const failed = /error|fail|failed|invalid|unauthorized|insufficient|expired/.test(lower);
    return { ok: ok || !failed, raw };
  }
};

// GSM 03.38 basic characters (approx). If a message contains any character
// outside this set, treat it as Unicode which uses 70/67 segment sizes.
const GSM_7_REGEX = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØøCRÅå_\"'!@#%&()\-:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\\[~\]|€]*$/;

function computeSmsSegments(message: string) {
  const msg = String(message || '');
  const isGsm7 = GSM_7_REGEX.test(msg);
  if (isGsm7) {
    const single = 160;
    const multi = 153;
    if (msg.length <= single) return 1;
    return Math.ceil(msg.length / multi);
  }
  // Unicode (UCS-2)
  const singleU = 70;
  const multiU = 67;
  if (msg.length <= singleU) return 1;
  return Math.ceil(msg.length / multiU);
}

const ensureSmsQuota = async (options: SMSOptions) => {
  if (!options.institutionId) return true;
  const recipients = recipientsFor(options.to).filter(Boolean);
  const segments = computeSmsSegments(options.message || '');
  const units = recipients.length * segments;
  const quota = await canUseSms(options.institutionId, units);
  return Boolean(quota.allowed);
};

const buildChargeMeta = (options: SMSOptions, count = 1) => {
  const smsChargeRate = options.smsChargeRate ?? getSmsChargeRate(options.type, options.purpose);
  const smsChargeAmount = options.smsChargeAmount ?? getSmsChargeAmount(count, options.type, options.purpose);
  return { smsChargeRate, smsChargeAmount };
};

const resolveSmsConfig = async (options: SMSOptions) => {
  const institution = options.institutionId
    ? await Institution.findById(options.institutionId).select('settings.smsEnabled settings.smsProvider settings.smsApiUrl settings.smsApiKey settings.smsSenderId billing.smsBalance billing.smsUsed billing.monthlySmsLimit').lean()
    : null;

  const institutionSettings: any = (institution as any)?.settings || {};
  // Default SMS to enabled unless explicitly disabled on institution or globally disabled via env
  const globalEnabled = process.env.SMS_ENABLED !== 'false'; // default true unless explicitly set to 'false'
  const provider = String(institutionSettings.smsProvider || process.env.SMS_PROVIDER || SMS_PROVIDER || 'anoncify').toLowerCase();
  const apiUrl = String(institutionSettings.smsApiUrl || process.env.SMS_API_URL || SMS_API_URL || 'https://anoncify.xyz/api/sms').trim();
  const apiKey = String(institutionSettings.smsApiKey || process.env.SMS_API_KEY || process.env.ANONCIFY_SMS_API_KEY || process.env.SMSLAYER_API_KEY || process.env.SMS_KEY || process.env.API_KEY || SMS_API_KEY || '').trim();
  const senderId = String(institutionSettings.smsSenderId || process.env.SMS_SENDER_ID || process.env.SENDER_ID || process.env.SMS_FROM || SMS_SENDER_ID || '').trim();
  const enabled = typeof institutionSettings.smsEnabled === 'boolean' ? institutionSettings.smsEnabled : globalEnabled;

  return { institution, provider, apiUrl, apiKey, senderId, enabled };
};

export const buildCredentialSmsMessage = ({
  appName = process.env.APP_NAME || 'EASY SCHOOL',
  loginUrl = process.env.FRONTEND_URL || 'http://localhost:3000/login',
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

const logSmsAttempt = async (options: SMSOptions, status: 'sent' | 'failed' | 'pending' | 'delivered', failureReason?: string, apiResponse?: string, countPerRecipient = 1) => {
  if (!options.institutionId) return;
  const phoneNumbers = recipientsFor(options.recipientPhone || options.to).map(normalizePhone).filter(Boolean);
  const names = options.recipientName ? recipientsFor(options.recipientName) : phoneNumbers;
  const { smsChargeRate, smsChargeAmount } = buildChargeMeta(options, countPerRecipient * (phoneNumbers.length || 1));
  const provider = String(options.smsProvider || SMS_PROVIDER).toLowerCase();
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
        provider,
        unitCharge: smsChargeRate,
        chargeAmount: smsChargeAmount / Math.max(phoneNumbers.length, 1),
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

const buildAnoncifyBody = (smsConfig: Awaited<ReturnType<typeof resolveSmsConfig>>, phoneNumber: string, message: string) => {
  const body = new URLSearchParams();
  body.set('key', smsConfig.apiKey);
  body.set('number', phoneNumber);
  // SmsLayer/Anoncify API docs use `message`; older examples sometimes use `msg`.
  // Send both so existing deployments work with either parser.
  body.set('message', message);
  body.set('msg', message);
  if (smsConfig.senderId) {
    body.set('senderid', smsConfig.senderId);
    body.set('sender_id', smsConfig.senderId);
  }
  return body;
};

const sendViaAnoncify = async (options: SMSOptions): Promise<boolean> => {
  const smsConfig = await resolveSmsConfig(options);
  if (!smsConfig.enabled) {
    const segments = computeSmsSegments(options.message || '');
    await logSmsAttempt({ ...options, smsProvider: smsConfig.provider }, 'failed', 'SMS disabled for this institution', undefined, segments);
    return false;
  }
  if (smsConfig.provider !== 'anoncify' && smsConfig.provider !== 'smslayer') {
    await logSmsAttempt({ ...options, smsProvider: smsConfig.provider }, 'failed', `Unsupported SMS provider: ${smsConfig.provider}`);
    return false;
  }
  if (!smsConfig.apiKey) {
    const segments = computeSmsSegments(options.message || '');
    await logSmsAttempt({ ...options, smsProvider: smsConfig.provider }, 'failed', 'SMS API key not configured', undefined, segments);
    return false;
  }
  if (!(await ensureSmsQuota(options))) {
    const segments = computeSmsSegments(options.message || '');
    await logSmsAttempt({ ...options, smsProvider: smsConfig.provider }, 'failed', 'SMS quota exceeded', undefined, segments);
    return false;
  }
  const recipients = recipientsFor(options.to).map(normalizePhone).filter(Boolean);
  let successCount = 0;
  for (let i = 0; i < recipients.length; i += 1) {
    const phoneNumber = recipients[i];
    const segments = computeSmsSegments(options.message || '');
    const chargeResult = await recordSmsCharge(options.institutionId, segments, options.type, options.purpose);
    if (chargeResult && (chargeResult as any).insufficient) {
      await logSmsAttempt({ ...options, to: phoneNumber, recipientPhone: phoneNumber, smsProvider: smsConfig.provider }, 'failed', 'Insufficient SMS balance', undefined, segments);
      continue;
    }
    try {
      const url = new URL(smsConfig.apiUrl);
      const body = buildAnoncifyBody(smsConfig, phoneNumber, options.message);
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const responseText = await response.text();
      const parsed = parseGatewayResponse(responseText);
      if (!response.ok || !parsed.ok) {
        try {
          const chargeMeta = buildChargeMeta(options, segments);
          await (await import('../services/billingService')).refundSmsCharge(options.institutionId, segments, chargeMeta.smsChargeAmount, options.type, options.purpose);
        } catch (refundError) {
          console.error('Failed to refund SMS charge after gateway failure:', refundError);
        }
        await logSmsAttempt({ ...options, to: phoneNumber, recipientPhone: phoneNumber, smsProvider: smsConfig.provider }, 'failed', `HTTP ${response.status}`, responseText, segments);
      } else {
        successCount += 1;
        await logSmsAttempt({ ...options, to: phoneNumber, recipientPhone: phoneNumber, smsProvider: smsConfig.provider }, 'sent', undefined, responseText, segments);
      }
    } catch (error) {
      try {
        const chargeMeta = buildChargeMeta(options, segments);
        await (await import('../services/billingService')).refundSmsCharge(options.institutionId, segments, chargeMeta.smsChargeAmount, options.type, options.purpose);
      } catch (e) {
        console.error('Failed to refund SMS charge after send error:', e);
      }
      await logSmsAttempt({ ...options, to: phoneNumber, recipientPhone: phoneNumber, smsProvider: smsConfig.provider }, 'failed', String(error), undefined, segments);
    }
  }
  return successCount === recipients.length;
};

export const sendSMS = async (options: SMSOptions): Promise<boolean> => {
  const recipients = recipientsFor(options.to).map(normalizePhone).filter(Boolean);
  if (!recipients.length) { await logSmsAttempt(options, 'failed', 'No phone number found'); return false; }
  const smsConfig = await resolveSmsConfig({ ...options, to: recipients });
  if (!smsConfig.enabled) {
    const segments = computeSmsSegments(options.message || '');
    await logSmsAttempt({ ...options, to: recipients, recipientPhone: options.recipientPhone || recipients, smsProvider: smsConfig.provider }, 'failed', 'SMS disabled for this institution', undefined, segments);
    return false;
  }
  if (smsConfig.provider === 'anoncify' || smsConfig.provider === 'smslayer') {
    return sendViaAnoncify({ ...options, to: recipients, smsProvider: smsConfig.provider, smsApiUrl: smsConfig.apiUrl, smsApiKey: smsConfig.apiKey, smsEnabled: smsConfig.enabled });
  }
  await logSmsAttempt({ ...options, smsProvider: smsConfig.provider }, 'failed', `Unsupported SMS provider: ${smsConfig.provider}`);
  return false;
};

export const sendBulkSMS = async (recipients: string[], message: string, institutionId?: any): Promise<boolean> => sendSMS({ to: recipients, message, institutionId, type: 'notification', purpose: 'bulk' });
export const sendAttendanceReminderSMS = async (phoneNumber: string, studentName: string, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: `Dear Parent, ${studentName} was marked absent today. Please contact the school if this is an error.`, institutionId, type: 'attendance', purpose: 'attendance_absent', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendAttendanceDailySMS = async (phoneNumber: string, studentName: string, status: 'present' | 'absent' | 'late' | 'leave', institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: `Dear Parent, ${studentName} was marked ${status} today.`, institutionId, type: 'attendance', purpose: 'attendance_daily', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendResultSMS = async (phoneNumber: string, studentName: string, summary: string, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: `Dear Parent, result update for ${studentName}: ${summary}`.substring(0, 160), institutionId, type: 'notification', purpose: 'result_published', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendFeeDueSMS = async (phoneNumber: string, studentName: string, dueAmount: number, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: `Dear Parent, fee of ${dueAmount} is due for ${studentName}. Please pay within 7 days.`, institutionId, type: 'fee', purpose: 'fee_due', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendMonthlyParentSummarySMS = async (phoneNumber: string, studentName: string, message: string, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: message.substring(0, 160), institutionId, type: 'monthly_parent', purpose: 'monthly_parent', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendNotificationSMS = async (phoneNumber: string, message: string, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: message.substring(0, 160), institutionId, type: 'notification', purpose: 'notification' });