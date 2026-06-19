import morgan from 'morgan';
import logger from '../utils/logger';
import { Request, Response, NextFunction } from 'express';

// Stream for morgan to use
const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};

export const requestLogger = morgan(':remote-addr :method :url :status :res[content-length] - :response-time ms', { stream });

// Small middleware to attach request id (optional)
export function attachRequestId(req: Request, res: Response, next: NextFunction) {
  req.headers['x-request-id'] = req.headers['x-request-id'] || String(Date.now()) + Math.random().toString(36).slice(2, 8);
  next();
}
