const mongoose = require('mongoose');

const ATLAS_URI = 'mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';

async function run() {
  console.log('Connecting to Atlas easy_school DB...');
  const conn = await mongoose.connect(ATLAS_URI, { dbName: 'easy_school' });
  console.log('Connected.');

  const db = mongoose.connection.db;
  const institutions = await db.collection('institutions').find({}).toArray();
  console.log(`Found ${institutions.length} institutions in database.`);

  const SiteSettingSchema = new mongoose.Schema({
    key: String,
    value: mongoose.Schema.Types.Mixed,
    isSecret: Boolean,
    institutionId: mongoose.Schema.Types.ObjectId,
    updatedBy: mongoose.Schema.Types.ObjectId,
  }, { collection: 'sitesettings' });

  const SiteSetting = mongoose.models.SiteSetting || mongoose.model('SiteSetting', SiteSettingSchema);

  // Gateway Settings template
  const gatewaySettings = {
    onlinePaymentEnabled: true,
    enabledProviders: ['recommended_gateway', 'manual_cash'],
    defaultProvider: 'recommended_gateway',
    bkash: { merchantNumber: '', appKey: '', appSecret: '', username: '', password: '', mode: 'live' },
    nagad: { merchantNumber: '', merchantId: '', publicKey: '', privateKey: '', mode: 'live' },
    sslcommerz: { storeId: '', storePassword: '', mode: 'live', ipnUrl: '', successUrl: '', failUrl: '', cancelUrl: '' },
    recommendedGateway: {
      origin: 'https://payment-gateway-server-ten.vercel.app',
      endpoint: 'https://payment-gateway-server-ten.vercel.app',
      widgetScript: 'https://payment-gateway-server-ten.vercel.app/widget.js',
      apiKey: 'pg_live_ebb11c91cb7d814c0949eeebbc549524fc0debe8543a9a40',
      secretKey: 'pg_live_ebb11c91cb7d814c0949eeebbc549524fc0debe8543a9a40',
      receiverNumber: '01790071328',
      receiverName: 'school',
      paymentMethods: ['bkash', 'nagad']
    },
    manualBank: { bankName: '', accountName: '', accountNumber: '', branch: '', instructions: '' },
    custom: { name: '', endpoint: '', apiKey: '', secretKey: '' },
    transactionOwner: 'school',
    siteCommissionEnabled: false,
    recommendedGatewayUrl: 'https://payment-gateway-server-ten.vercel.app'
  };

  for (const inst of institutions) {
    const instId = inst._id;
    const query = { key: 'site_config', institutionId: instId };
    
    const existing = await SiteSetting.findOne(query);
    const current = existing?.value || {};
    
    const updatedValue = {
      ...current,
      siteName: inst.name || current.siteName || 'Easy School',
      paymentGatewaySettings: gatewaySettings
    };

    await SiteSetting.findOneAndUpdate(
      query,
      { value: updatedValue, isSecret: true, institutionId: instId },
      { upsert: true, new: true }
    );
    console.log(`Updated settings for institution "${inst.name}" (${instId})`);
  }

  // Also update the global settings (without institutionId) just in case
  const globalQuery = { key: 'site_config', institutionId: null };
  const existingGlobal = await SiteSetting.findOne(globalQuery);
  const currentGlobal = existingGlobal?.value || {};
  const updatedGlobalValue = {
    ...currentGlobal,
    paymentGatewaySettings: gatewaySettings
  };
  await SiteSetting.findOneAndUpdate(
    globalQuery,
    { value: updatedGlobalValue, isSecret: true, institutionId: null },
    { upsert: true }
  );
  console.log('Updated global settings as well.');

  await mongoose.disconnect();
}

run().catch(console.error);
