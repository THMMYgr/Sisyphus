import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import moment from 'moment-timezone';

import { getConfig, getServiceAccountKey } from './ioUtils.js';
import logger, { LOG_LEVEL_VERBOSE, LOG_LEVEL_INFO } from './logger.js';

const {
  firestoreSisyphusCollection,
  firestoreSisyphusStatusDocument,
  firestoreStartUpDateTimeField,
  firestoreStatusUpdateDateTimeField,
  firestoreLatestSuccessfulIterationDateTimeField,
  firestoreNumberOfIterationsField,
  firestoreThmmyCollection,
  firestoreRecentPostsDocument,
  firestorePostsField
} = getConfig();

const serviceAccount = getServiceAccountKey();

const log = logger.child({ tag: 'Firebase' });
const reattemptCooldown = 2000;
const maxAttempts = 100;

let sisyphusStatusDocRef, recentPostsDocRef; // Firestore document references
let messaging;

async function init() {
  const app = initializeApp({
    credential: cert(serviceAccount)
  });

  let firestore = getFirestore(app);
  messaging = getMessaging(app);

  sisyphusStatusDocRef = firestore.collection(firestoreSisyphusCollection).doc(firestoreSisyphusStatusDocument);
  recentPostsDocRef = firestore.collection(firestoreThmmyCollection).doc(firestoreRecentPostsDocument);

  log.info(`Initialization successful for project ${serviceAccount.project_id}!`);
}

function send(topic, post, attempt = 1) {
  let messageInfo;
  if (!topic.includes('b'))
    messageInfo = `TOPIC message (topicId: ${post.topicId}, postId: ${post.postId})`;
  else
    messageInfo = `BOARD message (boardId: ${post.boardId}, topicId: ${post.topicId}, postId: ${post.postId})`;

  messaging.sendToTopic(`/topics/${topic}`, {
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

async function saveFieldToFirestore(docRef, field, data, merge=false, logLevel=LOG_LEVEL_INFO) {
  try {
    await docRef.set({[field]: data}, {merge});
    const message = `Successfully written to Firestore document (id: ${docRef.id}, field: ${field})!`;
    log.log(logLevel,message);
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

function saveStartupDateTime(startUpTimestamp) {
  saveFieldToFirestore(sisyphusStatusDocRef, firestoreStartUpDateTimeField, moment.tz(startUpTimestamp,'Europe/Athens').format(), true, LOG_LEVEL_VERBOSE)
    .catch((error) => {
      log.error(`Error while writing start up dateTime to Firestore.`);
      logFirebaseError(error);
    });
}

function saveStatusToFirestore(nIterations, latestSuccessfulIterationTimestamp) {
  saveFieldToFirestore(sisyphusStatusDocRef, firestoreStatusUpdateDateTimeField, moment.tz('Europe/Athens').format(), true, LOG_LEVEL_VERBOSE)
    .catch((error) => {
      log.error(`Error while writing status update dateTime to Firestore.`);
      logFirebaseError(error);
    });

  saveFieldToFirestore(sisyphusStatusDocRef, firestoreNumberOfIterationsField, nIterations, true, LOG_LEVEL_VERBOSE)
    .catch((error) => {
      log.error(`Error while writing number of iterations to Firestore.`);
      logFirebaseError(error);
    });

  if (latestSuccessfulIterationTimestamp){
    saveFieldToFirestore(sisyphusStatusDocRef, firestoreLatestSuccessfulIterationDateTimeField, moment.tz(latestSuccessfulIterationTimestamp,'Europe/Athens').format(), true, LOG_LEVEL_VERBOSE)
      .catch((error) => {
        log.error(`Error while writing latest successful iteration dateTime to Firestore.`);
        logFirebaseError(error);
      });
  }
}

function logFirebaseError(error) {
  (error.errorInfo && error.errorInfo.code)
    ? log.error(`${error.errorInfo.code}`)
    : log.error(`${error}`);
}

export {
  init, send, savePostsToFirestore, saveStartupDateTime, saveStatusToFirestore
};
