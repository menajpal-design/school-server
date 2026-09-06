import '../src/config/loadEnv';
import mongoose from 'mongoose';
import connectDB from '../src/config/database';
import app from '../src/app';

let isConnecting = false;

export default async function handler(req: any, res: any) {
  if (mongoose.connection.readyState !== 1 && !isConnecting) {
    isConnecting = true;
    try {
      await Promise.race([
        connectDB(),
        new Promise((resolve) => setTimeout(resolve, 5000))
      ]);
    } catch (err: any) {
      console.warn('⚠️ Serverless MongoDB connection warning:', err?.message || err);
    } finally {
      isConnecting = false;
    }
  }

  return app(req, res);
}
