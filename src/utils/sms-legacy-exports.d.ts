import './sms';

declare module './sms' {
  export function sendAttendanceReminderSMS(to: string, studentName: string, institutionId?: any): Promise<boolean>;
  export function sendAttendanceDailySMS(to: string, studentName: string, status: string, institutionId?: any): Promise<boolean>;
  export function sendResultSMS(to: string, studentName: string, summary: string, institutionId?: any): Promise<boolean>;
  export function sendMonthlyParentSummarySMS(to: string, studentName: string, message: string, institutionId?: any): Promise<boolean>;
}
