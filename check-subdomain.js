const mongoose = require('mongoose');

const mongoUri = 'mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';
const dbName = 'easy_school';

async function run() {
  try {
    await mongoose.connect(mongoUri, { dbName });
    console.log('Connected to MongoDB');

    const InstitutionSchema = new mongoose.Schema({}, { strict: false });
    const Institution = mongoose.model('Institution', InstitutionSchema, 'institutions');

    const inst = await Institution.findOne({ subdomain: 'school-b-6-10' });
    if (!inst) {
      console.log('No institution found with subdomain "school-b-6-10"');
      
      const list = await Institution.find({}).limit(5).select('name subdomain isActive');
      console.log('Sample institutions in DB:', JSON.stringify(list, null, 2));
    } else {
      console.log('Found Institution:', {
        id: inst._id,
        name: inst.get('name'),
        subdomain: inst.get('subdomain'),
        isActive: inst.get('isActive'),
        billingStatus: inst.get('billing')?.billingStatus,
        useEasySchoolStorage: inst.get('billing')?.useEasySchoolStorage,
      });
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
