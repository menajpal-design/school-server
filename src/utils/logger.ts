import winston from 'winston';

const { combine, timestamp, printf, splat, json } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  return `${ts} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
});

const level = process.env.LOG_LEVEL || 'info';

const transports: winston.transport[] = [];

transports.push(new winston.transports.Console({ level }));

// Optional file logging in production (disabled on serverless environments like Vercel/AWS Lambda where disk is read-only)
if ((process.env.NODE_ENV || '').toLowerCase() === 'production' && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  try {
    transports.push(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
    transports.push(new winston.transports.File({ filename: 'logs/combined.log', level: level }));
  } catch (err) {
    console.warn('File logging disabled:', err);
  }
}

const logger = winston.createLogger({
  level,
  format: combine(timestamp(), splat(), json(), logFormat),
  transports,
});

export default logger;
