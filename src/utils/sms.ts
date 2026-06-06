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
interface CredentialSmsOptions { appName?: string; loginUrl?: string; summary: string; username: string; password: string; parentUsername?: string; parentPassword?: string; }

const SMS_PROVIDER = (process.env.SMS_PROVIDER || 'anoncify').toLowerCase();
const SMS_API_URL = process.env.SMS_API_URL || 'https://anoncify.xyz/api/sms';
const SMS_API_KEY = process.env.SMS_API_KEY || process.env.ANONCIFY_SMS_API_KEY || process.env.SMSLAYER_API_KEY || process.env.SMS_KEY || process.env.API_KEY || '';
const DEFAULT_MAIN_DOMAIN = process.env.MAIN_DOMAIN || process.env.NEXT_PUBLIC_MAIN_DOMAIN || process.env.PUBLIC_ROOT_DOMAIN || 'easyschool.live';
const recipientsFor = (to: string | string[]) => Array.isArray(to) ? to : [to];
const normalizePhone = (value: any) => { const digits = String(value || '').replace(/\D/g, '').replace(/^88/, ''); return digits && !digits.startsWith('0') ? `0${digits}` : digits; };
const asciiOnly = (value: any) => String(value || '').replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
const compactUrl = (value: string) => String(value || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');

const parseGatewayResponse = (text: string) => {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, raw };
  try { const json: any = JSON.parse(raw); const status = String(json.status ?? json.success ?? json.response ?? json.message ?? '').toLowerCase(); const ok = json.success === true || json.ok === true || ['sent', 'success', 'queued', 'submitted', 'ok', 'true', '1'].some((word) => status.includes(word)); const failed = json.success === false || ['error', 'fail', 'failed', 'invalid', 'unauthorized', 'insufficient'].some((word) => status.includes(word)); return { ok: ok || !failed, raw }; }
  catch (_) { const lower = raw.toLowerCase(); const ok = /(^|\b)(sent|success|queued|submitted|ok|accepted)(\b|$)/.test(lower); const failed = /error|fail|failed|invalid|unauthorized|insufficient|expired|missing|bad params/.test(lower); return { ok: ok || !failed, raw }; }
};
const cleanOrigin = (value?: string) => { const raw = String(value || '').trim(); if (!raw || /localhost|127\.0\.0\.1/i.test(raw)) return ''; const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`; try { const url = new URL(withProtocol); return `${url.protocol}//${url.host}`.replace(/\/$/, ''); } catch (_) { return ''; } };
const frontendOriginFromEnv = () => cleanOrigin(process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '');
const rootDomainFromEnv = () => { const origin = frontendOriginFromEnv(); if (origin) { try { return new URL(origin).hostname.replace(/^www\./i, ''); } catch (_) { return DEFAULT_MAIN_DOMAIN.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, ''); } } return DEFAULT_MAIN_DOMAIN.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, ''); };
const buildInstitutionLoginUrl = (institution: any) => { const subdomain = String(institution?.subdomain || '').trim().toLowerCase(); if (subdomain) return `https://${subdomain}.${rootDomainFromEnv()}/login`; const domains = Array.isArray(institution?.domains) ? institution.domains : []; const domainOrigin = cleanOrigin(domains.find(Boolean)); if (domainOrigin) return `${domainOrigin}/login`; const websiteOrigin = cleanOrigin(institution?.website); if (websiteOrigin) return `${websiteOrigin}/login`; const envOrigin = frontendOriginFromEnv() || `https://www.${rootDomainFromEnv()}`; return `${envOrigin}/login`; };
const getInstitutionSmsBranding = async (institutionId?: any) => { if (!institutionId) return null; const institution: any = await Institution.findById(institutionId).select('name website domains subdomain').lean(); if (!institution) return null; const appName = asciiOnly(institution.name || process.env.APP_NAME || 'ES') || 'ES'; return { appName, loginUrl: buildInstitutionLoginUrl(institution) }; };

