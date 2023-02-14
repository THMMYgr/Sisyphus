import { Worker } from 'node:worker_threads';
import logger from './src/logger.js';
import './src/exitHandlers.js';
import startServer from './src/server.js';
import { TYPE_INFO, TYPE_POSTS, TYPE_STATUS, WORKER_INIT_SUCCESS } from './src/constants.js';

const log = logger.child({ tag: 'App' });

const worker = new Worker('./src/worker.js');

worker.once('online', () => {
  log.verbose('Worker is online!');
  worker.postMessage('run');
});

worker.on('message', message => {
  const { data, type } = message;
  if (type === TYPE_INFO && data === WORKER_INIT_SUCCESS){
    log.verbose('Starting Express server...');  //TODO: Make it optional
    startServer(worker);
  }
});

// Terminate main thread when worker exits
worker.on('exit', code => {
  process.exit(code);
});
