import Institution from '../models/Institution';
import SmsLog from '../models/SmsLog';
import { sendMonthlyGuardianSummarySMS, sendPeriodSummarySMS } from './monthlySummarySms';
import logger from '../utils/logger';
import '../models/allModels';

let lastRunDateHour = '';

function getBDTime() {
  const now = new Date();
  const utcOffset = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcOffset + 3600000 * 6); // UTC+6 (Bangladesh Time)
}

export async function checkAndRunScheduledJobs() {
  try {
    const bdTime = getBDTime();
    const date = bdTime.getDate(); // 1 to 31
    const day = bdTime.getDay(); // 0 (Sunday) to 6 (Saturday)
    const hour = bdTime.getHours();
    const minute = bdTime.getMinutes();

    // Only run once per hour at 9:00 AM BD Time
    if (hour !== 9) return;

    const runKey = `${bdTime.getFullYear()}-${bdTime.getMonth() + 1}-${date}-${hour}`;
    if (lastRunDateHour === runKey) return;
    lastRunDateHour = runKey;

    logger.info(`[Scheduler] Starting scheduled SMS jobs at 9:00 AM BD Time (Date: ${date}, Day: ${day})...`);

    // Fetch all active institutions on paid plans
    const institutions = await Institution.find({
      isActive: true,
      'billing.planCode': { $ne: 'students_100_free' },
      'settings.smsEnabled': { $ne: false },
    }).lean();

    for (const inst of institutions) {
      const institutionId = String(inst._id);
      
      // 1. Monthly Summary SMS (Runs on the 1st of the month at 9:00 AM)
      if (date === 1) {
        // Send monthly summary for the previous month
        const prevDate = new Date(bdTime.getFullYear(), bdTime.getMonth() - 1, 1);
        const prevMonth = prevDate.getMonth() + 1;
        const prevYear = prevDate.getFullYear();
        const prevMonthLabel = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

        // Check if already sent
        const alreadySent = await SmsLog.exists({
          institutionId,
          purpose: `monthly_guardian_summary_${prevMonthLabel}`,
          sentAt: { $gte: new Date(bdTime.getFullYear(), bdTime.getMonth(), 1) }
        });

        if (!alreadySent) {
          logger.info(`[Scheduler] Sending monthly summary for ${prevMonthLabel} for institution ${inst.name}...`);
          sendMonthlyGuardianSummarySMS({
            institutionId,
            month: prevMonth,
            year: prevYear,
          }).catch(err => logger.error(`[Scheduler] Monthly SMS failed for ${inst.name}:`, err));
        }
      }

      // 2. 15-Day Summary SMS (Runs on the 15th of the month at 9:00 AM)
      if (date === 15) {
        const start = new Date(Date.UTC(bdTime.getFullYear(), bdTime.getMonth(), 1, 0, 0, 0));
        const end = new Date(Date.UTC(bdTime.getFullYear(), bdTime.getMonth(), 15, 0, 0, 0));
        const label = `1st-15th Summary`;

        const alreadySent = await SmsLog.exists({
          institutionId,
          purpose: '15_day_summary_first_half',
          sentAt: { $gte: start }
        });

        if (!alreadySent) {
          logger.info(`[Scheduler] Sending 15-day summary (first half) for institution ${inst.name}...`);
          sendPeriodSummarySMS({
            institutionId,
            startDate: start,
            endDate: end,
            label,
          }).catch(err => logger.error(`[Scheduler] 15-day SMS failed for ${inst.name}:`, err));
        }
      }

      // 3. Weekly Summary SMS (Runs every Friday at 9:00 AM)
      // Bangladesh weekend/week starts usually Sunday-Thursday, so Friday (day 5) is perfect.
      if (day === 5 && inst.billing?.attendanceSmsMode === 'weekly') {
        const end = new Date(Date.UTC(bdTime.getFullYear(), bdTime.getMonth(), date, 0, 0, 0));
        const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
        const label = `Weekly Summary`;

        const alreadySent = await SmsLog.exists({
          institutionId,
          purpose: 'weekly_summary',
          sentAt: { $gte: start }
        });

        if (!alreadySent) {
          logger.info(`[Scheduler] Sending weekly summary for institution ${inst.name}...`);
          sendPeriodSummarySMS({
            institutionId,
            startDate: start,
            endDate: end,
            label,
          }).catch(err => logger.error(`[Scheduler] Weekly SMS failed for ${inst.name}:`, err));
        }
      }
    }
  } catch (error) {
    logger.error('[Scheduler] Error running scheduled jobs:', error);
  }
}

export function startScheduler() {
  logger.info('[Scheduler] Initializing automated SMS scheduler (running checks every minute)...');
  // Run check immediately on start
  checkAndRunScheduledJobs();
  // Set interval to check every minute
  setInterval(() => {
    checkAndRunScheduledJobs();
  }, 60000);
}