const GSM_7_REGEX = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØøCRÅå_"'!#%&()\-:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\[~\]|€\/\.\+,]*$/;
function computeSmsSegments(message: string) { const msg = String(message || ''); const isGsm7 = GSM_7_REGEX.test(msg); if (isGsm7) return msg.length <= 160 ? 1 : Math.ceil(msg.length / 153); return msg.length <= 70 ? 1 : Math.ceil(msg.length / 67); }
const oneCreditMessage = (message: string) => { const msg = String(message || '').replace(/\s+/g, ' ').trim(); const isGsm7 = GSM_7_REGEX.test(msg); const limit = isGsm7 ? 160 : 70; return msg.length <= limit ? msg : msg.slice(0, limit); };
const forceOneCreditOptions = (options: SMSOptions): SMSOptions => ({ ...options, message: oneCreditMessage(options.message || '') });
const applyInstitutionBrandingToSms = async (options: SMSOptions): Promise<SMSOptions> => {
  if (!options.institutionId || !options.message) return forceOneCreditOptions(options);
  try { const branding = await getInstitutionSmsBranding(options.institutionId); if (!branding) return forceOneCreditOptions(options); let message = String(options.message || ''); message = message.replace(/^\s*(EASY SCHOOL|Easy School)\b/, branding.appName); message = message.replace(/Login:\s*https?:\/\/[^\s.]+(?:\.[^\s.]+)*(?::\d+)?\/login\.?/i, `Login: ${compactUrl(branding.loginUrl)}`); message = message.replace(/https?:\/\/localhost(?::\d+)?\/login/gi, compactUrl(branding.loginUrl)); message = message.replace(/https?:\/\/www\.easyschool\.live\/login/gi, compactUrl(branding.loginUrl)); message = message.replace(/https?:\/\/easyschool\.live\/login/gi, compactUrl(branding.loginUrl)); return forceOneCreditOptions({ ...options, message }); }
  catch (error) { console.error('Failed to apply institution SMS branding:', error); return forceOneCreditOptions(options); }
};
const ensureSmsQuota = async (options: SMSOptions) => { if (!options.institutionId) return true; const recipients = recipientsFor(options.to).filter(Boolean); const units = recipients.length; const quota = await canUseSms(options.institutionId, units); return Boolean(quota.allowed); };
const buildChargeMeta = (options: SMSOptions, count = 1) => { const smsChargeRate = options.smsChargeRate ?? getSmsChargeRate(options.type, options.purpose); const smsChargeAmount = options.smsChargeAmount ?? getSmsChargeAmount(count, options.type, options.purpose); return { smsChargeRate, smsChargeAmount }; };
const resolveSmsConfig = async (options: SMSOptions) => {
  const institution = options.institutionId ? await Institution.findById(options.institutionId).select('settings.smsEnabled settings.smsProvider settings.smsApiUrl settings.smsApiKey billing.smsBalance billing.smsUsed billing.monthlySmsLimit').lean() : null;
  const institutionSettings: any = (institution as any)?.settings || {}; const globalEnabled = process.env.SMS_ENABLED !== 'false'; const provider = String(institutionSettings.smsProvider || process.env.SMS_PROVIDER || SMS_PROVIDER || 'anoncify').toLowerCase(); const apiUrl = String(institutionSettings.smsApiUrl || process.env.SMS_API_URL || SMS_API_URL || 'https://anoncify.xyz/api/sms').trim(); const rawKey = String(institutionSettings.smsApiKey || process.env.SMS_API_KEY || process.env.ANONCIFY_SMS_API_KEY || process.env.SMSLAYER_API_KEY || process.env.SMS_KEY || process.env.API_KEY || SMS_API_KEY || '').trim(); const isPlaceholder = !rawKey || rawKey.length < 8 || /your_|REPLACE|demo|test_key|placeholder|example/i.test(rawKey); const apiKey = isPlaceholder ? '' : rawKey; const enabled = typeof institutionSettings.smsEnabled === 'boolean' ? institutionSettings.smsEnabled : globalEnabled; return { institution, provider, apiUrl, apiKey, enabled };
};
export const buildCredentialSmsMessage = ({ loginUrl = frontendOriginFromEnv() ? `${frontendOriginFromEnv()}/login` : `https://www.${rootDomainFromEnv()}/login`, summary, username, password, parentUsername, parentPassword }: CredentialSmsOptions) => {
  const title = asciiOnly(summary).replace(/account created|created|for/gi, '').trim().slice(0, 18) || 'Account';
  let msg = `ES ${title}: U:${asciiOnly(username)} P:${asciiOnly(password)} Login:${compactUrl(loginUrl)}`;
  if (parentUsername) msg += ` PU:${asciiOnly(parentUsername)} PP:${asciiOnly(parentPassword || 'N/A')}`;
  return oneCreditMessage(msg);
};
const logSmsAttempt = async (options: SMSOptions, status: 'sent' | 'failed' | 'pending' | 'delivered', failureReason?: string, apiResponse?: string, countPerRecipient = 1) => {
  if (!options.institutionId) return;
  const phoneNumbers = recipientsFor(options.recipientPhone || options.to).map(normalizePhone).filter(Boolean); const names = options.recipientName ? recipientsFor(options.recipientName) : phoneNumbers; const { smsChargeRate, smsChargeAmount } = buildChargeMeta(options, countPerRecipient * (phoneNumbers.length || 1)); const provider = String(options.smsProvider || SMS_PROVIDER).toLowerCase();
  for (let i = 0; i < phoneNumbers.length; i += 1) { const phoneNumber = phoneNumbers[i]; try { await SmsLog.create({ institutionId: options.institutionId, phoneNumber, recipientPhone: phoneNumber, recipientName: String(names[i] || `Unknown (${phoneNumber})`), recipientId: options.recipientId, recipientType: options.recipientType || 'other', message: options.message, type: options.type || 'notification', purpose: options.purpose || options.type || 'notification', provider, unitCharge: smsChargeRate, chargeAmount: smsChargeAmount / Math.max(phoneNumbers.length, 1), status, studentId: options.studentId, parentId: options.parentId, sentAt: new Date(), failureReason, errorMessage: failureReason, apiResponse }); } catch (error) { console.error('Error logging SMS:', error); } }
};
const buildSmsLayerUrl = (smsConfig: Awaited<ReturnType<typeof resolveSmsConfig>>, phoneNumber: string, message: string) => { const url = new URL(smsConfig.apiUrl || 'https://anoncify.xyz/api/sms'); url.searchParams.set('key', smsConfig.apiKey); url.searchParams.set('number', phoneNumber); url.searchParams.set('msg', oneCreditMessage(message)); return url; };
const sendViaSmsLayer = async (rawOptions: SMSOptions): Promise<boolean> => {
  const options = await applyInstitutionBrandingToSms(rawOptions); const smsConfig = await resolveSmsConfig(options);
  if (!smsConfig.enabled) { await logSmsAttempt({ ...options, smsProvider: smsConfig.provider }, 'failed', 'SMS disabled for this institution', undefined, 1); return false; }
  if (smsConfig.provider !== 'anoncify' && smsConfig.provider !== 'smslayer') { await logSmsAttempt({ ...options, smsProvider: smsConfig.provider }, 'failed', `Unsupported SMS provider: ${smsConfig.provider}`); return false; }
  if (!smsConfig.apiKey) { await logSmsAttempt({ ...options, smsProvider: smsConfig.provider }, 'failed', 'SMS API key not configured or placeholder key used', undefined, 1); return false; }
  if (!(await ensureSmsQuota(options))) { await logSmsAttempt({ ...options, smsProvider: smsConfig.provider }, 'failed', 'SMS quota exceeded', undefined, 1); return false; }
  const recipients = recipientsFor(options.to).map(normalizePhone).filter(Boolean); let successCount = 0;
  for (let i = 0; i < recipients.length; i += 1) { const phoneNumber = recipients[i]; const segments = 1; const chargeResult = await recordSmsCharge(options.institutionId, segments, options.type, options.purpose); if (chargeResult && (chargeResult as any).insufficient) { await logSmsAttempt({ ...options, to: phoneNumber, recipientPhone: phoneNumber, smsProvider: smsConfig.provider }, 'failed', 'Insufficient SMS balance', undefined, segments); continue; } try { const url = buildSmsLayerUrl(smsConfig, phoneNumber, options.message); const response = await fetch(url.toString(), { method: 'GET' }); const responseText = await response.text(); const parsed = parseGatewayResponse(responseText); if (!response.ok || !parsed.ok) { try { const chargeMeta = buildChargeMeta(options, segments); await (await import('../services/billingService')).refundSmsCharge(options.institutionId, segments, chargeMeta.smsChargeAmount, options.type, options.purpose); } catch (refundError) { console.error('Failed to refund SMS charge after gateway failure:', refundError); } await logSmsAttempt({ ...options, to: phoneNumber, recipientPhone: phoneNumber, smsProvider: smsConfig.provider }, 'failed', `HTTP ${response.status}`, responseText, segments); } else { successCount += 1; await logSmsAttempt({ ...options, to: phoneNumber, recipientPhone: phoneNumber, smsProvider: smsConfig.provider }, 'sent', undefined, responseText, segments); } } catch (error) { try { const chargeMeta = buildChargeMeta(options, segments); await (await import('../services/billingService')).refundSmsCharge(options.institutionId, segments, chargeMeta.smsChargeAmount, options.type, options.purpose); } catch (e) { console.error('Failed to refund SMS charge after send error:', e); } await logSmsAttempt({ ...options, to: phoneNumber, recipientPhone: phoneNumber, smsProvider: smsConfig.provider }, 'failed', String(error), undefined, segments); } }
  return successCount === recipients.length;
};
export const sendSMS = async (rawOptions: SMSOptions): Promise<boolean> => { const options = await applyInstitutionBrandingToSms(rawOptions); const recipients = recipientsFor(options.to).map(normalizePhone).filter(Boolean); if (!recipients.length) { await logSmsAttempt(options, 'failed', 'No phone number found'); return false; } const smsConfig = await resolveSmsConfig({ ...options, to: recipients }); if (!smsConfig.enabled) { await logSmsAttempt({ ...options, to: recipients, recipientPhone: options.recipientPhone || recipients, smsProvider: smsConfig.provider }, 'failed', 'SMS disabled for this institution', undefined, 1); return false; } if (smsConfig.provider === 'anoncify' || smsConfig.provider === 'smslayer') return sendViaSmsLayer({ ...options, to: recipients, smsProvider: smsConfig.provider, smsApiUrl: smsConfig.apiUrl, smsApiKey: smsConfig.apiKey, smsEnabled: smsConfig.enabled }); await logSmsAttempt({ ...options, smsProvider: smsConfig.provider }, 'failed', `Unsupported SMS provider: ${smsConfig.provider}`); return false; };
export const sendBulkSMS = async (recipients: string[], message: string, institutionId?: any): Promise<boolean> => sendSMS({ to: recipients, message: oneCreditMessage(message), institutionId, type: 'notification', purpose: 'bulk' });
export const sendAttendanceReminderSMS = async (phoneNumber: string, studentName: string, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: oneCreditMessage(`Parent: ${asciiOnly(studentName)} absent today. Contact school if needed.`), institutionId, type: 'attendance', purpose: 'attendance_absent', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendAttendanceDailySMS = async (phoneNumber: string, studentName: string, status: 'present' | 'absent' | 'late' | 'leave', institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: oneCreditMessage(`Parent: ${asciiOnly(studentName)} marked ${status} today.`), institutionId, type: 'attendance', purpose: 'attendance_daily', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendResultSMS = async (phoneNumber: string, studentName: string, summary: string, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: oneCreditMessage(`Result ${asciiOnly(studentName)}: ${asciiOnly(summary)}`), institutionId, type: 'notification', purpose: 'result_published', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendFeeDueSMS = async (phoneNumber: string, studentName: string, dueAmount: number, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: oneCreditMessage(`Fee due ${asciiOnly(studentName)}: Tk ${dueAmount}. Please pay.`), institutionId, type: 'fee', purpose: 'fee_due', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendMonthlyParentSummarySMS = async (phoneNumber: string, studentName: string, message: string, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: oneCreditMessage(message), institutionId, type: 'monthly_parent', purpose: 'monthly_parent', recipientName: `Parent of ${studentName}`, recipientType: 'guardian' });
export const sendNotificationSMS = async (phoneNumber: string, message: string, institutionId?: any): Promise<boolean> => sendSMS({ to: phoneNumber, message: oneCreditMessage(message), institutionId, type: 'notification', purpose: 'notification' });
