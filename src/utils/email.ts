/**
 * Email Service Utility
 * Sends mail through SendGrid or SMTP when credentials are configured.
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
  from?: string;
}

interface EmailTransport {
  transporter: ReturnType<typeof nodemailer.createTransport>;
  from: string;
}

const getEmailTransport = (): EmailTransport | null => {
  const sendgridUser = process.env.SENDGRID_USERNAME || '';
  const sendgridPass = process.env.SENDGRID_PASSWORD || '';
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER || '';
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || '';

  if (sendgridUser && sendgridPass) {
    return {
      transporter: nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: { user: sendgridUser, pass: sendgridPass },
      }),
      from: process.env.EMAIL_FROM || sendgridUser,
    };
  }

  if (smtpUser && smtpPass) {
    const port = Number(process.env.SMTP_PORT || 587);
    return {
      transporter: nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure: port === 465,
        auth: { user: smtpUser, pass: smtpPass },
      }),
      from: process.env.EMAIL_FROM || smtpUser,
    };
  }

  return null;
};

const getDisabledMessage = (count: number, bulk = false) =>
  bulk
    ? `Email service is not configured. Configure SENDGRID_USERNAME/SENDGRID_PASSWORD or SMTP_USER/SMTP_PASS before sending bulk email to ${count} recipients.`
    : `Email service is not configured. Configure SENDGRID_USERNAME/SENDGRID_PASSWORD or SMTP_USER/SMTP_PASS before sending mail to ${count} recipient${count === 1 ? '' : 's'}.`;

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    const transport = getEmailTransport();
    const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;

    if (!transport) {
      const message = getDisabledMessage(Array.isArray(options.to) ? options.to.length : 1);
      if (process.env.NODE_ENV === 'production') {
        console.error(message);
        return false;
      }

      console.log(message);
      console.log(`Email would be sent to ${recipients}`);
      return true;
    }

    const from = options.from || process.env.EMAIL_FROM || transport.from;
    if (!from) {
      console.error('EMAIL_FROM or SMTP/SendGrid user is required to send mail');
      return false;
    }

    await transport.transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments,
    });

    console.log(`Email sent to ${recipients}`);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

export const sendBulkEmails = async (recipients: string[], subject: string, html: string): Promise<boolean> => {
  try {
    const transport = getEmailTransport();

    if (!transport) {
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
      const results = await Promise.all(batch.map((email) => sendEmail({ to: email, subject, html })));
      if (results.some((result) => !result)) {
        return false;
      }
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
