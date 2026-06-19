/**
 * Email Service Utility
 * Priority 1: Brevo HTTP API  (if BREVO_API_KEY is set and valid)
 * Priority 2: SMTP            (if SMTP_HOST + SMTP_USER + SMTP_PASS are set)
 *             Tries configured port, then Gmail ports 587 / 465 automatically.
 */

import nodemailer from 'nodemailer';

// ─── Interfaces ─────────────────────────────────────────────────────────────

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

// ─── Brevo HTTP API ──────────────────────────────────────────────────────────

const sendViaBrevoApi = async (
  options: EmailOptions
): Promise<{ success: boolean; error?: string }> => {
  const apiKey    = process.env.BREVO_API_KEY || '';
  const fromEmail = options.from || process.env.EMAIL_FROM || process.env.BREVO_FROM_EMAIL || '';
  const fromName  = process.env.BREVO_FROM_NAME || process.env.APP_NAME || 'EasySchool';

  if (!apiKey)    return { success: false, error: 'BREVO_API_KEY not set' };
  if (!fromEmail) return { success: false, error: 'EMAIL_FROM not set' };

  const toList = (Array.isArray(options.to) ? options.to : [options.to])
    .filter(Boolean)
    .map((email) => ({ email }));

  const body: Record<string, any> = {
    sender:      { name: fromName, email: fromEmail },
    to:          toList,
    subject:     options.subject,
    htmlContent: options.html,
  };
  if (options.text) body.textContent = options.text;

  if (options.attachments && options.attachments.length > 0) {
    const encoded = options.attachments
      .filter((a) => a.content)
      .map((a) => ({
        name:    a.filename,
        content: Buffer.isBuffer(a.content)
          ? a.content.toString('base64')
          : Buffer.from(String(a.content)).toString('base64'),
      }));
    if (encoded.length > 0) body.attachment = encoded;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept':       'application/json',
          'api-key':      apiKey,
          'content-type': 'application/json',
        },
        body:   JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      return { success: false, error: `Brevo API error ${res.status}: ${errText}` };
    }
    return { success: true };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return { success: false, error: msg.includes('abort') ? 'Brevo API timed out' : msg };
  }
};

// ─── SMTP (nodemailer) ───────────────────────────────────────────────────────

