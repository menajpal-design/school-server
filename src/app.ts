import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import authRoutes from './routes/auth';
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
import smsRoutes from './routes/sms';
import siteSettingsRoutes from './routes/siteSettings';
import './config/tenantStorage';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

const app = express();

const splitEnv = (value?: string) => (value || '').split(',').map((item) => item.trim().replace(/\/$/, '')).filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';
const devOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'];
const productionFallbackOrigins = [
  'https://www.easyschool.live',
  'https://easyschool.live',
  'http://www.easyschool.live',
  'http://easyschool.live',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5000',
];

const allowedOrigins = Array.from(new Set([
  ...productionFallbackOrigins,
  ...splitEnv(process.env.ALLOWED_ORIGINS),
  ...splitEnv(process.env.FRONTEND_URL),
  ...splitEnv(process.env.MOBILE_URL),
  ...splitEnv(process.env.ANDROID_URL),
  ...(isProduction ? [] : devOrigins),
]));

const allowedHeaders = Array.from(new Set([
  'Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization',
  'x-access-token', 'X-Access-Token', 'x-institution-id', 'X-Institution-Id',
  'x-school-id', 'X-School-Id',
  ...splitEnv(process.env.CORS_ALLOWED_HEADERS),
])).join(', ');

const allowAllOrigins = String(process.env.CORS_ALLOW_ALL || '').toLowerCase() === 'true' || process.env.ALLOWED_ORIGINS === '*';

const isAllowedOrigin = (origin?: string): boolean => {
  if (!origin) return true;
  if (allowAllOrigins) return true;
  const normalized = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(normalized)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) return true;
  if (/^https?:\/\/(www\.)?easyschool\.live$/i.test(normalized)) return true;
  return false;
};

const setCorsHeaders = (req: Request, res: Response) => {
  const origin = req.headers.origin as string | undefined;
  if (origin && isAllowedOrigin(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  } else if (!origin && !isProduction) {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', allowedHeaders);
  res.header('Access-Control-Max-Age', process.env.CORS_MAX_AGE || '86400');
};

app.use((req, res, next) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin || undefined)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: allowedHeaders.split(', '),
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '50mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_BODY_LIMIT || '50mb' }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.RATE_LIMIT_MAX || 300), standardHeaders: true, legacyHeaders: false });
app.use(limiter);

app.use('/api/auth', authRoutes);
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
app.use('/api/sms', smsRoutes);
app.use('/api/site-settings', siteSettingsRoutes);

app.use('/uploads', express.static('uploads'));

const healthPayload = () => ({
  status: 'OK',
  message: 'easy school Server is running',
  dbReadyState: mongoose.connection.readyState,
  dbConnected: mongoose.connection.readyState === 1,
  corsOrigins: allowedOrigins.length,
});
app.get('/api/health', (req, res) => { setCorsHeaders(req, res); res.json(healthPayload()); });
app.get('/health', (req, res) => { setCorsHeaders(req, res); res.json(healthPayload()); });

app.get('/', (req, res) => {
  setCorsHeaders(req, res);
  res.json({
    message: 'easy school School Management System API',
    version: '1.0.0',
    status: 'running',
    cors: 'env-controlled-with-easyschool-fallback',
    allowedOriginsCount: allowedOrigins.length,
    dbReadyState: mongoose.connection.readyState,
    endpoints: { health: '/api/health', auth: '/api/auth', users: '/api/users', academic: '/api/academic', syllabus: '/api/syllabus' },
  });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  setCorsHeaders(req, res);
  next(err);
});
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
