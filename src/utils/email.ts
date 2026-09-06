/**
 * Email Service - Brevo HTTP API only.
 * Required production env vars: BREVO_API_KEY, EMAIL_FROM.
 */

import '../config/loadEnv';
import nodemailer from 'nodemailer';

let smtpTransporter: any = null;

export const getSmtpTransporter = () => {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);

  if (!host || !user || !pass) return null;

  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    });
  }
  return smtpTransporter;
};

interface EmailAttachment {
  filename: string;
  path?: string;
  content?: Buffer | string;
  contentType?: string;
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  from?: string;
}

interface EmailResult {
  success: boolean;
  error?: string;
  code?: string;
  hint?: string;
}

const configuredSender = () =>
  (process.env.EMAIL_FROM || process.env.BREVO_FROM_EMAIL || '').trim();

const isEmailEnabled = () =>
  String(process.env.EMAIL_ENABLED || '').toLowerCase() !== 'false';

const brevoBodyMentionsUnauthorizedIp = (body: string) => {
  const normalized = body.toLowerCase();
  return normalized.includes('ip') && (
    normalized.includes('unauthor') ||
    normalized.includes('not authorized') ||
    normalized.includes('not allowed') ||
    normalized.includes('whitelist') ||
    normalized.includes('allowlist')
  );
};

const classifyNetworkError = (err: any): EmailResult => {
  const msg = String(err?.message || err || '').toLowerCase();

  if (msg.includes('abort') || msg.includes('signal') || msg.includes('timeout') || msg.includes('etimedout')) {
    return {
      success: false,
      code: 'BREVO_NETWORK_TIMEOUT',
      error: 'Brevo API request timed out from the server.',
      hint: 'Check that outbound HTTPS port 443 is open and the production server public IP is authorized in Brevo SMTP & API settings.',
    };
  }

  if (msg.includes('econnrefused')) {
    return {
      success: false,
      code: 'BREVO_CONNECTION_REFUSED',
      error: 'Connection refused while connecting to Brevo API.',
      hint: 'Allow outbound HTTPS port 443 from the production server firewall.',
    };
  }

  if (msg.includes('enotfound') || msg.includes('getaddrinfo')) {
    return {
      success: false,
      code: 'BREVO_DNS_FAILED',
      error: 'DNS lookup failed for api.brevo.com.',
      hint: 'Check DNS settings on the production server.',
    };
  }

  if (msg.includes('econnreset') || msg.includes('socket hang up')) {
    return {
      success: false,
      code: 'BREVO_CONNECTION_RESET',
      error: 'Connection to Brevo was reset.',
      hint: 'The server IP may be blocked by Brevo or by a firewall. Add the server public IP to Brevo authorized IP addresses.',
    };
  }

  return {
    success: false,
    code: 'BREVO_NETWORK_ERROR',
    error: `Network error reaching Brevo: ${msg}.`,
    hint: 'Check server firewall rules, DNS, and Brevo authorized IP settings.',
  };
};

const classifyBrevoHttpError = (status: number, body: string): EmailResult => {
  const preview = body.length > 300 ? `${body.slice(0, 300)}...` : body;

  if (brevoBodyMentionsUnauthorizedIp(body)) {
    return {
      success: false,
      code: 'BREVO_IP_NOT_AUTHORIZED',
      error: 'Brevo rejected this production server IP address.',
      hint: 'Add the production server public IP in Brevo SMTP & API authorized IP addresses, then restart the backend with pm2 restart school-server --update-env.',
    };
  }

  switch (status) {
    case 400:
      return {
        success: false,
        code: 'BREVO_BAD_REQUEST',
        error: `Brevo rejected the email request. Details: ${preview}`,
        hint: `Check that sender "${configuredSender()}" is verified in Brevo and the recipient email is valid.`,
      };
    case 401:
      return {
        success: false,
        code: 'BREVO_API_KEY_INVALID',
        error: `Brevo API key is invalid, expired, or not allowed from this server. Details: ${preview}`,
        hint: 'Check BREVO_API_KEY in production .env, check Brevo authorized IP addresses, then restart backend with --update-env.',
      };
    case 403:
      return {
        success: false,
        code: 'BREVO_FORBIDDEN',
        error: `Brevo forbids sending. Details: ${preview}`,
        hint: 'Possible causes: sender email/domain is not verified, account is suspended, limit reached, or server IP is not authorized.',
      };
    case 429:
      return {
        success: false,
        code: 'BREVO_RATE_LIMIT',
        error: 'Brevo rate limit exceeded.',
        hint: 'Wait a few minutes and retry, or upgrade the Brevo plan.',
      };
    case 500:
    case 502:
    case 503:
    case 504:
      return {
        success: false,
        code: 'BREVO_SERVER_ERROR',
        error: `Brevo server error (${status}). Details: ${preview}`,
        hint: 'This is likely temporary on Brevo side. Retry in a few minutes.',
      };
    default:
      return {
        success: false,
        code: `BREVO_HTTP_${status}`,
        error: `Brevo API error ${status}: ${preview}`,
        hint: 'Check Brevo API key, authorized IPs, sender verification, and account status.',
      };
  }
};

