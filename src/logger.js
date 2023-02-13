import { isMainThread } from 'node:worker_threads';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';
import { createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';
import moment from 'moment-timezone';
import fs from 'fs';

const logDir = 'log';

if (isMainThread) {
  if (!fs.existsSync(logDir))
    fs.mkdirSync(logDir);
} else {
  // Wait for the main thread to create log directory
  while (!fs.existsSync(logDir))
    await setTimeoutPromise(100);
}

const logLevel = process.env.LOG_LEVEL || 'verbose';

const logTag = isMainThread ? 'Process' : 'Worker';
const fileNameProp = isMainThread ? 'app' : 'worker';

const { combine, printf } = format;

const logFormat = printf(info => `[${info.timestamp}] [${info.level}] ${info.tag || logTag}: ${info.message}`);

const appendTimestamp = format((info, opts) => {
  if (opts.tz) info.timestamp = moment().tz(opts.tz).format();
  return info;
});

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
      filename: `Sisyphus-%DATE%-${fileNameProp}-info.log`,
      dirname: logDir,
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '30d'
    })
  ],
  exceptionHandlers: [
    new transports.DailyRotateFile({
      filename: `Sisyphus-%DATE%-${fileNameProp}-exceptions.log`,
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

export default logger;
