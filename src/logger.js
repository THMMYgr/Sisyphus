const { createLogger, format, transports } = require('winston');
const moment = require('moment-timezone');
const fs = require( 'fs' );
const path = require('path');
const logDir = 'log';

if (!fs.existsSync(logDir))
    fs.mkdirSync(logDir);

const { combine, timestamp, printf } = format;

const logFormat = printf(info => {
    return `[${info.timestamp}] ${info.level}: ${info.message}`;
});

const appendTimestamp = format((info, opts) => {
    if(opts.tz)
        info.timestamp = moment().tz(opts.tz).format();
    return info;
});

let logger = createLogger({
    level: 'info',
    format: combine(
        appendTimestamp({tz: 'Europe/Athens'}),
        logFormat
    ),
    transports: [
        new transports.File({filename: path.join(logDir, '/info.log')})
    ],
    exceptionHandlers: [
        new transports.File({ filename: path.join(logDir, '/exceptions.log') })
    ],
    handleExceptions: true,
    exitOnError: false
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new transports.Console({
        level: 'debug',
        handleExceptions: true,
    }));
}

logger.verbose('Logger initialized.');

module.exports = logger;