const sendViaSmtp = async (
  options: EmailOptions
): Promise<{ success: boolean; error?: string }> => {
  const smtpHost = process.env.SMTP_HOST || '';
  const smtpUser = process.env.SMTP_USER || process.env.BREVO_SMTP_USER || process.env.EMAIL_USER || '';
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';
  const fromEmail = options.from || process.env.EMAIL_FROM || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass) {
    return { success: false, error: 'SMTP not configured (need SMTP_HOST, SMTP_USER, SMTP_PASS)' };
  }

  // Try configured port first, then known-good Gmail ports
  const configuredPort = Number(process.env.SMTP_PORT || 587);
  const portsToTry = [...new Set([configuredPort, 587, 465])];

  let lastError = '';
  for (const port of portsToTry) {
    try {
      const transporter = nodemailer.createTransport({
        host:   smtpHost,
        port,
        secure: port === 465,
        auth:   { user: smtpUser, pass: smtpPass },
        connectionTimeout: 10000,
        socketTimeout:     12000,
        greetingTimeout:   8000,
      });

      await transporter.sendMail({
        from:        fromEmail,
        to:          options.to,
        subject:     options.subject,
        html:        options.html,
        text:        options.text,
        attachments: options.attachments,
      });

      console.log(`📧 Email sent via SMTP (${smtpHost}:${port}) to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
      return { success: true };
    } catch (err: any) {
      lastError = err?.message || String(err);
      console.warn(`⚠️ SMTP port ${port} failed:`, lastError);
    }
  }

  return { success: false, error: `SMTP all ports failed. Last error: ${lastError}` };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isEmailEnabled = () =>
  String(process.env.EMAIL_ENABLED || '').toLowerCase() !== 'false';

const hasBrevoKey = () => Boolean(process.env.BREVO_API_KEY);

const hasSmtpConfig = () =>
  Boolean(process.env.SMTP_HOST) &&
  Boolean(process.env.SMTP_USER || process.env.BREVO_SMTP_USER || process.env.EMAIL_USER) &&
  Boolean(process.env.SMTP_PASS || process.env.EMAIL_PASS);

// ─── Core send functions ──────────────────────────────────────────────────────

export const sendEmailDetail = async (
  options: EmailOptions
): Promise<{ success: boolean; error?: string }> => {
  try {
    const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    if (!isEmailEnabled()) {
      const msg = 'Email disabled (EMAIL_ENABLED=false)';
      if (process.env.NODE_ENV === 'production') return { success: false, error: msg };
      console.log(msg);
      return { success: true };
    }

    // ── Priority 1: Brevo HTTP API ────────────────────────────────────────────
    if (hasBrevoKey()) {
      const result = await sendViaBrevoApi(options);
      if (result.success) {
        console.log(`📧 Email sent via Brevo API to ${recipients}`);
        return result;
      }
      // Only fall through if auth error (key invalid) — hard errors return immediately
      const isAuthError = result.error &&
        (result.error.includes('401') || result.error.includes('unauthorized') ||
         result.error.includes('Key not found') || result.error.includes('not set'));
      if (!isAuthError) {
        console.error(`❌ Brevo API failed for ${recipients}:`, result.error);
        return result;
      }
      console.warn('⚠️ Brevo API key invalid, trying SMTP fallback:', result.error);
    }

    // ── Priority 2: SMTP ──────────────────────────────────────────────────────
    if (hasSmtpConfig()) {
      const result = await sendViaSmtp(options);
      if (result.success) return result;
      console.error(`❌ SMTP also failed for ${recipients}:`, result.error);
      return result;
    }

    // ── No provider configured ────────────────────────────────────────────────
    const msg = 'No email provider configured. Set BREVO_API_KEY or SMTP_HOST+SMTP_USER+SMTP_PASS.';
    if (process.env.NODE_ENV === 'production') {
      console.error(msg);
      return { success: false, error: msg };
    }
    console.log(`[DEV] Would send email to ${recipients}`);
    return { success: true };

  } catch (error: any) {
    console.error('❌ sendEmailDetail error:', error);
    return { success: false, error: error?.message || String(error) };
  }
};

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  const result = await sendEmailDetail(options);
  return result.success;
};

export const sendBulkEmails = async (
  recipients: string[],
  subject: string,
  html: string
): Promise<boolean> => {
  try {
    if (!isEmailEnabled() || (!hasBrevoKey() && !hasSmtpConfig())) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[DEV] Bulk email skipped. Would send to ${recipients.length} recipients.`);
        return true;
      }
      return false;
    }

    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((email) => sendEmail({ to: email, subject, html }))
      );
      if (results.some((r) => !r)) return false;
    }
    console.log(`📧 Bulk emails sent to ${recipients.length} recipients`);
    return true;
  } catch (error) {
    console.error('❌ Bulk email error:', error);
    return false;
  }
};

export const sendIdCardEmail = async (
  email: string,
  studentName: string,
  pdfPath: string
): Promise<boolean> => {
  const html = `
    <h2>Your ID Card</h2>
    <p>Dear ${studentName},</p>
    <p>Your school ID card has been generated and is attached to this email.</p>
    <p>Please keep it safe and bring it to school every day.</p>
    <p>Best regards,<br>EasySchool Team</p>
  `;
  return sendEmail({
    to:          email,
    subject:     `Your School ID Card - ${studentName}`,
    html,
    attachments: [{ filename: `${studentName}_id_card.pdf`, path: pdfPath }],
  });
};

export const sendNotificationEmail = async (
  email: string,
  title: string,
  body: string
): Promise<boolean> => {
  const html = `<h2>${title}</h2><p>${body}</p><p>---<br>EasySchool System</p>`;
  return sendEmail({ to: email, subject: title, html, text: body });
};

export const isEmailConfigured = (): boolean =>
  isEmailEnabled() && (hasBrevoKey() || hasSmtpConfig());

// Legacy export — kept for backward compat
export const getEmailTransport = () => null;
