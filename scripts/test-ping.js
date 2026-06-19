const mongoose = require('mongoose');

const TENANT_URI = 'mongodb+srv://school:pqcF4dsFmJ06nxhq@cluster0.uioqkbc.mongodb.net/easy_school?retryWrites=true&w=majority';

async function run() {
  console.log('Connecting to Tenant DB...');
  const conn = await mongoose.connect(TENANT_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('Connected.');

  try {
    console.log('Attempting admin ping...');
    await mongoose.connection.db.admin().ping();
    console.log('Ping successful.');
  } catch (error) {
    console.error('Ping failed:', error.message);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
