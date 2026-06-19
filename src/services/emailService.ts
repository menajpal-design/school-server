/**
 * emailService.ts — thin wrapper around email.ts
 * Uses Brevo API when BREVO_API_KEY is configured.
 */
import { sendEmail, sendNotificationEmail as sendNotifEmail } from '../utils/email';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export { sendEmail };

export const sendEmailService = async (options: EmailOptions): Promise<boolean> => {
  return sendEmail(options);
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

  return sendEmail({ to: toEmail, subject, html });
};
