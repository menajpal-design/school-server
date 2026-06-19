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
  const publicAuthPaths = [
    '/api/auth/register',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/refresh',
    '/api/auth/forgot-password',
    '/api/auth/reset-password-with-code',
    '/api/admissions/public',
  ];
  if (publicAuthPaths.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(p))) {
    return next();
  }

  const cookie = req.cookies?.[CSRF_COOKIE_NAME] || '';
  const header = (req.headers[CSRF_HEADER_NAME] as string) || '';

  // If header is present, require match with cookie (double-submit)
  if (header) {
    if (!cookie || cookie !== header) {
      const origin = String(req.headers.origin || '').toLowerCase();
      const referer = String(req.headers.referer || '').toLowerCase();
      console.warn('CSRF validation failed (header mismatch)', { cookie: cookie ? `${cookie.slice(0,6)}...` : null, header: header ? `${header.slice(0,6)}...` : null, origin, referer });
      return res.status(403).json({ message: 'Invalid CSRF token', cookie: cookie || null, header: header || null, origin: req.headers.origin || null, referer: req.headers.referer || null });
    }
    return next();
  }

  // No header provided: allow only when cookie exists and request is same-origin
  if (!cookie) {
    const origin = String(req.headers.origin || '').toLowerCase();
    const referer = String(req.headers.referer || '').toLowerCase();
    console.warn('CSRF validation failed (no cookie)', { cookie: null, header: null, origin, referer });
    return res.status(403).json({ message: 'Invalid CSRF token', cookie: null, header: null, origin: req.headers.origin || null, referer: req.headers.referer || null });
  }
  try {
    const mainDomain = (process.env.MAIN_DOMAIN || '').toLowerCase();
    const origin = String(req.headers.origin || '').toLowerCase();
    const referer = String(req.headers.referer || '').toLowerCase();
    const originOk = mainDomain && (origin.endsWith(mainDomain) || referer.includes(mainDomain));
    if (originOk) return next();
  } catch (e) {
    // fallthrough to forbidden
  }
  const origin = String(req.headers.origin || '').toLowerCase();
  const referer = String(req.headers.referer || '').toLowerCase();
  console.warn('CSRF validation failed (origin mismatch)', { cookie: cookie ? `${cookie.slice(0,6)}...` : null, header: null, origin, referer });
  return res.status(403).json({ message: 'Invalid CSRF token', cookie: cookie || null, header: null, origin: req.headers.origin || null, referer: req.headers.referer || null });
}

// Helper to set csrf cookie on responses
export function setCsrfCookie(res: Response, token: string, req?: Request) {
  try {
    // Determine secure flag using request (trust proxy must be set in app)
    const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    const reqIsSecure = Boolean(req && ((req as any).secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase().startsWith('https')));
    const secureFlag = isProd ? reqIsSecure || true : false;

    // Only use explicit COOKIE_DOMAIN if provided. Prefer host-only cookie (no domain) to avoid cross-subdomain issues.
    const explicitCookieDomain = process.env.COOKIE_DOMAIN || undefined;
    const domainOpt = explicitCookieDomain ? { domain: explicitCookieDomain.startsWith('.') ? explicitCookieDomain : `.${explicitCookieDomain}` } : {};

    // SameSite=none REQUIRES Secure=true. Only use 'none' if secure. Otherwise use 'Lax' (safe for credentials when same-site).
    const sameSiteOpt = secureFlag ? 'none' : 'lax';

    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: secureFlag,
      sameSite: sameSiteOpt as any,
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
      ...domainOpt,
    });
  } catch (e) {
    // ignore set-cookie errors
  }
}

// Simple cookie parser middleware to populate req.cookies
export function cookieParser(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies) {
    const cookieHeader = req.headers.cookie;
    const cookies: Record<string, string> = {};
    if (cookieHeader) {
      cookieHeader.split(';').forEach((cookie) => {
        const parts = cookie.split('=');
        const name = parts.shift()?.trim();
        const value = parts.join('=').trim();
        if (name) {
          try {
            cookies[name] = decodeURIComponent(value);
          } catch (e) {
            cookies[name] = value;
          }
        }
      });
    }
    (req as any).cookies = cookies;
  }
  next();
}
