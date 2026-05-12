/**
 * SMS Service Utility
 * Uses the configured provider when SMS_ENABLED=true.
 * Default provider: Anoncify SMS gateway.
 */

interface SMSOptions {
  to: string | string[];
  message: string;
}

const SMS_PROVIDER = (process.env.SMS_PROVIDER || 'anoncify').toLowerCase();
const SMS_API_URL = process.env.SMS_API_URL || 'https://anoncify.xyz/api/sms';
const SMS_API_KEY = process.env.SMS_API_KEY || process.env.ANONCIFY_SMS_API_KEY || '';

const isFailureResponse = (text: string): boolean => /error|fail|invalid/i.test(text);

const sendViaAnoncify = async (options: SMSOptions): Promise<boolean> => {
  if (!SMS_API_KEY) {
    console.error('❌ SMS_API_KEY is required for Anoncify SMS delivery');
    return false;
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  try {
    for (const phoneNumber of recipients) {
      const url = new URL(SMS_API_URL);
      url.searchParams.set('key', SMS_API_KEY);
      url.searchParams.set('number', phoneNumber);
      url.searchParams.set('msg', options.message);

      const response = await fetch(url.toString(), { method: 'GET' });
      const responseText = await response.text();
      if (!response.ok || isFailureResponse(responseText)) {
        console.error(`❌ SMS send failed for ${phoneNumber}: ${response.status} ${responseText}`);
        return false;
      }
    }

    console.log(`✅ SMS sent to ${recipients.join(', ')}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending SMS via Anoncify:', error);
    return false;
  }
};

export const sendSMS = async (options: SMSOptions): Promise<boolean> => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';

  if (!smsEnabled) {
    console.log(`📱 SMS service is disabled. Would send SMS to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    return true;
  }

  if (SMS_PROVIDER === 'anoncify') {
    return sendViaAnoncify(options);
  }

  console.error(`❌ Unsupported SMS provider: ${SMS_PROVIDER}`);
  return false;
};

export const sendBulkSMS = async (recipients: string[], message: string): Promise<boolean> => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';

  if (!smsEnabled) {
    console.log(`📱 SMS service is disabled. Would send bulk SMS to ${recipients.length} recipients.`);
    return true;
  }

  try {
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      await Promise.all(
        batch.map((phone) =>
          sendSMS({
            to: phone,
            message,
          })
        )
      );
    }
    console.log(`✅ Bulk SMS sent to ${recipients.length} recipients`);
    return true;
  } catch (error) {
    console.error('❌ Error sending bulk SMS:', error);
    return false;
  }
};

export const sendAttendanceReminderSMS = async (phoneNumber: string, studentName: string): Promise<boolean> => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';

  if (!smsEnabled) {
    console.log(`📱 SMS service is disabled. Would send attendance reminder to ${phoneNumber}`);
    return true;
  }

  const message = `Dear Parent, ${studentName} was marked absent today. Please contact the school if this is an error.`;
  return sendSMS({ to: phoneNumber, message });
};

export const sendFeeDueSMS = async (phoneNumber: string, studentName: string, dueAmount: number): Promise<boolean> => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';

  if (!smsEnabled) {
    console.log(`📱 SMS service is disabled. Would send fee reminder to ${phoneNumber}`);
    return true;
  }

  const message = `Dear Parent, fee of ${dueAmount} is due for ${studentName}. Please pay within 7 days.`;
  return sendSMS({ to: phoneNumber, message });
};

export const sendNotificationSMS = async (phoneNumber: string, message: string): Promise<boolean> => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';

  if (!smsEnabled) {
    console.log(`📱 SMS service is disabled. Would send notification to ${phoneNumber}`);
    return true;
  }

  const truncatedMessage = message.substring(0, 160);
  return sendSMS({ to: phoneNumber, message: truncatedMessage });
};
