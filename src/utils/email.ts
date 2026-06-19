/**
 * Email Service — Brevo HTTP API only (no SMTP)
 * Required env vars: BREVO_API_KEY, EMAIL_FROM
 */

// ─── Interfaces ──────────────────────────────────────────────────────────────

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
  const apiKey    = (process.env.BREVO_API_KEY || '').trim();
  const fromEmail = (options.from || process.env.EMAIL_FROM || process.env.BREVO_FROM_EMAIL || '').trim();
  const fromName  = process.env.BREVO_FROM_NAME || 'EasySchool';

  if (!apiKey)    return { success: false, error: 'BREVO_API_KEY not set' };
  if (!fromEmail) return { success: false, error: 'EMAIL_FROM not set' };

  const toList = (Array.isArray(options.to) ? options.to : [options.to])
    .filter(Boolean).map((email) => ({ email }));

  const body: Record<string, any> = {
    sender:      { name: fromName, email: fromEmail },
    to:          toList,
    subject:     options.subject,
    htmlContent: options.html,
  };
  if (options.text) body.textContent = options.text;

  if (options.attachments?.length) {
    const encoded = options.attachments
      .filter((a) => a.content)
      .map((a) => ({
        name:    a.filename,
        content: Buffer.isBuffer(a.content)
          ? a.content.toString('base64')
          : Buffer.from(String(a.content)).toString('base64'),
      }));
    if (encoded.length) body.attachment = encoded;
  }

  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let res: Response;
    try {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method:  'POST',
        headers: {
          'accept':       'application/json',
          'api-key':      apiKey,
          'content-type': 'application/json',
        },
        body:   JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      return { success: false, error: `Brevo API error ${res.status}: ${err}` };
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

// ─── Public API ──────────────────────────────────────────────────────────────

export const sendEmailDetail = async (
  options: EmailOptions
): Promise<{ success: boolean; error?: string }> => {
  try {
    const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    if (!isEmailEnabled()) {
      if (process.env.NODE_ENV === 'production')
        return { success: false, error: 'Email service is disabled (EMAIL_ENABLED=false)' };
      console.log(`[DEV] Email skipped (disabled). Would send to ${to}`);
      return { success: true };
    }

    const result = await sendViaBrevoApi(options);

    if (result.success) console.log(`📧 Email sent via Brevo API → ${to}`);
    else                console.error(`❌ Brevo API failed → ${to}:`, result.error);

    return result;
  } catch (error: any) {
    console.error('❌ sendEmailDetail error:', error);
    return { success: false, error: error?.message || String(error) };
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
      if (results.some((r) => !r)) return false;
    }
    console.log(`📧 Bulk email sent to ${recipients.length} recipients`);
    return true;
  } catch { return false; }
};

export const sendIdCardEmail = async (
  email: string,
  studentName: string,
  pdfPath: string
): Promise<boolean> =>
  sendEmail({
    to:          email,
    subject:     `Your School ID Card - ${studentName}`,
    html:        `<h2>Your ID Card</h2><p>Dear ${studentName},</p><p>Your school ID card is attached.</p><p>EasySchool Team</p>`,
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
  Boolean((process.env.BREVO_API_KEY || '').trim()) &&
  Boolean((process.env.EMAIL_FROM || process.env.BREVO_FROM_EMAIL || '').trim());

// Legacy compat — no SMTP
export const getEmailTransport = () => null;
