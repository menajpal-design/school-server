const mongoose = require('mongoose');

const ATLAS_URI = 'mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  console.log('Connecting to Atlas...');
  const conn = await mongoose.connect(ATLAS_URI);
  console.log('Connected.');

  const db = mongoose.connection.useDb('easy_school').db;
  const docs = await db.collection('sitesettings').find({}).toArray();
  console.log('All documents in easy_school.sitesettings:', JSON.stringify(docs, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
