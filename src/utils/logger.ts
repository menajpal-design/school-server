import winston from 'winston';

const { combine, timestamp, printf, splat, json } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  return `${ts} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
});

const level = process.env.LOG_LEVEL || 'info';

const transports: winston.transport[] = [];

transports.push(new winston.transports.Console({ level }));

// Optional file logging in production
if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
  transports.push(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  transports.push(new winston.transports.File({ filename: 'logs/combined.log', level: level }));
}

const logger = winston.createLogger({
  level,
  format: combine(timestamp(), splat(), json(), logFormat),
  transports,
});

export default logger;
