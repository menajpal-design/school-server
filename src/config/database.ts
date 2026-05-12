import mongoose from 'mongoose';

const parseConnectionList = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const connectDB = async () => {
  try {
    const mongoUris = parseConnectionList(process.env.MONGO_URIS || process.env.MONGO_URI);

    if (mongoUris.length === 0) {
      console.warn('MONGO_URI not set; database features disabled');
      return null;
    }

    const options: mongoose.ConnectOptions = {
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE || '10'),
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
      dbName: process.env.MONGO_DB_NAME || 'drms',
    };

    for (const mongoUri of mongoUris) {
      try {
        const connectOptions = { ...options };

        // MongoDB Atlas uses SSL by default
        if (process.env.MONGO_SSL === 'true' && mongoUri.includes('mongodb+srv://')) {
          connectOptions.ssl = true;
        }

        const conn = await mongoose.connect(mongoUri, connectOptions);

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📦 Database: ${process.env.MONGO_DB_NAME}`);
        console.log(`🔒 SSL Enabled: ${process.env.MONGO_SSL}`);

        return conn;
      } catch (error) {
        console.warn(`⚠️ MongoDB connection failed for ${mongoUri}`);
        console.warn(error);
      }
    }

    console.error('❌ All MongoDB URIs failed to connect');
    return null;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    console.error('Server will continue running without MongoDB connection');
    return null;
  }
};

export default connectDB;
