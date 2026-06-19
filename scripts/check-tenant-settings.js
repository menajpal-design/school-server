const mongoose = require('mongoose');

const TENANT_URI = 'mongodb+srv://school:pqcF4dsFmJ06nxhq@cluster0.uioqkbc.mongodb.net/easy_school?retryWrites=true&w=majority';

async function run() {
  console.log('Connecting to Tenant DB...');
  const conn = await mongoose.connect(TENANT_URI);
  console.log('Connected.');

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('Collections in tenant database:', collections.map(c => c.name));

  if (collections.some(c => c.name === 'sitesettings')) {
    const siteConfigs = await mongoose.connection.db.collection('sitesettings').find({}).toArray();
    console.log(`Found ${siteConfigs.length} settings in tenant sitesettings:`);
    for (const config of siteConfigs) {
      console.log(`- Key: "${config.key}", Institution: "${config.institutionId}", Value:`, JSON.stringify(config.value, null, 2));
    }
  }

  await mongoose.disconnect();
}

run().catch(console.error);
