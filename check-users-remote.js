const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

(async () => {
  const uri = 'mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';
  
  try {
    await mongoose.connect(uri, { dbName: 'easy_school' });
    console.log('🔌 Connected to MongoDB');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const user = await User.findOne({ email: 'hridoy@kanaipurhighschool.edu.bd' });
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }

    // Sign token
    const token = jwt.sign({ id: user._id }, 'super_secret_jwt_key_32_chars_minimum_12345678901234567890123456789012', { expiresIn: '7d' });
    console.log('🔑 Signed JWT token directly');

    // Fetch card
    const res = await fetch('http://localhost:5000/api/id-cards/me/card', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('🪪 Response Status:', res.status);
    console.log(data);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
})();
