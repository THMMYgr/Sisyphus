/* eslint-disable */
// https://github.com/import-js/eslint-plugin-import/issues/1810
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
/* eslint-enable */

import moment from 'moment-timezone';

import { getConfig, getServiceAccountKey } from './ioUtils.js';
import logger from './logger.js';

const {
  firestoreSisyphusCollection,
  firestoreSisyphusStatusDocument,
  firestoreVersionField,
  firestoreModeField,
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

  const firestore = getFirestore(app);
  messaging = getMessaging(app);

  sisyphusStatusDocRef = firestore.collection(firestoreSisyphusCollection).doc(firestoreSisyphusStatusDocument);
  recentPostsDocRef = firestore.collection(firestoreThmmyCollection).doc(firestoreRecentPostsDocument);

  log.info(`Initialization successful for project ${serviceAccount.project_id}!`);
}

function sendMessage(topic, post, attempt = 1) {
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
        setTimeout(sendMessage, reattemptCooldown, topic, post, attempt);
      } else log.error(`Maximum number of attempts reached. ${messageInfo} will not be delivered.`);
    });
}

let latestPostsToBeSavedTimestamp = 0;

function savePosts(posts, attempt = 1, timestamp = +new Date()) {
  if (attempt === 1)
    latestPostsToBeSavedTimestamp = timestamp;
  else if (timestamp < latestPostsToBeSavedTimestamp) {
    log.info('Document will not be written to Firestore in favor of a newer one.');
    return;
  }

  // Because Firestore doesn't support JavaScript objects with custom prototypes
  // (i.e. objects that were created via the 'new' operator).
  posts = posts.map(post => JSON.parse(JSON.stringify(post)));

  recentPostsDocRef.set({ [firestorePostsField]: posts })
    .then(() => {
      log.info('Successfully written recent posts to Firestore!');
    })
    .catch(() => {
      log.error(`Error while writing recent posts to Firestore (attempt ${attempt}).`);
      if (attempt < maxAttempts) {
        attempt++;
        log.info(`Retrying to write document to Firestore in ${reattemptCooldown / 1000}s...`);
        setTimeout(savePosts, reattemptCooldown, posts, attempt, timestamp);
      } else
        log.error('Maximum number of attempts reached. Document will not be written to Firestore.');
    });
}

function saveInitialStatus(version, mode, startUpTimestamp) {
  sisyphusStatusDocRef.set(
    {
      [firestoreVersionField]: version,
      [firestoreModeField]: mode,
      [firestoreStartUpDateTimeField]: moment.tz(startUpTimestamp, 'Europe/Athens').format()
    },
    { merge: true }
  ).then(() => {
    log.verbose('Successfully written initial status fields to Firestore!');
  }).catch(error => {
    log.error('Error while writing initial status fields to Firestore.');
    logFirebaseError(error);
  });
}

async function saveStatus(nIterations, latestSuccessfulIterationTimestamp) {
  try {
    const latestSuccessfulIterationDateTime = latestSuccessfulIterationTimestamp
      ? moment.tz(latestSuccessfulIterationTimestamp, 'Europe/Athens').format()
      : null;
    await sisyphusStatusDocRef.set(
      {
        [firestoreStatusUpdateDateTimeField]: moment.tz('Europe/Athens').format(),
        [firestoreNumberOfIterationsField]: nIterations,
        [firestoreLatestSuccessfulIterationDateTimeField]: latestSuccessfulIterationDateTime
      },
      { merge: true }
    );
    log.verbose('Successfully written updated status fields to Firestore!');
  } catch (error) {
    log.error('Error while writing updated status fields to Firestore.');
    logFirebaseError(error);
  }
}

function logFirebaseError(error) {
  (error.errorInfo && error.errorInfo.code)
    ? log.error(`${error.errorInfo.code}`)
    : log.error(`${error}`);
}

export { init, sendMessage, savePosts, saveInitialStatus, saveStatus };
