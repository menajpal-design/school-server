import nodemailer from 'nodemailer';

// Initialize transporter using Heroku SendGrid addon or SMTP
// When Heroku SendGrid addon is added, it sets SENDGRID_USERNAME and SENDGRID_PASSWORD env vars
// Or use standard SMTP config from env vars

const getTransporter = () => {
  // Option 1: Heroku SendGrid addon
  if (process.env.SENDGRID_USERNAME && process.env.SENDGRID_PASSWORD) {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SENDGRID_USERNAME,
        pass: process.env.SENDGRID_PASSWORD,
      },
    });
  }

  // Option 2: Standard SMTP (for local/alternative setup)
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Option 3: Development fallback (console transport)
  console.warn('⚠️ No SMTP configured. Using test/console transport.');
  return nodemailer.createTransport({
    jsonTransport: true,
  });
};

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  try {
    const transporter = await getTransporter();
    const mailOptions = {
      from: options.from || process.env.EMAIL_FROM || 'noreply@school-system.com',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || '',
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('📧 Email sent:', (info as any).messageId || 'sent');
    return true;
  } catch (error) {
    console.error('❌ Email send error:', error);
    return false;
  }
};

export const sendNotificationEmail = async (
  toEmail: string,
  userName: string,
  subject: string,
  message: string
): Promise<boolean> => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px;">
        <h2 style="color: #333;">নমস্কার ${userName},</h2>
        <h3 style="color: #666;">${subject}</h3>
        <p style="color: #555; line-height: 1.6;">${message}</p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">এটি একটি স্বয়ংক্রিয় বার্তা। অনুগ্রহ করে এটিতে সরাসরি উত্তর দেবেন না।</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: toEmail,
    subject,
    html,
  });
};
