import '../src/config/loadEnv';
import connectDB from '../src/config/database';
import app from '../src/app';

// Establish/reuse database connection in serverless environment
connectDB().catch((err) => {
  console.warn('⚠️ Serverless MongoDB connection warning:', err?.message || err);
});

export default app;
