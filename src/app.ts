import 'express-async-errors';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import configRoutes from './routes/config';
import seedRoutes from './routes/seed';
import demoResultRoutes from './routes/demoResults';
import userRoutes from './routes/users';
import studentRoutes from './routes/students';
import teacherRoutes from './routes/teachers';
import staffRoutes from './routes/staff';
import academicRoutes from './routes/academic';
import syllabusRoutes from './routes/syllabus';
import classRoutineRoutes from './routes/classRoutine';
import attendanceRoutes from './routes/attendance';
import leaveRoutes from './routes/leaves';
import holidayRoutes from './routes/holidays';
import financeRoutes from './routes/finance';
import payrollRoutes from './routes/payroll';
import promotionRoutes from './routes/promotions';
import documentRoutes from './routes/documents';
import noticeRoutes from './routes/notices';
import committeeRoutes from './routes/committee';
import parentRoutes from './routes/parent';
import idCardRoutes from './routes/idCard';
import dashboardRoutes from './routes/dashboard';
import notificationRoutes from './routes/notifications';
import messageRoutes from './routes/messages';
import reportRoutes from './routes/reports';
import backupRoutes from './routes/backup';
import institutionRoutes from './routes/institution';
import admissionRoutes from './routes/admissions';
import adminRoutes from './routes/admin';
import smsMonitoringRoutes from './routes/smsMonitoring';
import libraryRoutes from './routes/library';
import siteSettingsRoutes from './routes/siteSettings';
import SmsLog from './models/SmsLog';
import { config } from './config/config';
import './config/tenantStorage';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

const app = express();
app.set('trust proxy', 1);

const cfg = config();

const splitOrigins = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => origin.replace(/\/$/, ''));
};

const allowedOrigins = new Set<string>([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:8082',
  'http://127.0.0.1:8082',
  'http://easyschool.live',
  'http://www.easyschool.live',
  'https://easyschool.live',
  'https://www.easyschool.live',
  'https://school-client-447e7d0e2388.herokuapp.com',
  'https://www.school-client-447e7d0e2388.herokuapp.com',
  'https://school-client.herokuapp.com',
  'https://www.school-client.herokuapp.com',
  'https://school-server-b264c1a1fac6.herokuapp.com',
  'https://school-server.herokuapp.com',
  cfg.frontendUrl,
  cfg.mobileUrl,
  cfg.androidUrl,
  cfg.staticServerUrl,
  ...splitOrigins(process.env.ALLOWED_ORIGINS),
  ...splitOrigins(process.env.FRONTEND_URL),
  ...splitOrigins(process.env.MOBILE_URL),
  ...splitOrigins(process.env.ANDROID_URL),
].filter(Boolean));

const allowedHeaders = new Set<string>([
  'Content-Type',
  'Authorization',
  'x-institution-id',
  'X-Institution-Id',
  'x-school-id',
  'X-School-Id',
  'Origin',
  'X-Requested-With',
  'Accept',
  'x-access-token',
  'X-Access-Token',
  ...splitOrigins(process.env.CORS_ALLOWED_HEADERS),
].filter(Boolean));

const allowAllOrigins = String(process.env.CORS_ALLOW_ALL || '').toLowerCase() === 'true' || process.env.ALLOWED_ORIGINS === '*';

const isAllowedOrigin = (origin?: string): boolean => {
  if (!origin) return true;
  if (allowAllOrigins) return true;
  const normalized = origin.replace(/\/$/, '');
  if (allowedOrigins.has(normalized)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) return true;
  if (/^https?:\/\/(www\.)?easyschool\.live$/i.test(normalized)) return true;
  return false;
};

const setCorsHeaders = (req: Request, res: Response) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && isAllowedOrigin(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  } else if (!origin && process.env.NODE_ENV !== 'production') {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', Array.from(allowedHeaders).join(', '));
  res.header('Access-Control-Max-Age', process.env.CORS_MAX_AGE || '86400');
};

app.use((req, res, next) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin || undefined)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: Array.from(allowedHeaders),
  optionsSuccessStatus: 204,
}));

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '50mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_BODY_LIMIT || '50mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use('/api/auth', authRoutes);
app.use('/api/config', configRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/demo-results', demoResultRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/syllabus', syllabusRoutes);
app.use('/api/class-routines', classRoutineRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/committee', committeeRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/id-cards', idCardRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/institution', institutionRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sms-monitoring', smsMonitoringRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/site-settings', siteSettingsRoutes);

// Temporary test endpoint to verify library routing on deployed servers
app.get('/api/library/test', (req, res) => {
  res.json({ success: true, message: 'library route test OK' });
});

app.use('/uploads', express.static('uploads'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'easy school Server is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'easy school Server is running' });
});

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
      teachers: '/api/teachers',
      siteSettings: '/api/site-settings',
    },
  });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  setCorsHeaders(req, res);
  next(err);
});

app.use(notFoundHandler);
app.use(errorHandler);

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

runSmsRetentionCleanup();
setInterval(runSmsRetentionCleanup, MS_PER_DAY);

export default app;
