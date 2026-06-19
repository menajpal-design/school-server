const mongoose = require('mongoose');

const ATLAS_URI = 'mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  console.log('Connecting to Atlas...');
  const conn = await mongoose.connect(ATLAS_URI);
  console.log('Connected.');

  const adminDb = mongoose.connection.useDb('admin').db;
  const dbs = await adminDb.admin().listDatabases();
  console.log('Databases in cluster:', dbs.databases.map(d => d.name));

  for (const dbInfo of dbs.databases) {
    const dbName = dbInfo.name;
    if (['admin', 'local', 'config'].includes(dbName)) continue;
    const db = mongoose.connection.useDb(dbName).db;
    const collections = await db.listCollections().toArray();
    console.log(`- Database "${dbName}" collections:`, collections.map(c => c.name));
    
    if (collections.some(c => c.name === 'sitesettings')) {
      const siteConfigs = await db.collection('sitesettings').find({}).toArray();
      console.log(`  Found ${siteConfigs.length} settings in ${dbName}.sitesettings:`);
      for (const config of siteConfigs) {
        console.log(`  * Key: "${config.key}", Value:`, JSON.stringify(config.value, null, 2));
      }
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
