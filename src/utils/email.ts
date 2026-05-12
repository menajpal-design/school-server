/**
 * Email Service Utility
 * Sends mail through SMTP when EMAIL_ENABLED=true.
 */

import nodemailer from 'nodemailer';

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
}

const getSmtpConfig = () => {
  const user = process.env.SMTP_USER || process.env.EMAIL_USER || '';
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';

  return {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_PORT || '587') === '465',
    auth: user && pass ? { user, pass } : undefined,
    from: process.env.EMAIL_FROM || user,
  };
};

const createTransporter = () => {
  const config = getSmtpConfig();
  if (!config.auth) {
    throw new Error('SMTP_USER/SMTP_PASS are required when EMAIL_ENABLED=true');
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });
};

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  const emailEnabled = process.env.EMAIL_ENABLED === 'true';

  if (!emailEnabled) {
    console.log(`Email service disabled. Would send email to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    return true;
  }

  try {
    const config = getSmtpConfig();
    const transporter = createTransporter();
    await transporter.sendMail({
      from: config.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    });

    console.log(`Email sent to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

export const sendBulkEmails = async (recipients: string[], subject: string, html: string): Promise<boolean> => {
  const emailEnabled = process.env.EMAIL_ENABLED === 'true';

  if (!emailEnabled) {
    console.log(`Email service disabled. Would send bulk email to ${recipients.length} recipients.`);
    return true;
  }

  try {
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      await Promise.all(batch.map((email) => sendEmail({ to: email, subject, html })));
    }
    console.log(`Bulk emails sent to ${recipients.length} recipients`);
    return true;
  } catch (error) {
    console.error('Error sending bulk emails:', error);
    return false;
  }
};

export const sendIdCardEmail = async (email: string, studentName: string, pdfPath: string): Promise<boolean> => {
  const html = `
    <h2>Your ID Card</h2>
    <p>Dear ${studentName},</p>
    <p>Your school ID card has been generated and is attached to this email.</p>
    <p>Please keep it safe and bring it to school every day.</p>
    <p>Best regards,<br>EasySchool Team</p>
  `;

  return sendEmail({
    to: email,
    subject: `Your School ID Card - ${studentName}`,
    html,
    attachments: [{ filename: `${studentName}_id_card.pdf`, path: pdfPath }],
  });
};

export const sendNotificationEmail = async (email: string, title: string, body: string): Promise<boolean> => {
  const html = `
    <h2>${title}</h2>
    <p>${body}</p>
    <p>---<br>EasySchool System</p>
  `;

  return sendEmail({
    to: email,
    subject: title,
    html,
    text: body,
  });
};
