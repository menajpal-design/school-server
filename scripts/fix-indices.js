const mongoose = require('mongoose');

const ATLAS_URI = 'mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  console.log('Connecting to Atlas easy_school DB...');
  const conn = await mongoose.connect(ATLAS_URI, { dbName: 'easy_school' });
  console.log('Connected.');

  const db = mongoose.connection.db;
  const collection = db.collection('sitesettings');

  // List existing indexes
  const indexes = await collection.indexes();
  console.log('Current indexes on easy_school.sitesettings:', indexes);

  // Check if unique key_1 index exists
  const hasKeyUnique = indexes.some(idx => idx.name === 'key_1' && idx.unique);
  if (hasKeyUnique) {
    console.log('Dropping incorrect unique key_1 index...');
    await collection.dropIndex('key_1');
    console.log('Index key_1 dropped successfully.');
  }

  // Create correct unique key_1_institutionId_1 index
  console.log('Creating correct unique index on { key: 1, institutionId: 1 }...');
  await collection.createIndex({ key: 1, institutionId: 1 }, { unique: true });
  console.log('Index created successfully.');

  // List indexes again to verify
  const newIndexes = await collection.indexes();
  console.log('New indexes on easy_school.sitesettings:', newIndexes);

  await mongoose.disconnect();
}

run().catch(console.error);
