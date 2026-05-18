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

const COMPANY_MONGO_URI = 'mongodb://school-multi:G9kgCqwaQvcqb6bD@ac-grnzgam-shard-00-00.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-01.eokx1rc.mongodb.net:27017,ac-grnzgam-shard-00-02.eokx1rc.mongodb.net:27017/?ssl=true&replicaSet=atlas-bcrchy-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';
const LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/easy_school';

const parseConnectionList = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const getMongoUriCandidates = (): string[] => {
  const candidates = [
    process.env.MONGO_URIS,
    process.env.MONGO_URI,
    process.env.MONGODB_URI,
    process.env.MONGODB_URI_PROD,
    process.env.DATABASE_URL,
  ].flatMap((value) => parseConnectionList(value));

  if ((process.env.NODE_ENV || 'development') !== 'production') {
    candidates.unshift(LOCAL_MONGO_URI);
  }

  candidates.push(COMPANY_MONGO_URI);
  return candidates;
};

let connectionPromise: Promise<typeof mongoose | null> | null = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (mongoose.connection.readyState === 2 && connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      const mongoUris = getMongoUriCandidates();

      if (mongoUris.length === 0) {
        console.warn('MONGO_URI not set; database features disabled');
        return null;
      }

      const options: mongoose.ConnectOptions = {
        maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE || '10'),
        serverSelectionTimeoutMS: 8000,
        retryWrites: true,
        dbName: process.env.MONGO_DB_NAME || 'easy_school',
      };

      for (const mongoUri of mongoUris) {
        try {
          const conn = await mongoose.connect(mongoUri, options);
          console.log(`MongoDB Connected: ${conn.connection.host}`);
          console.log(`Database: ${process.env.MONGO_DB_NAME || 'easy_school'}`);
          return conn;
        } catch (error) {
          console.warn(`MongoDB connection failed for configured URI`);
          console.warn(error);
        }
      }

      console.error('All MongoDB URIs failed to connect');
      return null;
    } catch (error) {
      console.error('MongoDB Connection Error:', error);
      console.error('Server will continue running without MongoDB connection');
      return null;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
};

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
  return waitForDatabaseReady();
};
