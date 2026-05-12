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
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';

const app = express();

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
  ];

  // Add environment variable origins
  if (process.env.FRONTEND_URL) {
    baseOrigins.push(process.env.FRONTEND_URL);
  }
  if (process.env.MOBILE_URL) {
    baseOrigins.push(process.env.MOBILE_URL);
  }
  if (process.env.ANDROID_URL) {
    baseOrigins.push(process.env.ANDROID_URL);
  }

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
  ];
  baseOrigins.push(...herokuOrigins);

  // Wildcard for development
  if (process.env.NODE_ENV === 'development') {
    baseOrigins.push('*');
  }

  return baseOrigins.filter(Boolean);
};

const allowedOrigins = parseAllowedOrigins();

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
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

// Static files
app.use('/uploads', express.static('uploads'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'DRMS Server is running' });
});

// Home route
app.get('/', (req, res) => {
  res.json({ 
    message: 'DRMS School Management System API',
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

export default app;