const sendViaBrevoApi = async (options: EmailOptions): Promise<EmailResult> => {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const fromEmail = (options.from || configuredSender()).trim();
  const fromName = process.env.BREVO_FROM_NAME || process.env.FROM_NAME || 'EasySchool';

  if (!apiKey) {
    return {
      success: false,
      code: 'EMAIL_API_KEY_MISSING',
      error: 'BREVO_API_KEY is not set in environment variables.',
      hint: 'Add BREVO_API_KEY to the production .env and restart the backend with pm2 restart school-server --update-env.',
    };
  }

  if (!fromEmail) {
    return {
      success: false,
      code: 'EMAIL_FROM_MISSING',
      error: 'EMAIL_FROM sender address is not configured.',
      hint: 'Add EMAIL_FROM=verified-sender@example.com to production .env. The address must be verified in Brevo.',
    };
  }

  const toList = (Array.isArray(options.to) ? options.to : [options.to])
    .map((email) => String(email || '').trim())
    .filter(Boolean)
    .map((email) => ({ email }));

  if (!toList.length) {
    return {
      success: false,
      code: 'EMAIL_RECIPIENT_MISSING',
      error: 'No valid recipient email addresses provided.',
      hint: 'Make sure this user account has a real linked email address.',
    };
  }

  const body: Record<string, any> = {
    sender: { name: fromName, email: fromEmail },
    to: toList,
    subject: options.subject,
    htmlContent: options.html,
  };

  if (options.text) body.textContent = options.text;

  if (options.attachments?.length) {
    const encoded = options.attachments
      .filter((attachment) => attachment.content)
      .map((attachment) => ({
        name: attachment.filename,
        content: Buffer.isBuffer(attachment.content)
          ? attachment.content.toString('base64')
          : Buffer.from(String(attachment.content)).toString('base64'),
      }));
    if (encoded.length) body.attachment = encoded;
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let res: Response;
    try {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return classifyBrevoHttpError(res.status, errText);
    }

    return { success: true };
  } catch (err: any) {
    return classifyNetworkError(err);
  }
};

const sendViaSmtp = async (options: EmailOptions): Promise<EmailResult> => {
  const transporter = getSmtpTransporter();
  if (!transporter) {
    return {
      success: false,
      code: 'SMTP_CONFIG_MISSING',
      error: 'SMTP credentials missing or incomplete.',
    };
  }

  const from = (options.from || process.env.EMAIL_FROM || process.env.SMTP_USER || '').trim();
  const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;

  const mailOptions: any = {
    from,
    to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  };

  if (options.attachments?.length) {
    mailOptions.attachments = options.attachments.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      path: attachment.path,
      contentType: attachment.contentType,
    }));
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent via SMTP -> ${to} (MessageId: ${info.messageId})`);
    return { success: true };
  } catch (err: any) {
    console.error(`SMTP send failed -> ${to}:`, err.message || err);
    return {
      success: false,
      code: 'SMTP_SEND_FAILED',
      error: err.message || String(err),
    };
  }
};

export const sendEmailDetail = async (options: EmailOptions): Promise<EmailResult> => {
  try {
    const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    if (!isEmailEnabled()) {
      if (process.env.NODE_ENV === 'production') {
        return {
          success: false,
          code: 'EMAIL_DISABLED',
          error: 'Email service is disabled (EMAIL_ENABLED=false).',
          hint: 'Set EMAIL_ENABLED=true in production .env and restart the backend.',
        };
      }
      console.log(`[DEV] Email skipped (disabled). Would send to ${to}`);
      return { success: true };
    }

    // Prioritize SMTP if configured, else fallback to Brevo API
    const result = getSmtpTransporter()
      ? await sendViaSmtp(options)
      : await sendViaBrevoApi(options);

    if (result.success) {
      if (!getSmtpTransporter()) console.log(`Email sent via Brevo API -> ${to}`);
    } else {
      console.error(`Email delivery failed -> ${to}:`, {
        code: result.code,
        error: result.error,
        hint: result.hint,
      });
    }

    return result;
  } catch (error: any) {
    console.error('sendEmailDetail error:', error);
    return {
      success: false,
      code: 'EMAIL_INTERNAL_ERROR',
      error: error?.message || String(error),
      hint: 'Check backend logs for the full stack trace.',
    };
  }
};

export const sendEmail = async (options: EmailOptions): Promise<boolean> =>
  (await sendEmailDetail(options)).success;

export const sendBulkEmails = async (
  recipients: string[],
  subject: string,
  html: string
): Promise<boolean> => {
  try {
    if (!isEmailEnabled()) return process.env.NODE_ENV !== 'production';
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const results = await Promise.all(
        recipients.slice(i, i + batchSize).map((to) => sendEmail({ to, subject, html }))
      );
      if (results.some((result) => !result)) return false;
    }
    console.log(`Bulk email sent to ${recipients.length} recipients`);
    return true;
  } catch {
    return false;
  }
};

export const sendIdCardEmail = async (
  email: string,
  studentName: string,
  pdfPath: string
): Promise<boolean> =>
  sendEmail({
    to: email,
    subject: `Your School ID Card - ${studentName}`,
    html: `<h2>Your ID Card</h2><p>Dear ${studentName},</p><p>Your school ID card is attached.</p><p>EasySchool Team</p>`,
    attachments: [{ filename: `${studentName}_id_card.pdf`, path: pdfPath }],
  });

export const sendNotificationEmail = async (
  email: string,
  title: string,
  body: string
): Promise<boolean> =>
  sendEmail({ to: email, subject: title, html: `<h2>${title}</h2><p>${body}</p>`, text: body });

export const isEmailConfigured = (): boolean =>
  isEmailEnabled() &&
  (Boolean(getSmtpTransporter()) || (Boolean((process.env.BREVO_API_KEY || '').trim()) && Boolean(configuredSender())));

export const getEmailTransport = () => getSmtpTransporter();
