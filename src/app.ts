import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import seedRoutes from './routes/seed';
import userRoutes from './routes/users';
import studentRoutes from './routes/students';
import teacherRoutes from './routes/teachers';
import staffRoutes from './routes/staff';
import academicRoutes from './routes/academic';
import classRoutineRoutes from './routes/classRoutine';
import attendanceRoutes from './routes/attendance';
import leaveRoutes from './routes/leaves';
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
import reportRoutes from './routes/reports';
import backupRoutes from './routes/backup';
import institutionRoutes from './routes/institution';
import admissionRoutes from './routes/admissions';
import adminRoutes from './routes/admin';
import smsRoutes from './routes/sms';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3001',
  process.env.MOBILE_URL || 'http://localhost:8081',
  process.env.ANDROID_URL || 'http://localhost:8082',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:8082',
  'http://127.0.0.1:8082',
  'https://school-client-447e7d0e2388.herokuapp.com',
  'https://www.school-client-447e7d0e2388.herokuapp.com',
  'https://school-client.herokuapp.com',
  'https://www.school-client.herokuapp.com',
  'http://easyschool.live',
  'http://www.easyschool.live',
  'https://easyschool.live',
  'https://www.easyschool.live',
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
];

const isAllowedOrigin = (origin: string): boolean => (
  allowedOrigins.includes(origin) ||
  /^https?:\/\/(www\.)?easyschool\.live$/i.test(origin) ||
  /^https:\/\/[a-z0-9-]+\.herokuapp\.com$/i.test(origin)
);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

app.use('/api/auth', authRoutes);
app.use('/api/seed', seedRoutes);
app.use('/api/users', userRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/class-routines', classRoutineRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
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
app.use('/api/reports', reportRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/institution', institutionRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sms', smsRoutes);

app.use('/uploads', express.static('uploads'));

app.get('/api/health', (req, res) => { res.json({ status: 'OK', message: 'easy school Server is running' }); });
app.get('/health', (req, res) => { res.json({ status: 'OK', message: 'easy school Server is running' }); });

app.get('/', (req, res) => {
  res.json({
    message: 'easy school School Management System API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health', auth: '/api/auth', users: '/api/users', students: '/api/students', teachers: '/api/teachers', payroll: '/api/payroll', promotions: '/api/promotions', classRoutines: '/api/class-routines', leaves: '/api/leaves', sms: '/api/sms',
    },
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;