import { performance } from 'perf_hooks';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';
import {
  getUnreadPosts,
  getTopicBoards,
  login,
  getSesc,
  markTopicAsUnread,
  isThmmyCookieExistent,
  isForumReachable,
  setErrorCode,
  EINVALIDSESC
} from 'thmmy';
import isOnline from 'is-online';

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
  firestoreStatusEnabled,
  statusUpdateCooldown,
  pollingCooldown,
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
    if (firestoreStatusEnabled)
      firebase.saveInitialStatus(version, mode, startUpTimestamp);
    log.info(`Logging in to thmmy.gr as ${thmmyUsername}...`);
    ({ cookieJar, sesc } = await login(thmmyUsername, thmmyPassword));
    log.info('Login successful!');
    await markBackedUpTopicsAsUnread(); // In case of an unexpected restart
    if (firestoreStatusEnabled)
      setTimeout(statusUpdater, statusUpdateCooldown);
    log.verbose('Initialization successful!');
  } catch (error) {
    setErrorCode(error);
    log.error(`${error} (${error.code})`);
    process.exit(2);
  }
}

async function main() {
  try {
    nIterations++;
    log.verbose(`Current iteration: ${nIterations}`);
    await refreshSessionDataIfNeeded();
    const tStart = performance.now();
    await retrievePosts();
    latestSuccessfulIterationTimestamp = +new Date();
    const iterationTime = ((performance.now() - tStart) / 1000).toFixed(3);
    log.verbose(`Iteration finished in ${iterationTime} seconds.`);
  } catch (error) {
    log.error(`${error}`);
    try {
      await thmmyToBeReachable();
      if (!await refreshSessionDataIfNeeded() && error.code && error.code === EINVALIDSESC) {
        sesc = await getSesc(cookieJar); // Refresh sesc
        log.info('Successfully refreshed sesc.');
      }
      await markBackedUpTopicsAsUnread();
    } catch (error) {
      log.error(`${error}`);
      process.exit(3);
    }
  } finally {
    log.verbose(`Cooling down for ${pollingCooldown / 1000}s...`);
    setTimeout(main, pollingCooldown);
  }
}

async function retrievePosts() {
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
    log.verbose(`Successfully retrieved ${posts.length} posts!`);
    if (nIterations === 1) {
      savePosts(posts);
      postsHash = hash(JSON.stringify(posts));
      latestPostId = posts.length > 0 ? posts[0].postId : -1;
    } else {
      const currentHash = hash(JSON.stringify(posts));
      if (currentHash !== postsHash) {
        log.verbose('Got a new hash...');
        savePosts(posts);
        const newPosts = posts.filter(post => post.postId > latestPostId);
        if (newPosts.length > 0) {
          newPosts.forEach(post => {
            if (post.postId > latestPostId)
              latestPostId = post.postId;
          });
          await pushNewPostsToFirebase(newPosts);
        } else
          log.verbose('...but no new posts were found.');
        postsHash = currentHash; // This belongs here to make Sisyphus retry for this hash in case of error
      } else
        log.verbose('No new posts.');
    }
  } else
    log.error('Received malformed posts!');
}

function savePosts(posts) {
  // Log this case, as it should probably be investigated
  if (posts.length === 0)
    log.warn('An empty array of posts will be saved!');
  firebase.savePosts(posts);
  if (savePostsToFile)
    writePostsToFile(posts);
}

// For FCM messages (push notifications)
async function pushNewPostsToFirebase(newPosts) {
  if (newPosts.length > 0) {
    log.verbose(`Found ${newPosts.length} new post(s)!`);
    newPosts.forEach(post => {
      stringifyJSONValues(post);
    });

    newPosts.reverse();

    backupTopicsToBeMarked(newPosts);

    const newBoardPosts = [];
    for (let i = 0; i < newPosts.length; i++) {
      // We need all the topic's boards, but, unfortunately, this will also mark the topic as read
      const boards = await getTopicBoards(newPosts[i].topicId, { cookieJar });
      // We mark the topic as unread again
      await markTopicAsUnread(newPosts[i].topicId, cookieJar, { sesc });
      boards.forEach(board => {
        let newBoardPost = JSON.parse(JSON.stringify(newPosts[i])); // Deep cloning
        newBoardPost = Object.assign(newBoardPost, board);
        newBoardPost.boardId = newBoardPost.boardId.toString();
        newBoardPost.boardIds = JSON.stringify(boards.map(b => b.boardId));
        newBoardPosts.push(newBoardPost);
      });
    }
    // Everything was marked as unread successfully and no longer needed
    clearBackedUpTopicsToBeMarked();

    newPosts.forEach(newPost => {
      firebase.sendMessage(newPost.topicId, newPost);
    });

    newBoardPosts.forEach(newBoardPost => {
      firebase.sendMessage(`b${newBoardPost.boardId}`, newBoardPost);
    });
  }
}

// ---------- BACKED UP TOPICS ----------

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

// ---------- STATUS UPDATER ----------
async function statusUpdater() {
  if (!await isOnline()) {
    log.error('No connection to the Internet! Waiting to be restored...');
    while (!await isOnline())
      await setTimeoutPromise(reachableCheckCooldown);
  }
  await firebase.saveStatus(nIterations, latestSuccessfulIterationTimestamp);
  setTimeout(statusUpdater, statusUpdateCooldown);
}

// ---------- THMMY UTILS ----------
async function refreshSessionDataIfNeeded() {
  if (!isThmmyCookieExistent(cookieJar)) {
    ({ cookieJar, sesc } = await login(thmmyUsername, thmmyPassword)); // Refresh cookieJar & sesc
    log.info('CookieJar and sesc were refreshed.');
    return true;
  }
  return false;
}

async function thmmyToBeReachable() {
  if (!await isForumReachable()) {
    log.error('No connection to thmmy.gr! Waiting to be restored...');
    while (!await isForumReachable())
      await setTimeoutPromise(reachableCheckCooldown);
    log.info('Connection to thmmy.gr is restored!');
  }
}

// ---------- MISC ----------
function mergePosts(posts1, posts2) {
  const posts = posts1.concat(posts2);
  posts.sort((a, b) => b.postId - a.postId);
  return (recentPostsLimit < posts.length) ? posts.slice(0, recentPostsLimit) : posts;
}

await init();
setImmediate(main);
