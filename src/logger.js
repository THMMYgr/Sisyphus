import { createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';
import moment from 'moment-timezone';
import fs from 'fs';

const logDir = 'log';

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const { combine, printf } = format;

const logFormat = printf(info => `[${info.timestamp}] [${info.level}] ${info.tag}: ${info.message}`);

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

export default logger;
