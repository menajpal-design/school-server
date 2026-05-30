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

  const path = req.originalUrl.split('?')[0];
  // Public auth endpoints should remain usable without a CSRF token.
  if (path.startsWith('/api/auth/register') || path.startsWith('/api/auth/login') || path.startsWith('/api/auth/forgot-password')) {
    return next();
  }

  const cookie = req.cookies?.[CSRF_COOKIE_NAME] || '';
  const header = (req.headers[CSRF_HEADER_NAME] as string) || '';

  // If header is present, require match with cookie (double-submit)
  if (header) {
    if (!cookie || cookie !== header) return res.status(403).json({ message: 'Invalid CSRF token' });
    return next();
  }

  // No header provided: allow only when cookie exists and request is same-origin
  if (!cookie) return res.status(403).json({ message: 'Invalid CSRF token' });
  try {
    const mainDomain = (process.env.MAIN_DOMAIN || '').toLowerCase();
    const origin = String(req.headers.origin || '').toLowerCase();
    const referer = String(req.headers.referer || '').toLowerCase();
    const originOk = mainDomain && (origin.endsWith(mainDomain) || referer.includes(mainDomain));
    if (originOk) return next();
  } catch (e) {
    // fallthrough to forbidden
  }
  return res.status(403).json({ message: 'Invalid CSRF token' });
}

// Helper to set csrf cookie on responses
export function setCsrfCookie(res: Response, token: string) {
  try {
    const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    const cookieDomain = process.env.COOKIE_DOMAIN || process.env.MAIN_DOMAIN || undefined;
    const domainOpt = cookieDomain ? { domain: cookieDomain.startsWith('.') ? cookieDomain : `.${cookieDomain}` } : {};
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
      ...domainOpt,
    });
  } catch (e) {
    // ignore set-cookie errors
  }
}
