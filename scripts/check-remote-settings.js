const mongoose = require('mongoose');

const DO_URI = 'mongodb+srv://school:2P9b47v5K6qx18cB@db-mongodb-nyc3-08044-b0496064.mongo.ondigitalocean.com/easyschool?tls=true&authSource=admin&replicaSet=db-mongodb-nyc3-08044';
const ATLAS_URI = 'mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';

async function checkDb(uri, name) {
  try {
    console.log(`Connecting to ${name}...`);
    const conn = await mongoose.createConnection(uri).asPromise();
    console.log(`Connected to ${name}.`);
    const siteConfigs = await conn.db.collection('sitesettings').find({}).toArray();
    console.log(`Found ${siteConfigs.length} settings in ${name} sitesettings:`);
    for (const config of siteConfigs) {
      console.log(`- Key: "${config.key}", Institution: "${config.institutionId}", Value:`, JSON.stringify(config.value, null, 2));
    }
    await conn.close();
  } catch (error) {
    console.error(`Error checking ${name}:`, error.message);
  }
}

async function run() {
  await checkDb(DO_URI, 'DigitalOcean DB');
  await checkDb(ATLAS_URI, 'Atlas DB');
}

run().catch(console.error);
