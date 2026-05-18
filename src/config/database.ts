import mongoose from 'mongoose';
import { getAppConfig } from './config';

const parseConnectionList = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const getMongoUriCandidates = (): string[] => {
    const appCfg = getAppConfig();

  return [
    process.env.MONGO_URIS,
    process.env.MONGO_URI,
    process.env.MONGODB_URI,
    process.env.MONGODB_URI_PROD,
    process.env.DATABASE_URL,
        appCfg.mongoUri,

  ].flatMap((value) => parseConnectionList(value));
};

let connectionPromise: Promise<typeof mongoose | null> | null = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (mongoose.connection.readyState === 2 && connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    const mongoUris = getMongoUriCandidates();

    if (mongoUris.length === 0) {
      console.warn('No MongoDB URI configured. Set MONGO_URI or MONGODB_URI in Heroku Config Vars. Server will keep running, but DB routes will return empty/error data.');
      return null;
    }

    const options: mongoose.ConnectOptions = {
      maxPoolSize: Number(process.env.MONGO_POOL_SIZE || 10),
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
      connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS || 10000),
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 45000),
      retryWrites: true,
      dbName: process.env.MONGO_DB_NAME || undefined,
    };

    for (const mongoUri of mongoUris) {
      try {
        const conn = await mongoose.connect(mongoUri, options);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
        return conn;
      } catch (error: any) {
        console.warn('MongoDB connection failed for one configured URI:', error?.message || error);
      }
    }

    console.error('All configured MongoDB URIs failed. Server will continue running without DB connection.');
    return null;
  })();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
};

mongoose.connection.on('error', (error) => {
  console.error('MongoDB runtime error:', error?.message || error);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. API will keep running and reconnect on demand.');
});

export default connectDB;
export const isDatabaseConnected = (): boolean => mongoose.connection.readyState === 1;
export const waitForDatabaseReady = async (timeoutMs = 15000, intervalMs = 250): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (mongoose.connection.readyState === 1) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return mongoose.connection.readyState === 1;
};
export const ensureDatabaseReady = async (): Promise<boolean> => {
  if (isDatabaseConnected()) return true;
  await connectDB();
  return waitForDatabaseReady(Number(process.env.DB_READY_TIMEOUT_MS || 5000));
};
