import express from 'express';
import logger from './logger.js';
import { TYPE_POSTS, TYPE_STATUS } from './constants.js';

const log = logger.child({ tag: 'Server' });

let app;
const port = process.env.PORT || 3000;

let posts = [], status = {};

function startServer(worker) {
  app = express();

  // TODO: Add healthcheck
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
    log.info(`Posts endpoint is available at http://localhost:${port}/posts`);
    log.info(`Status endpoint is available at http://localhost:${port}/status`);
  });

  worker.on('message', message => {
    const { type, data } = message;
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
