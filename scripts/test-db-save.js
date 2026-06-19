const mongoose = require('mongoose');

const ATLAS_URI = 'mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';

// Mock sanitizeConfigForSave and mergeGatewaySettings logic from siteSettings.ts
const isMasked = (value) => typeof value === 'string' && /^\*{4,}$/.test(value);

const mergeGatewaySettings = (incoming = {}, current = {}) => {
  if (!incoming || typeof incoming !== 'object') return current || {};
  const result = { ...(current || {}), ...incoming };

  const mergeProvider = (providerKey, secretKeys) => {
    const incomingProv = incoming[providerKey] || {};
    const currentProv = (current || {})[providerKey] || {};
    const mergedProv = { ...currentProv, ...incomingProv };
    
    for (const key of secretKeys) {
      const value = incomingProv[key];
      if (value === undefined || value === null || value === '' || isMasked(value) || (typeof value === 'string' && value.includes('...'))) {
        mergedProv[key] = currentProv[key] || '';
      }
    }
    result[providerKey] = mergedProv;
  };

  mergeProvider('recommendedGateway', ['apiKey', 'secretKey']);
  mergeProvider('bkash', ['appKey', 'appSecret', 'username', 'password']);
  mergeProvider('nagad', ['publicKey', 'privateKey']);
  mergeProvider('sslcommerz', ['storePassword']);
  mergeProvider('custom', ['apiKey', 'secretKey']);

  if (incoming.manualBank || (current || {}).manualBank) {
    result.manualBank = { ...((current || {}).manualBank || {}), ...(incoming.manualBank || {}) };
  }

  return result;
};

const sanitizeConfigForSave = (body = {}, current = {}) => {
  const paymentGatewaySettings = mergeGatewaySettings(body.paymentGatewaySettings, current.paymentGatewaySettings);

  return {
    ...current,
    siteName: body.siteName ?? current.siteName ?? 'Easy School',
    paymentGatewaySettings
  };
};

async function run() {
  console.log('Connecting to Atlas easy_school DB...');
  const conn = await mongoose.connect(ATLAS_URI, { dbName: 'easy_school' });
  console.log('Connected.');

  // Load SiteSetting Schema
  const SiteSettingSchema = new mongoose.Schema({
    key: String,
    value: mongoose.Schema.Types.Mixed,
    isSecret: Boolean,
    institutionId: mongoose.Schema.Types.ObjectId,
    updatedBy: mongoose.Schema.Types.ObjectId,
  }, { collection: 'sitesettings' });

  const SiteSetting = mongoose.models.SiteSetting || mongoose.model('SiteSetting', SiteSettingSchema);

  const institutionId = '6a0ae150d7657a36fd728b22'; // school-b-6-10
  const query = { key: 'site_config', institutionId: new mongoose.Types.ObjectId(institutionId) };

  // Fetch current
  const existing = await SiteSetting.findOne(query);
  const current = existing?.value || {};
  console.log('Existing settings in DB:', JSON.stringify(current, null, 2));

  // Mock payload sent from front-end PaymentSettingsPanel.tsx
  const payload = {
    paymentGatewaySettings: {
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
    }
  };

  const next = sanitizeConfigForSave(payload, current);

  // Update in database
  const updated = await SiteSetting.findOneAndUpdate(
    query,
    { value: next, isSecret: true, institutionId: new mongoose.Types.ObjectId(institutionId) },
    { upsert: true, new: true }
  );

  console.log('Saved settings successfully:', JSON.stringify(updated.value, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);
