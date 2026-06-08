import { sendSMS } from './sms';

export const sendAttendanceReminderSMS = async (to: string, studentName: string, institutionId?: any) => sendSMS({
  to,
  message: `${studentName} is absent today.`,
  institutionId,
  type: 'attendance',
  purpose: 'attendance_absent_reminder',
});

export const sendAttendanceDailySMS = async (to: string, studentName: string, status: string, institutionId?: any) => sendSMS({
  to,
  message: `${studentName} attendance marked ${status}.`,
  institutionId,
  type: 'attendance',
  purpose: 'attendance_daily_update',
});

export const sendResultSMS = async (to: string, studentName: string, summary: string, institutionId?: any) => sendSMS({
  to,
  message: `${studentName} result: ${summary}`,
  institutionId,
  type: 'notification',
  purpose: 'result_publish',
});

export const sendMonthlyParentSummarySMS = async (to: string, studentName: string, message: string, institutionId?: any) => sendSMS({
  to,
  message: message || `${studentName} monthly summary is available.`,
  institutionId,
  type: 'monthly_parent',
  purpose: 'monthly_parent_summary',
});
