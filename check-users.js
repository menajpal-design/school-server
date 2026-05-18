const { MongoClient } = require('mongodb');

(async () => {
  const uri = 'mongodb://127.0.0.1:27017/easy_school';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('easy_school');
    
    // Find all users
    const users = await db.collection('users').find({}).toArray();
    
    console.log('\n=== All Users in Database ===\n');
    users.forEach(user => {
      console.log(`📧 Email: ${user.email}`);
      console.log(`👤 Name: ${user.name}`);
      console.log(`📍 Role: ${user.role}`);
      console.log(`✅ Active: ${user.isActive}`);
      console.log('---');
    });
    
    console.log(`\n✅ Total users: ${users.length}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
})();
