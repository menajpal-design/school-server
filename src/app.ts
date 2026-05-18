import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import configRoutes from './routes/config';
import seedRoutes from './routes/seed';
import userRoutes from './routes/users';
import studentRoutes from './routes/students';
import teacherRoutes from './routes/teachers';
import staffRoutes from './routes/staff';
import academicRoutes from './routes/academic';
import attendanceRoutes from './routes/attendance';
import financeRoutes from './routes/finance';
import documentRoutes from './routes/documents';
import noticeRoutes from './routes/notices';
import committeeRoutes from './routes/committee';
import parentRoutes from './routes/parent';
import idCardRoutes from './routes/idCard';
import dashboardRoutes from './routes/dashboard';
import notificationRoutes from './routes/notifications';
import reportRoutes from './routes/reports';
import backupRoutes from './routes/backup';
import institutionRoutes from './routes/institution';
import messageRoutes from './routes/messages';
import admissionRoutes from './routes/admissions';
import adminRoutes from './routes/admin';
import smsMonitoringRoutes from './routes/smsMonitoring';
import libraryRoutes from './routes/library';
import SmsLog from './models/SmsLog';
import { config } from './config/config';
import './config/tenantStorage';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

const app = express();
app.set('trust proxy', 1);
const cfg = config();

// Parse comma-separated allowed origins from environment variable
const parseAllowedOrigins = (): string[] => {
  const baseOrigins = [
    // Local development
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:8082',
    'http://127.0.0.1:8082',
    // Current production client
    'https://school-client-447e7d0e2388.herokuapp.com',
    'https://www.school-client-447e7d0e2388.herokuapp.com',
    'http://easyschool.live',
    'http://www.easyschool.live',
    'https://easyschool.live',
    'https://www.easyschool.live',
  ];

  // Add configured app URLs
  baseOrigins.push(cfg.frontendUrl, cfg.mobileUrl, cfg.androidUrl, cfg.staticServerUrl);

  // Add comma-separated origins from ALLOWED_ORIGINS env var
  if (process.env.ALLOWED_ORIGINS) {
    const customOrigins = process.env.ALLOWED_ORIGINS.split(',')
      .map(origin => origin.trim())
      .filter(origin => origin.length > 0);
    baseOrigins.push(...customOrigins);
  }

  // Default Heroku domains
  const herokuOrigins = [
    'https://school-client-447e7d0e2388.herokuapp.com',
    'https://school-client.herokuapp.com',
    'https://www.school-client-447e7d0e2388.herokuapp.com',
    'https://www.school-client.herokuapp.com',
    'https://school-server-b264c1a1fac6.herokuapp.com',
    'https://school-server.herokuapp.com',
    'http://easyschool.live',
    'http://www.easyschool.live',
    'https://easyschool.live',
    'https://www.easyschool.live',
  ];
  baseOrigins.push(...herokuOrigins);

  // Wildcard for development
  if (process.env.NODE_ENV === 'development') {
    baseOrigins.push('*');
  }

  return [...new Set(baseOrigins.filter(Boolean))];
};

const allowedOrigins = parseAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    const isHerokuApp = !!origin && /^https:\/\/[a-z0-9-]+\.herokuapp\.com$/i.test(origin);
    const isEasySchool = !!origin && /^https?:\/\/(www\.)?easyschool\.live$/i.test(origin);
    const isLocalhost = !!origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    if (!origin || allowedOrigins.includes(origin) || isHerokuApp || isEasySchool || isLocalhost) {
      callback(null, true);
      return;
    }
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-institution-id'],
  optionsSuccessStatus: 204,
};

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/config', configRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/committee', committeeRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/id-cards', idCardRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/institution', institutionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sms-monitoring', smsMonitoringRoutes);
app.use('/api/library', libraryRoutes);

// Static files
app.use('/uploads', express.static('uploads'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'easy school Server is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'easy school Server is running' });
});

// Home route
app.get('/', (req, res) => {
  res.json({ 
    message: 'easy school School Management System API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      students: '/api/students',
      teachers: '/api/teachers'
    }
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

// SMS logs retention: delete logs older than configured days (default 30)
const SMS_RETENTION_DAYS = Number(process.env.SMS_RETENTION_DAYS || 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const runSmsRetentionCleanup = async () => {
  try {
    const cutoff = new Date(Date.now() - SMS_RETENTION_DAYS * MS_PER_DAY);
    const result = await SmsLog.deleteMany({ createdAt: { $lt: cutoff } });
    if (result && typeof result.deletedCount === 'number') {
      console.log(`SMS retention cleanup: removed ${result.deletedCount} logs older than ${SMS_RETENTION_DAYS} days`);
    }
  } catch (err) {
    console.error('Error during SMS retention cleanup:', err);
  }
};

// Run once at startup, then schedule daily
runSmsRetentionCleanup();
setInterval(runSmsRetentionCleanup, MS_PER_DAY);

export default app;
