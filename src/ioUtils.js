import fs from 'fs';
import path from 'path';
import moment from 'moment-timezone';
import logger from './logger.js';

const log = logger.child({
  tag: 'IOUtils'
});
const outDir = './out';
const recentPostsFile = 'recent_posts.json';
const topicsToBeMarkedFile = 'topics_to_be_marked.json';

function writeToFile(file, dir, data) {
  const filePath = path.join(dir, file);
  fs.stat(dir, error => {
    if (error) {
      if (error.code === 'ENOENT') {
        fs.mkdir(dir, error => {
          if (error) log.error(`${error}`);
          else {
            fs.writeFile(filePath, data, error => {
              if (error) log.error(`${error}`);
            });
          }
        });
      } else log.error(`${error}`);
    } else {
      fs.writeFile(filePath, data, error => {
        if (error) log.error(`${error}`);
      });
    }
  });
}

function writeToFileSync(file, dir, data) {
  const filePath = path.join(dir, file);
  try {
    if (fs.statSync(dir)) fs.writeFileSync(filePath, data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      try {
        fs.mkdirSync(dir);
        fs.writeFileSync(filePath, data);
      } catch (error) {
        log.error(`${error}`);
      }
    } else log.error(`${error}`);
  }
}

function writePostsToFile(posts) {
  const data = JSON.stringify({
    posts, timestamp: moment().unix(), humanTime: moment().tz('Europe/Athens').format()
  }, null, 4);
  writeToFile(recentPostsFile, outDir, data);
}

function writeTopicsToBeMarkedToFile(topicIds) {
  writeToFileSync(topicsToBeMarkedFile, outDir, JSON.stringify(topicIds));
}

function clearBackedUpTopicsToBeMarked() {
  writeToFile(topicsToBeMarkedFile, outDir, '[]');
}

function getTopicsToBeMarked() {
  try {
    const filePath = path.join(outDir, topicsToBeMarkedFile);
    if (fs.statSync(filePath)) return JSON.parse(fs.readFileSync(filePath));
  } catch (error) {
    if (error.code !== 'ENOENT') log.warn(`Error reading topics-to-be-marked-as-unread backup: ${error}`);
  }
  return [];
}

export { writePostsToFile, writeTopicsToBeMarkedToFile, clearBackedUpTopicsToBeMarked, getTopicsToBeMarked };
