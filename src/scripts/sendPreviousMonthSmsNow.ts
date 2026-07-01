import dotenv from 'dotenv';
import connectDB from '../config/database';
import Institution from '../models/Institution';
import { sendMonthlyGuardianSummarySMS } from '../services/monthlySummarySms';

dotenv.config();
import '../models/allModels';

async function main() {
  try {
    await connectDB();
    
    // Previous month (June 2026)
    const now = new Date();
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = prevDate.getMonth() + 1;
    const prevYear = prevDate.getFullYear();

    console.log(`[Manual Trigger] Sending monthly summary for ${prevYear}-${String(prevMonth).padStart(2, '0')} to all active paid institutions...`);

    const institutions = await Institution.find({
      isActive: true,
      'billing.planCode': { $ne: 'students_100_free' },
      'settings.smsEnabled': { $ne: false },
    });

    console.log(`Found ${institutions.length} paid active institutions.`);

    for (const inst of institutions) {
      console.log(`Sending to guardians of: ${inst.name} (${inst._id})`);
      try {
        const summary = await sendMonthlyGuardianSummarySMS({
          institutionId: String(inst._id),
          month: prevMonth,
          year: prevYear,
        });
        console.log(`Successfully completed for ${inst.name}. Total: ${summary.totalStudents}, Sent: ${summary.sent}, Failed: ${summary.failed}, Skipped: ${summary.skipped}`);
      } catch (err: any) {
        console.error(`Failed for ${inst.name}:`, err.message || err);
      }
    }

    console.log('All institutions processed.');
    process.exit(0);
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

main();
