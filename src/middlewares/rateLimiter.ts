import rateLimit from 'express-rate-limit';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 20),
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const dashboardLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: Number(process.env.DASHBOARD_RATE_LIMIT_MAX || 300),
  message: { message: 'Too many dashboard requests. Please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.REPORT_RATE_LIMIT_MAX || 120),
  message: { message: 'Too many report requests. Please try again after an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const pdfLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.PDF_RATE_LIMIT_MAX || 60),
  message: { message: 'Too many PDF generation requests. Please try again after an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});
