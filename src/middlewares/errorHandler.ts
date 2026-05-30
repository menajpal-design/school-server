import { NextFunction, Request, Response } from 'express';
import logger from '../utils/logger';
import * as Sentry from '@sentry/node';

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
};

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Something went wrong';
  // Log to console/file
  logger.error('Unhandled error', { error: err?.message || String(err), stack: err?.stack, path: req.originalUrl, method: req.method });

  // Send to Sentry if configured
  try {
    if (process.env.SENTRY_DSN) Sentry.captureException(err);
  } catch (e) {
    logger.warn('Failed to capture exception to Sentry', { e });
  }

  res.status(statusCode).json({ success: false, message, ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}) });
};
