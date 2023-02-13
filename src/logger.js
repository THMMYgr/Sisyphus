import { createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';
import moment from 'moment-timezone';
import fs from 'fs';

const logDir = 'log';

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const { combine, printf } = format;

const logFormat = printf(info => `[${info.timestamp}] [${info.level}] ${info.tag || 'Process'}: ${info.message}`);

const appendTimestamp = format((info, opts) => {
  if (opts.tz) info.timestamp = moment().tz(opts.tz).format();
  return info;
});

const logLevel = process.env.LOG_LEVEL || 'verbose';

const logger = createLogger({
  level: logLevel,
  format: combine(
    appendTimestamp({
      tz: 'Europe/Athens'
    }),
    logFormat
  ),
  defaultMeta: {
    service: 'sisyphus'
  },
  transports: [
    new transports.DailyRotateFile({
      filename: 'Sisyphus-%DATE%-info.log',
      dirname: logDir,
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '30d'
    })
  ],
  exceptionHandlers: [
    new transports.DailyRotateFile({
      filename: 'Sisyphus-%DATE%-exceptions.log',
      dirname: logDir,
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '30d'
    })
  ],
  handleExceptions: true
});

logger.add(new transports.Console({
  level: process.env.NODE_ENV === 'production' ? logLevel : 'debug',
  format: combine(
    format.colorize(),
    appendTimestamp({
      tz: 'Europe/Athens'
    }),
    logFormat
  ),
  handleExceptions: true
}));

process.on('exit', code => {
  if (code !== 130 && code !== 143) {
    const logLevel = code === 0 ? 'info' : 'error';
    const exitMessage = code || code === 0 ? `Exiting with code ${code}...` : 'Exiting...';
    try {
      logger.log(logLevel, exitMessage);
      logger.end();
    } finally { /* Some transport apparently failed... Oh well... */ }
  }
});

process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

function handleSignal(signal) {
  try {
    logger.error(`Received ${signal} signal! Exiting...`);
    logger.end();
  } finally {
    // This explicit process.ext is probably needed (https://nodejs.org/api/process.html#signal-events)
    process.exit(signal === 'SIGINT' ? 130 : 143);
  }
}

export default logger;
