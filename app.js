import { performance } from 'perf_hooks';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';
import { getUnreadPosts, getTopicBoards, login, getSesc, markTopicAsUnread } from 'thmmy';
import isReachable from 'is-reachable';

import * as firebase from './src/firebase.js';
import logger from './src/logger.js';
import { hash, stringifyJSONValues } from './src/utils.js';

import {
  readJSONFile,
  getConfig,
  getThmmyCredentials,
  writePostsToFile,
  getTopicsToBeMarked,
  writeTopicsToBeMarkedToFile,
  clearBackedUpTopicsToBeMarked
} from './src/ioUtils.js';

const { version } = readJSONFile('./package.json');

const {
  statusUpdateInterval,
  loopCooldown,
  extraBoards,
  recentPostsLimit,
  savePostsToFile
} = getConfig();

const {
  thmmyUsername,
  thmmyPassword
} = getThmmyCredentials();

const log = logger.child({ tag: 'App' });
const mode = (process.env.NODE_ENV === 'production') ? 'production' : 'development';
const reachableCheckCooldown = 2000;

let startUpTimestamp, latestSuccessfulIterationTimestamp,
  nIterations = 0, cookieJar, sesc, postsHash, latestPostId, topicIdsToBeMarked = [];

async function init() {
  try {
    startUpTimestamp = +new Date();
    log.info(`Sisyphus v${version} started in ${mode} mode!`);
    await thmmyToBeReachable();
    await firebase.init();
    firebase.saveStartupDateTime(startUpTimestamp);
    log.info('Logging in to thmmy.gr...');
    ({ cookieJar, sesc } = await login(thmmyUsername, thmmyPassword));
    log.info('Login successful!');
    await markBackedUpTopicsAsUnread(); // In case of an unexpected restart
    log.verbose('Fetching initial posts...');
    let posts = await getUnreadPosts(cookieJar, {
      boardInfo: true, unreadLimit: recentPostsLimit
    });
    if (extraBoards.length > 0) {
      const extraPosts = await getUnreadPosts(cookieJar, {
        boardInfo: true, unreadLimit: recentPostsLimit, boards: extraBoards
      });
      posts = mergePosts(posts, extraPosts);
    }
    log.verbose('Initial posts were retrieved successfully and will be saved to Firestore!');
    savePosts(posts); // Save initial posts
    postsHash = hash(JSON.stringify(posts));
    latestPostId = posts.length > 0 ? posts[0].postId : -1;

    setImmediate(statusUpdater);

    log.verbose('Initialization successful!');
  } catch (error) {
    if (!error.code)
      error.code = 'EOTHER';
    log.error(`${error} (${error.code})`);
    process.exit(1);
  }
}

async function main() {
  try {
    await refreshSessionDataIfNeeded();
    await fetchUnreadPosts();
  } catch (error) {
    log.error(`${error}`);
    try {
      await thmmyToBeReachable();
      if (!await refreshSessionDataIfNeeded() && error.code && error.code === 'EINVALIDSESC') {
        sesc = await getSesc(cookieJar); // Refresh sesc
        log.info('Successfully refreshed sesc.');
      }
      await markBackedUpTopicsAsUnread();
    } catch (error) {
      log.error(`${error}`);
      process.exit(2);
    }
  } finally {
    log.verbose(`Cooling down for ${loopCooldown / 1000}s...`);
    setTimeout(main, loopCooldown);
  }
}

function statusUpdater() {
  firebase.saveStatusToFirestore(nIterations, latestSuccessfulIterationTimestamp);
  setTimeout(statusUpdater, statusUpdateInterval);
}

function mergePosts(posts1, posts2) {
  const posts = posts1.concat(posts2);
  posts.sort((a, b) => b.postId - a.postId);
  return (recentPostsLimit < posts.length) ? posts.slice(0, recentPostsLimit) : posts;
}

function savePosts(posts) {
  firebase.savePostsToFirestore(posts);
  if (savePostsToFile) writePostsToFile(posts);
}

