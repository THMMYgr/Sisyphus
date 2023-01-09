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

function sendMessage(topic, post) {
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
      logFirebaseError(error, `Error sending ${messageInfo}`);
    });
}

function savePosts(posts) {
  // Because Firestore doesn't support JavaScript objects with custom prototypes
  // (i.e. objects that were created via the 'new' operator).
  posts = posts.map(post => JSON.parse(JSON.stringify(post)));

  recentPostsDocRef.set({ [firestorePostsField]: posts })
    .then(() => {
      log.info('Successfully written recent posts to Firestore!');
    })
    .catch(error => {
      logFirebaseError(error, 'Error while writing recent posts to Firestore');
    });
}

function saveInitialStatus(version, mode, startUpTimestamp) {
  sisyphusStatusDocRef.set(
    {
      [firestoreVersionField]: version,
      [firestoreModeField]: mode,
      [firestoreStartUpDateTimeField]: moment.tz(startUpTimestamp, 'Europe/Athens').format()
    }
  ).then(() => {
    log.verbose('Successfully written initial status fields to Firestore!');
  }).catch(error => {
    logFirebaseError(error, 'Error while writing initial status fields to Firestore.');
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
    logFirebaseError(error, 'Error while writing updated status fields to Firestore.');
  }
}

function logFirebaseError(error, message) {
  log.error(message);
  (error.errorInfo && error.errorInfo.code)
    ? log.error(`${error.errorInfo.code}`)
    : log.error(`${error}`);
}

export { init, sendMessage, savePosts, saveInitialStatus, saveStatus };
