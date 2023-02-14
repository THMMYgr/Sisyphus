import express from 'express';
import logger from './logger.js';
import { TYPE_INFO, TYPE_POSTS, TYPE_STATUS, WORKER_INIT_SUCCESS } from './constants.js';

const log = logger.child({ tag: 'Server' });

let app;
const port = 3000; // TODO: This should be changeable by environment/ Docker

let posts = [], status = {};

function startServer(worker) {
  app = express();

  // TODO: change this to include version, available routes, info
  app.get('/', (req, res) => {
    res.send('Sisyphus API!');
  });

  app.get('/posts', (req, res) => {
    res.send(posts);
  });

  app.get('/status', (req, res) => {
    res.send(status);
  });

  app.listen(port, () => {
    log.verbose(`Initialized and listening on port ${port}!`);
    log.info(`Posts endpoint is available at: http://localhost:${port}/posts`);
    log.info(`Status endpoint is available at: http://localhost:${port}/status`);
  });

  worker.on('message', message => {
    const { data, type } = message;
    if (type === TYPE_POSTS)
      setPosts(data);
    else if (type === TYPE_STATUS)
      setStatus(data);
  });
}

function setPosts(newPosts) {
  posts = newPosts;
}

function setStatus(newStatus) {
  status = newStatus;
}

export default startServer;
