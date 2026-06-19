const mongoose = require('mongoose');

const ATLAS_URI = 'mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  console.log('Connecting to Atlas easy_school DB...');
  const conn = await mongoose.connect(ATLAS_URI, { dbName: 'easy_school' });
  console.log('Connected.');

  const db = mongoose.connection.db;
  const users = await db.collection('users').find({}).toArray();
  console.log('Users (first 10):');
  for (const u of users.slice(0, 10)) {
    console.log(`- ID: ${u._id}, Name: ${u.name}, Role: ${u.role}, InstitutionId: ${u.institutionId}`);
  }

  const students = await db.collection('students').find({}).toArray();
  console.log('\nStudents (first 10):');
  for (const s of students.slice(0, 10)) {
    console.log(`- ID: ${s._id}, Name: ${s.name || s.userId}, InstitutionId: ${s.institutionId}`);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
