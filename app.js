import { performance } from 'perf_hooks';
import { setTimeout } from 'timers/promises';
import { getUnreadPosts, getTopicBoards, login, getSesc, markTopicAsUnread } from 'thmmy';

import * as firebase from './src/firebase.js';
import logger from './src/logger.js';
import { hash, stringifyJSONValues, isThmmyReachable } from './src/utils.js';

import {
  writePostsToFile,
  getTopicsToBeMarked,
  writeTopicsToBeMarkedToFile,
  clearBackedUpTopicsToBeMarked
} from './src/ioUtils.js';

import packageJSON from './package.json' assert {type: 'json'};
import config from './config/config.json' assert {type: 'json'};

const { version } = packageJSON;
const {
  thmmyUsername,
  thmmyPassword,
  healthCheckTimestampUpdateInterval,
  dataFetchCooldown,
  extraBoards,
  recentPostsLimit,
  savePostsToFile
} = config;

const log = logger.child({ tag: 'App' });
const mode = (process.env.NODE_ENV === 'production') ? 'production' : 'development';
const reachableCheckCooldown = 2000;

let nIterations = 0, cookieJar, sesc, postsHash, latestPostId, topicIdsToBeMarked = [];

init().then(() => {
  main();
}).catch(error => {
  log.error(`${error}`);
});

async function init() {
  try {
    log.info(`Sisyphus v${version} started in ${mode} mode!`);
    await firebase.init();
    log.verbose('Logging in to thmmy.gr...');
    ({ cookieJar, sesc } = await login(thmmyUsername, thmmyPassword));
    log.verbose('Login successful!');
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

    healthCheckUpdater();

    log.verbose('Initialization successful!');
  } catch (error) {
    if (!error.code) error.code = 'EOTHER';
    throw new Error(`${error}(${error.code})`);
  }
}

async function healthCheckUpdater(){
  while (true) {
    firebase.saveHealthCheckTimestampToFirestore();
    await setTimeout(healthCheckTimestampUpdateInterval);
  }
}

async function main() {
  while (true) {
    try {
      await refreshSessionDataIfNeeded();
      await fetch();
      log.verbose(`Cooling down for ${dataFetchCooldown / 1000}s...`);
      await setTimeout(dataFetchCooldown);
    } catch (error) {
      log.error(`${error}`);
      try {
        if (!await isThmmyReachable()) {
          log.error('Lost connection to thmmy.gr. Waiting to be restored...');
          while (!await isThmmyReachable())
            await setTimeout(reachableCheckCooldown);
          log.info('Connection to thmmy.gr is restored!');
        }
        if (!await refreshSessionDataIfNeeded() && error.code && error.code === 'EINVALIDSESC') {
          sesc = await getSesc(cookieJar); // Refresh sesc
          log.error('sesc was refreshed.');
        }
        await markBackedUpTopicsAsUnread();
      } catch (error) {
        log.error(`${error}`);
      }
    }
  }
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

async function fetch() {
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

  const iterationTime = ((performance.now() - tStart) / 1000).toFixed(3);
  log.verbose(`Iteration finished in ${iterationTime} seconds.`);
}

async function refreshSessionDataIfNeeded() {
  if (!cookieJar.getCookieString('https://www.thmmy.gr').includes('THMMYgrC00ki3')) {
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
