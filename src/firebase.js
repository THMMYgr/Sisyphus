/* eslint-disable */
// https://github.com/import-js/eslint-plugin-import/issues/1810
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
/* eslint-enable */

import moment from 'moment-timezone';

import isOnline from 'is-online';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';
import { getFirebaseConfig, getServiceAccountKey } from './ioUtils.js';
import logger from './logger.js';

const {
  firestoreSisyphusCollection,
  firestoreSisyphusStatusDocument,
  firestoreVersionField,
  firestoreModeField,
  firestoreStartUpTimeField,
  firestoreStatusUpdateTimeField,
  firestoreThmmyOnlineField,
  firestoreLatestSuccessfulIterationTimeField,
  firestoreNumberOfIterationsField,
  firestoreNumberOfTopicNotificationsField,
  firestoreNumberOfBoardNotificationsField,
  firestoreThmmyCollection,
  firestoreRecentPostsDocument,
  firestorePostsField,
  firestoreStatusUpdateIntervalField,
  firestoreStatusUpdateIntervalValue
} = getFirebaseConfig();

const serviceAccount = getServiceAccountKey();

const log = logger.child({ tag: 'Firebase' });
const reachableCheckCooldown = 2000;

let sisyphusStatusDocRef, recentPostsDocRef; // Firestore document references
let messaging;

let workerStatus;

let topicMessageId = 0, boardMessageId = 0;
let nTopicMessages = 0, nBoardMessages = 0;

async function init(status) {
  const app = initializeApp({
    credential: cert(serviceAccount)
  });

  const firestore = getFirestore(app);
  messaging = getMessaging(app);

  sisyphusStatusDocRef = firestore.collection(firestoreSisyphusCollection).doc(firestoreSisyphusStatusDocument);
  recentPostsDocRef = firestore.collection(firestoreThmmyCollection).doc(firestoreRecentPostsDocument);

  // If worker passes initial status, Initialize Firebase status updater
  if (status) {
    workerStatus = status;
    setImmediate(statusUpdater);
  }

  log.info(`Initialization successful for project ${serviceAccount.project_id}!`);
}

function sendMessage(topic, post) {
  const isTopicMessage = !topic.includes('b');
  const messageInfo = isTopicMessage
    ? `TOPIC message (topicMessageId: ${++topicMessageId}, topicId: ${post.topicId}, postId: ${post.postId})`
    : `BOARD message (boardMessageId: ${++boardMessageId}, boardId: ${post.boardId}, `
    + `topicId: ${post.topicId}, postId: ${post.postId})`;

  messaging.sendToTopic(`/topics/${topic}`, {
    data: post
  }, {
    priority: 'high'
  })
    .then(response => {
      isTopicMessage ? nTopicMessages++ : nBoardMessages++;
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

  const latestPostId = posts.length > 0 ? posts[0].postId : -1;

  recentPostsDocRef.set({ [firestorePostsField]: posts })
    .then(() => {
      log.info(`Successfully written ${posts.length} recent posts to Firestore (latest postID: ${latestPostId})!`);
    })
    .catch(error => {
      logFirebaseError(error, 'Error while writing recent posts to Firestore');
    });
}

async function saveStatus() {
  const {
    version,
    mode,
    startUpTimestamp,
    thmmyOnline,
    nIterations,
    latestSuccessfulIterationTimestamp
  } = workerStatus;

  try {
    const latestSuccessfulIterationTime = latestSuccessfulIterationTimestamp
      ? moment.tz(latestSuccessfulIterationTimestamp, 'Europe/Athens').format()
      : null;
    await sisyphusStatusDocRef.set(
      {
        [firestoreVersionField]: version,
        [firestoreModeField]: mode,
        [firestoreStartUpTimeField]: moment.tz(startUpTimestamp, 'Europe/Athens').format(),
        [firestoreStatusUpdateTimeField]: moment.tz('Europe/Athens').format(),
        [firestoreThmmyOnlineField]: thmmyOnline,
        [firestoreLatestSuccessfulIterationTimeField]: latestSuccessfulIterationTime,
        [firestoreNumberOfIterationsField]: nIterations,
        [firestoreNumberOfTopicNotificationsField]: nTopicMessages,
        [firestoreNumberOfBoardNotificationsField]: nBoardMessages,
        [firestoreStatusUpdateIntervalField]: firestoreStatusUpdateIntervalValue
      },
      { merge: true }
    );
    log.verbose('Successfully written updated status fields to Firestore!');
  } catch (error) {
    logFirebaseError(error, 'Error while writing updated status fields to Firestore.');
  }
}

async function statusUpdater() {
  if (!await isOnline()) {
    log.error('No connection to the Internet! Waiting to be restored...');
    while (!await isOnline())
      await setTimeoutPromise(reachableCheckCooldown);
  }
  await saveStatus();
  setTimeout(statusUpdater, firestoreStatusUpdateIntervalValue);
}

function logFirebaseError(error, message) {
  log.error(message);
  (error.errorInfo && error.errorInfo.code)
    ? log.error(`${error.errorInfo.code}`)
    : log.error(`${error}`);
}

export { init, sendMessage, savePosts, saveStatus };
