import dotenv from 'dotenv';
import connectDB from '../config/database';
import { sendMonthlyGuardianSummarySMS } from '../services/monthlySummarySms';

dotenv.config();

function getPreviousMonth() {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    month: previous.getMonth() + 1,
    year: previous.getFullYear(),
  };
}

async function main() {
  try {
    await connectDB();

    const fallback = getPreviousMonth();
    const month = Number(process.env.TARGET_MONTH || fallback.month);
    const year = Number(process.env.TARGET_YEAR || fallback.year);

    if (!process.env.INSTITUTION_ID) {
      throw new Error('INSTITUTION_ID is required');
    }

    const summary = await sendMonthlyGuardianSummarySMS({
      institutionId: process.env.INSTITUTION_ID,
      month,
      year,
      classId: process.env.CLASS_ID,
      sectionId: process.env.SECTION_ID,
      studentId: process.env.STUDENT_ID,
    });

    console.log('Monthly guardian SMS summary completed');
    console.log(JSON.stringify({ month, year, ...summary }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error('Monthly guardian SMS summary failed:', error);
    process.exit(1);
  }
}

main();