// For FCM messages (push notifications)
async function pushToFirebase(newPosts) {
  if (newPosts.length > 0) {
    log.verbose(`Found ${newPosts.length} new post(s)!`);
    newPosts.forEach(post => {
      if (post.postId > latestPostId) latestPostId = post.postId;
      stringifyJSONValues(post);
    });

    newPosts.reverse();

    backupTopicsToBeMarked(newPosts);

    const newBoardPosts = [];
    for (let i = 0; i < newPosts.length; i++) {
      const boards = await getTopicBoards(newPosts[i].topicId, {
        cookieJar
      });
      await markTopicAsUnread(newPosts[i].topicId, cookieJar, {
        sesc
      }); // The line above will mark the topic as read
      boards.forEach(board => {
        let newBoardPost = JSON.parse(JSON.stringify(newPosts[i])); // Deep cloning
        newBoardPost = Object.assign(newBoardPost, board);
        newBoardPost.boardId = newBoardPost.boardId.toString();
        newBoardPost.boardIds = JSON.stringify(boards.map(b => b.boardId));
        newBoardPosts.push(newBoardPost);
      });
    }

    clearBackedUpTopicsToBeMarked(); // Everything was marked as unread successfully and no longer needed

    newPosts.forEach(newPost => {
      firebase.send(newPost.topicId, newPost);
    });

    newBoardPosts.forEach(newBoardPost => {
      firebase.send(`b${newBoardPost.boardId}`, newBoardPost);
    });
  }
}

async function fetchUnreadPosts() {
  nIterations++;
  log.verbose(`Current iteration: ${nIterations}`);
  const tStart = performance.now();
  let posts = await getUnreadPosts(cookieJar, {
    boardInfo: true, unreadLimit: recentPostsLimit
  });

  if (extraBoards.length > 0) {
    const extraPosts = await getUnreadPosts(cookieJar, {
      boardInfo: true, unreadLimit: recentPostsLimit, boards: extraBoards
    });
    posts = mergePosts(posts, extraPosts);
  }

  if (Array.isArray(posts)) {
    const currentHash = hash(JSON.stringify(posts));
    if (currentHash !== postsHash) {
      log.verbose('Got a new hash...');
      savePosts(posts);
      const newPosts = posts.filter(post => post.postId > latestPostId);
      (newPosts.length > 0) ? await pushToFirebase(newPosts) : log.verbose('...but no new posts were found.');
      postsHash = currentHash; // This belongs here to make Sisyphus retry for this hash in case of error
    } else log.verbose('No new posts.');
  } else log.warn('Received malformed posts.');

  latestSuccessfulIterationTimestamp = +new Date();

  const iterationTime = ((performance.now() - tStart) / 1000).toFixed(3);
  log.verbose(`Iteration finished in ${iterationTime} seconds.`);
}

async function isThmmyReachable() {
  return isReachable('thmmy.gr').then(reachable => reachable);
}

async function thmmyToBeReachable() {
  if (!await isThmmyReachable()) {
    log.error('No connection to thmmy.gr!');
    log.info('Waiting to be restored...');
    while (!await isThmmyReachable())
      await setTimeoutPromise(reachableCheckCooldown);
    log.info('Connection to thmmy.gr is restored!');
  }
}

async function refreshSessionDataIfNeeded() {
  if (!cookieJar.getCookieStringSync('https://www.thmmy.gr').includes('THMMYgrC00ki3')) {
    ({ cookieJar, sesc } = await login(thmmyUsername, thmmyPassword)); // Refresh cookieJar & sesc
    log.info('CookieJar and sesc were refreshed.');
    return true;
  }
  return false;
}

// This will be an array to be stored as a backup in case something goes wrong
function backupTopicsToBeMarked(newPosts) {
  topicIdsToBeMarked = newPosts.map(newPost => parseInt(newPost.topicId, 10));
  writeTopicsToBeMarkedToFile(topicIdsToBeMarked);
}

async function markBackedUpTopicsAsUnread() {
  return new Promise(((resolve, reject) => {
    const topicsToBeMarkedAsUnread = getTopicsToBeMarked();
    if (topicsToBeMarkedAsUnread.length > 0) {
      const markTopicAsUnreadPromises = [];

      topicsToBeMarkedAsUnread.forEach(topicId => {
        markTopicAsUnreadPromises.push(markTopicAsUnread(topicId, cookieJar, {
          sesc
        }));
      });

      Promise.all(markTopicAsUnreadPromises)
        .then(() => {
          log.info('Marked backed up topics as unread.');
          clearBackedUpTopicsToBeMarked();
          resolve();
        })
        .catch(error => {
          log.error('Failed to mark backed up topics as unread.');
          reject(error);
        });
    } else resolve();
  }));
}

await init();
setImmediate(main);
