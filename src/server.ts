import dotenv from 'dotenv';
import connectDB from './config/database';
import app from './app';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Keep the web dyno online even if MongoDB is temporarily unavailable.
connectDB().catch(err => {
  console.warn('MongoDB connection failed, but server will still run:', err.message);
});

const server = app.listen(PORT, () => {
  console.log(`🚀 easy school Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`📲 Mobile URL: ${process.env.MOBILE_URL || 'http://localhost:8081'}`);
});

server.on('error', (err: any) => {
  console.error('Server error:', err);
});

export default app;
