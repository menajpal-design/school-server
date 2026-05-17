import dotenv from 'dotenv';
import connectDB from './config/database';
import app from './app';

dotenv.config();

const PORT = process.env.PORT || 5000;

process.on('unhandledRejection', (reason: any) => {
  console.error('Unhandled Promise Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (error: any) => {
  console.error('Uncaught Exception:', error?.message || error);
});

connectDB().catch((err) => {
  console.warn('MongoDB connection failed during boot, but server will still run:', err?.message || err);
});

const server = app.listen(PORT, () => {
  console.log(`easy school Server running on port ${PORT}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`CORS origins configured: ${process.env.ALLOWED_ORIGINS ? 'yes' : 'no'}`);
  console.log(`Mongo configured: ${process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL ? 'yes' : 'no'}`);
});

server.on('error', (err: any) => {
  console.error('HTTP Server error:', err?.message || err);
});

export default app;
