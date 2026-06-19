const { MongoClient } = require('mongodb');

(async () => {
  const uri = 'mongodb://127.0.0.1:27017/easy_school';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('easy_school');
    
    // Update Demo School billing status
    const result = await db.collection('institutions').updateOne(
      { name: 'Demo School' },
      { $set: { 'billing.billingStatus': 'active', isActive: true } }
    );
    
    console.log('✅ Updated:', result.modifiedCount, 'institution(s)');
    
    // Show current billing status
    const school = await db.collection('institutions').findOne({ name: 'Demo School' });
    if (school) {
      console.log('📊 Billing Status:', school.billing?.billingStatus);
      console.log('🏢 Is Active:', school.isActive);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
})();
