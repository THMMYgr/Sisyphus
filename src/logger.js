import { createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';
import moment from 'moment-timezone';
import fs from 'fs';

const logDir = 'log';

export const LOG_LEVEL_VERBOSE = 'verbose';
export const LOG_LEVEL_INFO = 'info';

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const { combine, printf } = format;

const logFormat = printf(info => `[${info.timestamp}] [${info.level}] ${info.tag}: ${info.message}`);

const appendTimestamp = format((info, opts) => {
  if (opts.tz) info.timestamp = moment().tz(opts.tz).format();
  return info;
});

const logLevel = process.env.LOG_LEVEL || LOG_LEVEL_INFO;

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
  handleExceptions: true,
  exitOnError: false
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    level: 'debug',
    format: combine(
      format.colorize(),
      appendTimestamp({
        tz: 'Europe/Athens'
      }),
      logFormat
    ),
    handleExceptions: true
  }));
} else {
  logger.add(new transports.Console({
    level: logLevel,
    format: combine(
      format.colorize(),
      appendTimestamp({
        tz: 'Europe/Athens'
      }),
      logFormat
    ),
    handleExceptions: true
  }));
}

process.on('unhandledRejection', reason => {
  logger.error(reason);
  process.exit(1);
});

export default logger;
