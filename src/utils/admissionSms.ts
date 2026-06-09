import { buildCredentialSmsMessage, sendSMS } from './sms';

const normalizePhone = (value: any) => {
  const digits = String(value || '').replace(/\D/g, '').replace(/^88/, '');
  return digits && !digits.startsWith('0') ? `0${digits}` : digits;
};

const envApiKey = () => String(process.env.SMS_API_KEY || process.env.ANONCIFY_SMS_API_KEY || process.env.SMSLAYER_API_KEY || process.env.SMS_KEY || process.env.API_KEY || '').trim();
const envApiUrl = () => String(process.env.SMS_API_URL || 'https://anoncify.xyz/api/sms').trim();

async function sendDirect(to: string, message: string) {
  const phone = normalizePhone(to);
  const key = envApiKey();
  const endpoint = envApiUrl();
  if (!phone || !key || !endpoint || process.env.SMS_ENABLED === 'false') return false;
  try {
    const url = new URL(endpoint);
    url.searchParams.set('key', key);
    url.searchParams.set('number', phone);
    url.searchParams.set('msg', message);
    const res = await fetch(url.toString(), { method: 'GET' });
    const text = await res.text();
    return res.ok && !/error|fail|failed|invalid|unauthorized|insufficient/i.test(text);
  } catch {
    return false;
  }
}

export async function sendAdmissionCredentialSms(input: {
  to: string;
  studentName: string;
  guardianName?: string;
  username: string;
  password: string;
  parentUsername?: string;
  parentPassword?: string;
  institutionId?: any;
}) {
  const message = buildCredentialSmsMessage({
    summary: 'Admission accepted',
    username: input.username,
    password: input.password,
    parentUsername: input.parentUsername,
    parentPassword: input.parentPassword,
  });

  const normalSent = await sendSMS({
    to: input.to,
    message,
    institutionId: input.institutionId,
    recipientName: input.guardianName || input.studentName,
    recipientPhone: input.to,
    recipientType: 'guardian',
    type: 'credentials',
    purpose: 'admission_credentials',
  }).catch(() => false);

  if (normalSent) return { sent: true, fallback: false, message };
  const fallbackSent = await sendDirect(input.to, message);
  return { sent: fallbackSent, fallback: fallbackSent, message };
}
