/**
 * Email Service Utility
 * Only: Brevo (Sendinblue) HTTP API — no SMTP
 * Set BREVO_API_KEY + EMAIL_FROM in .env to enable.
 */

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

  if (!apiKey)    return { success: false, error: 'BREVO_API_KEY not set in environment.' };
  if (!fromEmail) return { success: false, error: 'EMAIL_FROM not set in environment.' };

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

  // Encode attachments as base64 (Brevo API requirement)
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isEmailEnabled = () =>
  String(process.env.EMAIL_ENABLED || '').toLowerCase() !== 'false';

// ─── Core send functions ──────────────────────────────────────────────────────

export const sendEmailDetail = async (
  options: EmailOptions
): Promise<{ success: boolean; error?: string }> => {
  try {
    const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    if (!isEmailEnabled()) {
      const msg = `Email disabled (EMAIL_ENABLED=false). Would send to ${recipients}.`;
      if (process.env.NODE_ENV === 'production') {
        console.error(msg);
        return { success: false, error: 'Email service disabled.' };
      }
      console.log(msg);
      return { success: true };
    }

    if (!process.env.BREVO_API_KEY) {
      const msg = `BREVO_API_KEY not set. Cannot send email to ${recipients}.`;
      if (process.env.NODE_ENV === 'production') {
        console.error(msg);
        return { success: false, error: 'BREVO_API_KEY is not configured.' };
      }
      console.log(msg);
      return { success: true };
    }

    const result = await sendViaBrevoApi(options);

    if (result.success) {
      console.log(`📧 Email sent via Brevo API to ${recipients}`);
    } else {
      console.error(`❌ Brevo API failed for ${recipients}:`, result.error);
    }

    return result;
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
    if (!isEmailEnabled() || !process.env.BREVO_API_KEY) {
      console.log(`Bulk email skipped (not configured). Would send to ${recipients.length} recipients.`);
      return process.env.NODE_ENV !== 'production';
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
  isEmailEnabled() && Boolean(process.env.BREVO_API_KEY) && Boolean(process.env.EMAIL_FROM || process.env.BREVO_FROM_EMAIL);

// Legacy export — kept for backward compat, returns null (no SMTP)
export const getEmailTransport = () => null;
