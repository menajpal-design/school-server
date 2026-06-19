const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

(async () => {
  const uri = 'mongodb://127.0.0.1:27017/easy_school';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('easy_school');
    
    // First, get the Demo School institution ID
    const school = await db.collection('institutions').findOne({ name: 'Demo School' });
    if (!school) {
      console.error('❌ Demo School not found!');
      return;
    }
    
    const institutionId = school._id;
    const hashedPassword = await bcrypt.hash('31520666', 10);
    
    // Create accounts
    const newUsers = [
      {
        name: 'Admin User',
        email: 'menajpal@gmail.com',
        password: hashedPassword,
        role: 'admin',
        phone: '01700000001',
        isActive: true,
        institutionId: institutionId,
        permissions: ['*'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Client User',
        email: 'hridoy@gmail.com',
        password: hashedPassword,
        role: 'head',
        phone: '01700000002',
        isActive: true,
        institutionId: institutionId,
        permissions: ['*'],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    ];
    
    // Insert users
    const result = await db.collection('users').insertMany(newUsers);
    console.log('✅ Created accounts:');
    console.log('');
    console.log('Admin Account:');
    console.log('  📧 Email: menajpal@gmail.com');
    console.log('  🔑 Password: 31520666');
    console.log('  📍 Role: admin');
    console.log('');
    console.log('Client Account:');
    console.log('  📧 Email: hridoy@gmail.com');
    console.log('  🔑 Password: 31520666');
    console.log('  📍 Role: head (School Head)');
    console.log('');
    console.log(`✅ Total accounts created: ${result.insertedIds.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
})();
