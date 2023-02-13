import logger from './logger.js';

const log = logger.child({ tag: 'Process' });

// Handle 'exit' event
process.on('exit', code => {
  if (code !== 130 && code !== 143) {
    const logLevel = code === 0 ? 'info' : 'error';
    const exitMessage = code || code === 0 ? `Exiting with code ${code}...` : 'Exiting...';
    try {
      log.log(logLevel, exitMessage);
      logger.end();
    } finally { /* Some transport apparently failed... Oh well... */ }
  }
});

// Handle common terminations signals
process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

function handleSignal(signal) {
  try {
    log.error(`Received ${signal} signal! Exiting...`);
    logger.end();
  } finally {
    // This explicit process.exit() is probably needed (https://nodejs.org/api/process.html#signal-events)
    process.exit(signal === 'SIGINT' ? 130 : 143);
  }
}
