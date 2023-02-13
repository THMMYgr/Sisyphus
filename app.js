import { Worker } from 'node:worker_threads';
import logger from './src/logger.js';
import './src/exitHandlers.js';

const log = logger.child({ tag: 'App' });

const worker = new Worker('./src/worker.js');

worker.once('online', () => {
  log.verbose('Worker is online!');
  worker.postMessage('run');
});

// Terminate main thread when worker exits
worker.on('exit', code => {
  process.exit(code);
});
