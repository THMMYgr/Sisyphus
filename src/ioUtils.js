import fs from 'node:fs';
import path from 'node:path';
import moment from 'moment-timezone';
import logger from './logger.js';

const log = logger.child({
  tag: 'IOUtils'
});

const defaultConfigPath = './config/config.json';
const defaultFirebaseConfigPath = './config/firebaseConfig.json';
const defaultThmmyCredentialsPath = './config/thmmyCredentials.json';
const defaultServiceAccountKeyPath = './config/serviceAccountKey.json';

const dockerConfigPath = '/sisyphus-config';
const dockerFirebaseConfigPath = '/sisyphus-firebase-config';
const dockerSecretThmmyCredentialsPath = '/run/secrets/sisyphus-thmmy-credentials';
const dockerSecretServiceAccountKeyPath = '/run/secrets/sisyphus-service-account-key';

const outDir = './out';
const recentPostsFile = 'recent_posts.json';
const topicsToBeMarkedFile = 'topics_to_be_marked.json';

function readJSONFile(filePath) {
  const data = fs.readFileSync(filePath);
  return JSON.parse(data.toString());
}

function getConfig() {
  return fs.existsSync(dockerConfigPath)
    ? readJSONFile(dockerConfigPath)
    : readJSONFile(defaultConfigPath);
}

function getFirebaseConfig() {
  return fs.existsSync(dockerFirebaseConfigPath)
    ? readJSONFile(dockerFirebaseConfigPath)
    : readJSONFile(defaultFirebaseConfigPath);
}

function getThmmyCredentials() {
  return fs.existsSync(dockerSecretThmmyCredentialsPath)
    ? readJSONFile(dockerSecretThmmyCredentialsPath)
    : readJSONFile(defaultThmmyCredentialsPath);
}

function getServiceAccountKey() {
  return fs.existsSync(dockerSecretServiceAccountKeyPath)
    ? readJSONFile(dockerSecretServiceAccountKeyPath)
    : readJSONFile(defaultServiceAccountKeyPath);
}

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
    if (fs.statSync(filePath))
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    if (error.code !== 'ENOENT')
      log.warn(`Error reading topics-to-be-marked-as-unread backup: ${error}`);
  }
  return [];
}

export {
  readJSONFile,
  getConfig,
  getFirebaseConfig,
  getThmmyCredentials,
  getServiceAccountKey,
  writePostsToFile,
  writeTopicsToBeMarkedToFile,
  clearBackedUpTopicsToBeMarked,
  getTopicsToBeMarked
};
