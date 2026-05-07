import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const logDir = process.env.LOG_DIR || 'logs';
const logLevel = process.env.LOG_LEVEL || 'info';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

// Custom format for console (more readable during development)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0 && level !== 'error') {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  }),
);

// Daily Rotate File Transport for all logs
const fileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
});

// Daily Rotate File Transport for error logs only
const errorFileTransport = new winston.transports.DailyRotateFile({
  level: 'error',
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
});

const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  transports: [
    fileTransport,
    errorFileTransport,
  ],
  exitOnError: false,
});

logger.add(new winston.transports.Console({
  format: consoleFormat,
}));

export default logger;
