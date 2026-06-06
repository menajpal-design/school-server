import mongoose from 'mongoose';
import connectDB from '../config/database';
import Institution from '../models/Institution';

async function run() {
  await connectDB();
  console.log('Connected to DB');

  const institutions = await Institution.find({}).select('name settings billing').lean();
  for (const inst of institutions) {
    console.log(`Institution: ${inst.name}`);
    console.log(`settings:`, JSON.stringify(inst.settings, null, 2));
    console.log(`billing:`, JSON.stringify(inst.billing, null, 2));
  }

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
