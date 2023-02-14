import express from 'express';
import logger from './logger.js';

const log = logger.child({ tag: 'Server' });

const app = express();
const port = 3000; // TODO: This should be changable by environment/ Docker

let status;

// TODO: change this, also add /recent route
app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/status', (req, res) => {
  res.send(status);
});

app.listen(port, () => {
  log.info(`Listening on port ${port}!`);
});

function writeStatus(newStatus) {
  status = newStatus;
}

export { writeStatus };
