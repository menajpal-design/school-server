import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI as string;
    
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable is not set');
    }

    const options: mongoose.ConnectOptions = {
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE || '10'),
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
      dbName: process.env.MONGO_DB_NAME || 'drms',
    };

    // MongoDB Atlas uses SSL by default
    if (process.env.MONGO_SSL === 'true' && mongoUri.includes('mongodb+srv://')) {
      options.ssl = true;
    }

    const conn = await mongoose.connect(mongoUri, options);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${process.env.MONGO_DB_NAME}`);
    console.log(`🔒 SSL Enabled: ${process.env.MONGO_SSL}`);
    
    return conn;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    console.error('⚠️  Server will continue running without MongoDB connection');
  }
};

export default connectDB;