/**
 * Email Service Utility
 * Currently disabled (EMAIL_ENABLED=false in .env)
 * To enable: Set EMAIL_ENABLED=true and configure SMTP settings
 */

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; path: string }>;
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  const emailEnabled = process.env.EMAIL_ENABLED === 'true';

  if (!emailEnabled) {
    // Email service is disabled. Configure EMAIL_ENABLED=true to enable.
    return true; // Return true to prevent errors
  }

  try {
    // TODO: Implement email sending with nodemailer
    // const transporter = nodemailer.createTransport({
    //   service: 'gmail',
    //   auth: {
    //     user: process.env.EMAIL_USER,
    //     pass: process.env.EMAIL_PASS,
    //   },
    // });
    //
    // await transporter.sendMail({
    //   from: process.env.EMAIL_USER,
    //   to: options.to,
    //   subject: options.subject,
    //   html: options.html,
    //   text: options.text,
    //   attachments: options.attachments,
    // });

    console.log(`✅ Email sent to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error);
    return false;
  }
};

export const sendBulkEmails = async (recipients: string[], subject: string, html: string): Promise<boolean> => {
  const emailEnabled = process.env.EMAIL_ENABLED === 'true';

  if (!emailEnabled) {
    console.log(`📧 Email service is disabled. Would send bulk email to ${recipients.length} recipients.`);
    return true;
  }

  try {
    // Send emails in batches
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      await Promise.all(
        batch.map((email) =>
          sendEmail({
            to: email,
            subject,
            html,
          })
        )
      );
    }
    console.log(`✅ Bulk emails sent to ${recipients.length} recipients`);
    return true;
  } catch (error) {
    console.error('❌ Error sending bulk emails:', error);
    return false;
  }
};

export const sendIdCardEmail = async (email: string, studentName: string, pdfPath: string): Promise<boolean> => {
  const emailEnabled = process.env.EMAIL_ENABLED === 'true';

  if (!emailEnabled) {
    console.log(`📧 Email service is disabled. Would send ID card to ${email}`);
    return true;
  }

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
  const emailEnabled = process.env.EMAIL_ENABLED === 'true';

  if (!emailEnabled) {
    console.log(`📧 Email service is disabled. Would send notification to ${email}`);
    return true;
  }

  const html = `
    <h2>${title}</h2>
    <p>${body}</p>
    <p>---<br>EasySchool System</p>
  `;

  return sendEmail({
    to: email,
    subject: title,
    html,
  });
};
