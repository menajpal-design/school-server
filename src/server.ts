import dotenv from 'dotenv';
import connectDB from './config/database';
import app from './app';

dotenv.config();

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

app.listen(PORT, () => {
  console.log(`🚀 DRMS Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log(`📲 Mobile URL: ${process.env.MOBILE_URL || 'http://localhost:8081'}`);
});

export default app;