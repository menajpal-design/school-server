import { Request, Response, NextFunction } from 'express';

function sanitizeValue(value: any): any {
  if (typeof value === 'string') {
    // Trim and remove NULL/control characters
    return value.trim().replace(/[\x00-\x1F\x7F]/g, '');
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const k of Object.keys(value)) {
      out[k] = sanitizeValue(value[k]);
    }
    return out;
  }
  return value;
}

export function sanitizeRequest(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.body) req.body = sanitizeValue(req.body);
    if (req.query) req.query = sanitizeValue(req.query);
    if (req.params) req.params = sanitizeValue(req.params);
  } catch (e) {
    // ignore sanitization errors
  }
  next();
}
