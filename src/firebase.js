import admin from 'firebase-admin';
import logger from './logger.js';
import config from '../config/config.json' assert {type: 'json'};
import serviceAccount from '../config/serviceAccountKey.json' assert {type: 'json'};

const {
  firestoreSisyphusCollection,
  firestoreSisyphusStatusDocument,
  firestoreHealthCheckTimestampField,
  firestoreThmmyCollection,
  firestoreRecentPostsDocument,
  firestorePostsField
} = config;

const log = logger.child({ tag: 'Firebase' });
const reattemptCooldown = 2000;
const maxAttempts = 100;

let sisyphusStatusDocRef; // Firestore Sisyphus status document reference
let recentPostsDocRef; // Firestore recent posts document reference

async function init() {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  sisyphusStatusDocRef = admin.firestore().collection(firestoreSisyphusCollection).doc(firestoreSisyphusStatusDocument);
  recentPostsDocRef = admin.firestore().collection(firestoreThmmyCollection).doc(firestoreRecentPostsDocument);

  log.info(`Initialization successful for project ${serviceAccount.project_id}!`);
}

function send(topic, post, attempt = 1) {
  let messageInfo;
  if (!topic.includes('b'))
    messageInfo = `TOPIC message (topicId: ${post.topicId}, postId: ${post.postId})`;
  else
    messageInfo = `BOARD message (boardId: ${post.boardId}, topicId: ${post.topicId}, postId: ${post.postId})`;

  admin.messaging().sendToTopic(`/topics/${topic}`, {
    data: post
  }, {
    priority: 'high'
  })
    .then(response => {
      log.info(`Successfully sent ${messageInfo} with messageId: ${response.messageId}`);
    })
    .catch(error => {
      log.error(`Error sending ${messageInfo} (attempt ${attempt})`);
      logFirebaseError(error);
      if (attempt < maxAttempts) {
        attempt++;
        log.info(`Retrying to send ${messageInfo} in ${reattemptCooldown / 1000}s...`);
        setTimeout(send, reattemptCooldown, topic, post, attempt);
      } else log.error(`Maximum number of attempts reached. ${messageInfo} will not be delivered.`);
    });
}

async function saveFieldToFirestore(docRef, field, data) {
  try {
    await docRef.set({[field]: data});
    log.info(`Written successfully to Firestore document (id: ${docRef.id}, field: ${field})!`);
  }
  catch(error) {
    log.error(`Error while writing to Firestore document (id: ${docRef.id}, field: ${field}).`);
    logFirebaseError(error);
    throw(error);
  }
}

let latestPostsToBeSavedTimestamp = 0;

function savePostsToFirestore(posts, attempt = 1, timestamp = +new Date()) {
  if (attempt === 1)
    latestPostsToBeSavedTimestamp = timestamp;
  else if (timestamp < latestPostsToBeSavedTimestamp) {
    log.info('Document will not be written to Firestore in favor of a newer one.');
    return;
  }

  // Because Firestore doesn't support JavaScript objects with custom prototypes
  // (i.e. objects that were created via the 'new' operator).
  posts = posts.map(post => JSON.parse(JSON.stringify(post)));

  saveFieldToFirestore(recentPostsDocRef, firestorePostsField, posts)
    .catch(() => {
      log.error(`Error while writing recent posts document to Firestore (attempt ${attempt}).`);
      if (attempt < maxAttempts) {
        attempt++;
        log.info(`Retrying to write document to Firestore in ${reattemptCooldown / 1000}s...`);
        setTimeout(savePostsToFirestore, reattemptCooldown, posts, attempt, timestamp);
      } else
        log.error('Maximum number of attempts reached. Document will not be written to Firestore.');
    });
}

function saveHealthCheckTimestampToFirestore() {
  saveFieldToFirestore(sisyphusStatusDocRef, firestoreHealthCheckTimestampField, +new Date())
    .catch(() => {
      log.error(`Error while writing current timestamp to Firestore.`);
    });
}

function logFirebaseError(error) {
  (error.errorInfo && error.errorInfo.code)
    ? log.error(`${error.errorInfo.code}`)
    : log.error(`${error}`);
}

export {
  init, send, saveHealthCheckTimestampToFirestore, savePostsToFirestore
};
