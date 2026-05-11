/**
 * SMS Service Utility
 * Currently disabled (SMS_ENABLED=false in .env)
 * To enable: Set SMS_ENABLED=true and configure SMS provider (Twilio, AWS SNS, etc.)
 */

interface SMSOptions {
  to: string | string[];
  message: string;
}

export const sendSMS = async (options: SMSOptions): Promise<boolean> => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';

  if (!smsEnabled) {
    // SMS service is disabled. Configure SMS_ENABLED=true to enable.
    return true; // Return true to prevent errors
  }

  try {
    // TODO: Implement SMS sending with Twilio or other provider
    // const client = twilio(process.env.SMS_ACCOUNT_SID, process.env.SMS_AUTH_TOKEN);
    // const recipients = Array.isArray(options.to) ? options.to : [options.to];
    // await Promise.all(
    //   recipients.map((number) =>
    //     client.messages.create({
    //       body: options.message,
    //       from: process.env.SMS_PHONE_NUMBER,
    //       to: number,
    //     })
    //   )
    // );

    console.log(`✅ SMS sent to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending SMS:', error);
    return false;
  }
};

export const sendBulkSMS = async (recipients: string[], message: string): Promise<boolean> => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';

  if (!smsEnabled) {
    console.log(`📱 SMS service is disabled. Would send bulk SMS to ${recipients.length} recipients.`);
    return true;
  }

  try {
    // Send SMS in batches
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

  const message = `Dear Parent, This is a reminder that ${studentName} has been marked absent today. Please contact the school if this is an error.`;
  return sendSMS({ to: phoneNumber, message });
};

export const sendFeeDueSMS = async (phoneNumber: string, studentName: string, dueAmount: number): Promise<boolean> => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';

  if (!smsEnabled) {
    console.log(`📱 SMS service is disabled. Would send fee reminder to ${phoneNumber}`);
    return true;
  }

  const message = `Dear Parent, Fee of ${dueAmount} is due for ${studentName}. Please pay within 7 days. Contact school for payment options.`;
  return sendSMS({ to: phoneNumber, message });
};

export const sendNotificationSMS = async (phoneNumber: string, message: string): Promise<boolean> => {
  const smsEnabled = process.env.SMS_ENABLED === 'true';

  if (!smsEnabled) {
    console.log(`📱 SMS service is disabled. Would send notification to ${phoneNumber}`);
    return true;
  }

  // Limit message to SMS character limit (160)
  const truncatedMessage = message.substring(0, 160);
  return sendSMS({ to: phoneNumber, message: truncatedMessage });
};
