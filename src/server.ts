import dotenv from 'dotenv';
import connectDB from './config/database';
import app from './app';
import * as Sentry from '@sentry/node';
import logger from './utils/logger';

dotenv.config();

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN });
  logger.info('Sentry initialized');
}

const PORT = process.env.PORT || 5000;

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  // Don't exit - let server continue running
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let server continue running
});

// Connect to MongoDB (non-blocking)
connectDB().catch(err => {
  console.warn('⚠️  MongoDB connection failed, but server will still run:', err.message);
});

const server = app.listen(PORT, () => {
  logger.info(`🚀 easy school Server running on port ${PORT}`);
  logger.info(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  logger.info(`📲 Mobile URL: ${process.env.MOBILE_URL || 'http://localhost:8081'}`);
});

// Handle server errors
server.on('error', (err: any) => {
  logger.error('❌ Server error:', err);
});

export default app;