/**
 * Email Service Utility
 * Primary: Brevo (Sendinblue) HTTP API  — fastest, no SMTP handshake
 * Fallback: Brevo SMTP relay            — for attachment-heavy flows
 */

import nodemailer from 'nodemailer';

// ─── Interfaces ────────────────────────────────────────────────────────────────

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

interface EmailTransport {
  transporter: ReturnType<typeof nodemailer.createTransport>;
  from: string;
}

// ─── Brevo HTTP API (primary) ──────────────────────────────────────────────────

const sendViaBrevoApi = async (
  options: EmailOptions
): Promise<{ success: boolean; error?: string }> => {
  const apiKey   = process.env.BREVO_API_KEY || '';
  const fromEmail = options.from || process.env.EMAIL_FROM || process.env.BREVO_FROM_EMAIL || '';
  const fromName  = process.env.BREVO_FROM_NAME || process.env.APP_NAME || 'EasySchool';

  if (!apiKey)      return { success: false, error: 'BREVO_API_KEY not set' };
  if (!fromEmail)   return { success: false, error: 'EMAIL_FROM or BREVO_FROM_EMAIL not set' };

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

  // Encode attachments as base64 (Brevo API requires this)
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
    return { success: false, error: msg.includes('abort') ? 'Brevo API request timed out' : msg };
  }
};

// ─── Brevo SMTP transport (fallback / legacy) ──────────────────────────────────

export const getEmailTransport = (): EmailTransport | null => {
  const emailEnabled = String(process.env.EMAIL_ENABLED || '').toLowerCase() !== 'false';
  if (!emailEnabled) return null;

  const brevoApiKey   = process.env.BREVO_API_KEY   || '';
  const brevoSmtpUser = process.env.BREVO_SMTP_USER  || process.env.BREVO_FROM_EMAIL || process.env.EMAIL_FROM || '';

  // Brevo SMTP relay — uses the API key as the SMTP password
  if (brevoApiKey && brevoSmtpUser) {
    return {
      transporter: nodemailer.createTransport({
        host:  'smtp-relay.brevo.com',
        port:  587,
        secure: false,
        auth: { user: brevoSmtpUser, pass: brevoApiKey },
        connectionTimeout: 10000,
        socketTimeout:     10000,
        greetingTimeout:   10000,
      }),
      from: process.env.EMAIL_FROM || brevoSmtpUser,
    };
  }

  return null;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const isEmailEnabled = () =>
  String(process.env.EMAIL_ENABLED || '').toLowerCase() !== 'false';

const getDisabledMessage = (count: number, bulk = false) =>
  bulk
    ? `Email service not configured. Set BREVO_API_KEY + EMAIL_FROM before sending bulk email to ${count} recipients.`
    : `Email service not configured. Set BREVO_API_KEY + EMAIL_FROM before sending mail to ${count} recipient${count === 1 ? '' : 's'}.`;

// ─── Core send function ────────────────────────────────────────────────────────

export const sendEmailDetail = async (
  options: EmailOptions
): Promise<{ success: boolean; error?: string }> => {
  try {
    const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    if (!isEmailEnabled()) {
      const message = getDisabledMessage(Array.isArray(options.to) ? options.to.length : 1);
      if (process.env.NODE_ENV === 'production') {
        console.error(message);
        return { success: false, error: 'Email service disabled (EMAIL_ENABLED=false)' };
      }
      console.log(message);
      return { success: true };
    }

    // ── Priority 1: Brevo HTTP API ────────────────────────────────────────────
    if (process.env.BREVO_API_KEY) {
      const result = await sendViaBrevoApi(options);
      if (result.success) {
        console.log(`📧 Email sent via Brevo API to ${recipients}`);
        return result;
      }
      // If Brevo fails with 401 (unauthorized/key expired), fall through to SMTP
      const isAuthError = result.error && (result.error.includes('401') || result.error.includes('unauthorized') || result.error.includes('Key not found'));
      if (!isAuthError) {
        console.error('❌ Brevo API email failed:', result.error);
        return result;
      }
      console.warn('⚠️ Brevo API key invalid/expired, falling back to SMTP:', result.error);
    }

    // ── Priority 2: Brevo SMTP relay (fallback) ───────────────────────────────
    const transport = getEmailTransport();
    if (transport) {
      try {
        const from = options.from || process.env.EMAIL_FROM || transport.from;
        await transport.transporter.sendMail({
          from,
          to:          options.to,
          subject:     options.subject,
          html:        options.html,
          text:        options.text,
          attachments: options.attachments,
        });
        console.log(`📧 Email sent via Brevo SMTP to ${recipients}`);
        return { success: true };
      } catch (smtpErr: any) {
        console.warn('⚠️ Brevo SMTP failed, trying Gmail SMTP:', smtpErr?.message);
      }
    }

    // ── Priority 3: Gmail / generic SMTP (last resort) ────────────────────────
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    if (smtpHost && smtpUser && smtpPass) {
      try {
        const gmailTransporter = nodemailer.createTransport({
          host:   smtpHost,
          port:   smtpPort,
          secure: smtpPort === 465,
          auth:   { user: smtpUser, pass: smtpPass },
          connectionTimeout: 10000,
          socketTimeout:     15000,
        });
        const from = options.from || process.env.EMAIL_FROM || smtpUser;
        await gmailTransporter.sendMail({
          from,
          to:          options.to,
          subject:     options.subject,
          html:        options.html,
          text:        options.text,
          attachments: options.attachments,
        });
        console.log(`📧 Email sent via Gmail SMTP to ${recipients}`);
        return { success: true };
      } catch (gmailErr: any) {
        console.error('❌ Gmail SMTP also failed:', gmailErr?.message);
        return { success: false, error: `All email providers failed. Last error: ${gmailErr?.message}` };
      }
    }

    // No transport available
    const message = getDisabledMessage(Array.isArray(options.to) ? options.to.length : 1);
    if (process.env.NODE_ENV === 'production') {
      console.error(message);
      return { success: false, error: 'Email service not configured. Set BREVO_API_KEY or SMTP_HOST+SMTP_USER+SMTP_PASS.' };
    }
    console.log(message);
    console.log(`Email would be sent to ${recipients}`);
    return { success: true };

  } catch (error: any) {
    console.error('❌ Error sending email:', error);
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
    if (!isEmailEnabled()) {
      const message = getDisabledMessage(recipients.length, true);
      if (process.env.NODE_ENV === 'production') {
        console.error(message);
        return false;
      }
      console.log(message);
      return true;
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
    console.error('❌ Error sending bulk emails:', error);
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
  const html = `
    <h2>${title}</h2>
    <p>${body}</p>
    <p>---<br>EasySchool System</p>
  `;
  return sendEmail({ to: email, subject: title, html, text: body });
};

export const isEmailConfigured = (): boolean => {
  if (!isEmailEnabled()) return false;
  return Boolean(process.env.BREVO_API_KEY) || getEmailTransport() !== null;
};
