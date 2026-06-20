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

/**
 * Classifies a network-level fetch error into a human-readable message.
 * Covers: IP block, Droplet/VPS firewall, DNS failure, general connectivity.
 */
const classifyNetworkError = (err: any): string => {
  const msg = String(err?.message || err || '').toLowerCase();

  if (msg.includes('abort') || msg.includes('signal')) {
    return '⏱️ Brevo API request timed out (15 s). Possible causes: ' +
      'server IP is blocked by Brevo, Droplet outbound port 443 is firewalled, ' +
      'or api.brevo.com is unreachable from this host.';
  }
  if (msg.includes('econnrefused')) {
    return '🔌 Connection refused to Brevo API. Check if outbound HTTPS (port 443) ' +
      'is allowed on this Droplet / server.';
  }
  if (msg.includes('enotfound') || msg.includes('getaddrinfo')) {
    return '🌐 DNS lookup failed for api.brevo.com. The server cannot resolve the ' +
      'hostname — check DNS settings on the Droplet.';
  }
  if (msg.includes('econnreset') || msg.includes('socket hang up')) {
    return '📡 Connection to Brevo was reset mid-request. This often means the ' +
      'outbound IP is blocked by Brevo or by the Droplet firewall.';
  }
  if (msg.includes('etimedout') || msg.includes('timeout')) {
    return '⏳ Network timeout connecting to Brevo. Verify outbound port 443 is ' +
      'open on the Droplet and the IP is not blacklisted.';
  }
  return `🚫 Network error reaching Brevo: ${msg}. ` +
    'Check Droplet firewall rules and whether the server IP is whitelisted in Brevo.';
};

/**
 * Maps Brevo HTTP status codes to clear, actionable messages.
 */
const classifyBrevoHttpError = (status: number, body: string): string => {
  const preview = body.length > 300 ? body.slice(0, 300) + '...' : body;
  switch (status) {
    case 400:
      return `❌ Brevo rejected the request (400 Bad Request). Check: sender email "${String(process.env.EMAIL_FROM || '').trim()}" is a verified sender in Brevo, recipient address format is valid. Details: ${preview}`;
    case 401:
      return `🔑 Brevo API key is invalid or expired (401 Unauthorized). ` +
        'Update BREVO_API_KEY in .env and restart the server. ' +
        `Key in use starts with: ${(process.env.BREVO_API_KEY || '').slice(0, 10)}...`;
    case 403:
      return `🚫 Brevo forbids sending (403 Forbidden). Possible causes: ` +
        'sender domain is not verified, account is suspended, or daily/monthly limit reached. ' +
        `Details: ${preview}`;
    case 429:
      return `🚦 Brevo rate limit exceeded (429 Too Many Requests). Wait a few minutes and retry, ` +
        'or upgrade the Brevo plan for higher sending limits.';
    case 500:
    case 502:
    case 503:
    case 504:
      return `🔴 Brevo server error (${status}). This is on Brevo's side — retry in a few minutes. ` +
        `Details: ${preview}`;
    default:
      return `Brevo API error ${status}: ${preview}`;
  }
};

const sendViaBrevoApi = async (
  options: EmailOptions
): Promise<{ success: boolean; error?: string }> => {
  const apiKey    = (process.env.BREVO_API_KEY || '').trim();
  const fromEmail = (options.from || process.env.EMAIL_FROM || process.env.BREVO_FROM_EMAIL || '').trim();
  const fromName  = process.env.BREVO_FROM_NAME || 'EasySchool';

  // ── Pre-flight env checks ────────────────────────────────────────────────
  if (!apiKey) {
    return {
      success: false,
      error: '🔑 BREVO_API_KEY is not set in environment variables. ' +
        'Add BREVO_API_KEY=<your-key> to .env and restart the server.',
    };
  }
  if (!fromEmail) {
    return {
      success: false,
      error: '📧 EMAIL_FROM (sender address) is not configured. ' +
        'Add EMAIL_FROM=your@email.com to .env. ' +
        'The email must be a verified sender in your Brevo account.',
    };
  }

  const toList = (Array.isArray(options.to) ? options.to : [options.to])
    .filter(Boolean).map((email) => ({ email }));

  if (!toList.length) {
    return { success: false, error: '📭 No valid recipient email addresses provided.' };
  }

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

  // ── Send request ─────────────────────────────────────────────────────────
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
      const errText = await res.text().catch(() => res.statusText);
      const friendly = classifyBrevoHttpError(res.status, errText);
      return { success: false, error: friendly };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: classifyNetworkError(err) };
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
