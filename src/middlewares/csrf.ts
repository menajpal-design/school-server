import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME || 'csrf_token';
const CSRF_HEADER_NAME = process.env.CSRF_HEADER_NAME || 'x-csrf-token';

export function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

// Middleware to validate CSRF token for state-changing requests
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const cookie = req.cookies?.[CSRF_COOKIE_NAME] || '';
  const header = (req.headers[CSRF_HEADER_NAME] as string) || '';

  if (!cookie || !header || cookie !== header) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }
  return next();
}

// Helper to set csrf cookie on responses
export function setCsrfCookie(res: Response, token: string) {
  try {
    const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
  } catch (e) {
    // ignore set-cookie errors
  }
}
