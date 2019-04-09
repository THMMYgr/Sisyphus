const admin = require('firebase-admin');
const log = require('./logger');

const { firebaseServiceAccountKey, firebaseDatabaseURL, firestoreCollection, firestoreDocument, firestoreField } = require('../config/config.json');

const serviceAccount = require(`../config/${firebaseServiceAccountKey}`);

const reattemptCooldown = 2000;
const maxAttempts = 100;

let docRef; // Firestore document reference

async function init() {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: firebaseDatabaseURL
  });
  log.verbose('Firebase: Initialization successful!');

  docRef = admin.firestore().collection(firestoreCollection).doc(firestoreDocument);
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
    .then((response) => {
      log.info(`Firebase: Successfully sent ${messageInfo} with messageId: ${response.messageId}`);
    })
    .catch((error) => {
      log.error(`Firebase: Error sending ${messageInfo} (attempt ${attempt})`);
      logFirebaseError(error);
      if (attempt < maxAttempts) {
        attempt++;
        log.info(`Firebase: Retrying to send ${messageInfo} in ${reattemptCooldown / 1000}s...`);
        setTimeout(send, reattemptCooldown, topic, post, attempt);
      } else log.error(`Firebase: Maximum number of attempts reached. ${messageInfo} will not be delivered.`);
    });
}

let latestPostsToBeSavedTimestamp = 0;

function saveToFirestore(posts, attempt = 1, timestamp = +new Date()) {
  if (attempt === 1)
    latestPostsToBeSavedTimestamp = timestamp;
  else if (timestamp < latestPostsToBeSavedTimestamp) {
    log.info('Firebase: Document will not be written to Firestore in favor of a newer one.');
    return;
  }

  // Because Firestore doesn't support JavaScript objects with custom prototypes
  // (i.e. objects that were created via the 'new' operator).
  posts = posts.map(post => JSON.parse(JSON.stringify(post)));

  docRef.set({
    [firestoreField]: posts
  })
    .then(() => {
      log.info('Firebase: Firestore document written successfully!');
    })
    .catch((error) => {
      log.error(`Firebase: Firestore error while writing document (attempt ${attempt}).`);
      logFirebaseError(error);
      if (attempt < maxAttempts) {
        attempt++;
        log.info(`Firebase: Retrying to write document to Firestore in ${reattemptCooldown / 1000}s...`);
        setTimeout(saveToFirestore, reattemptCooldown, posts, attempt, timestamp);
      } else
        log.error('Firebase: Maximum number of attempts reached. Document will not be written to Firestore.');
    });
}

function logFirebaseError(error) {
  (error.errorInfo && error.errorInfo.code) ? log.error(`Firebase: ${error.errorInfo.code}`) : log.error(`Firebase: ${error}`);
}

module.exports = {
  init, send, saveToFirestore
};
