import '../src/config/loadEnv';
import connectDB from '../src/config/database';
import app from '../src/app';

export default async function handler(req: any, res: any) {
  try {
    await connectDB();
  } catch (err: any) {
    console.warn('⚠️ Serverless MongoDB connection warning:', err?.message || err);
  }
  return app(req, res);
}
