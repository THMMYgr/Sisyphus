const { version } = require('./package.json');
const { performance } = require('perf_hooks');
const firebase = require('./src/firebase');
const log = require('./src/logger');

const { hash, stringifyJSONValues, isThmmyReachable } = require('./src/utils');
const { writePostsToFile, getTopicsToBeMarked, writeTopicsToBeMarkedToFile, clearBackedUpTopicsToBeMarked } = require('./src/ioUtils');
const { getUnreadPosts, getTopicBoards, login, getSesc, markTopicAsUnread } = require('thmmy');
const { thmmyUsername, thmmyPassword, dataFetchCooldown, extraBoards, recentPostsLimit, savePostsToFile } = require('./config/config.json');

const mode = (process.env.NODE_ENV === 'production') ? 'production' : 'development';
const reachableCheckCooldown = 2000;
let nIterations = 0, cookieJar, sesc, postsHash, latestPostId, topicIdsToBeMarked = [];

main();

async function main() {
    try{
        log.info('App: Sisyphus v' + version + ' started in ' + mode + ' mode!');
        await firebase.init();
        ({ cookieJar, sesc } = await login(thmmyUsername, thmmyPassword));
        const topicsToBeMarkedAsUnread = getTopicsToBeMarked();
        for (let i = 0; i < topicsToBeMarkedAsUnread.length; i++){
            markTopicAsUnread(topicsToBeMarkedAsUnread[i], cookieJar, {sesc: sesc});
            log.info('App: Marked backed up topics as unread.');
        }

        log.verbose('App: Fetching initial posts...');
        let posts = await getUnreadPosts(cookieJar, { boardInfo: true, unreadLimit: recentPostsLimit });
        if(extraBoards.length>0){
            const extraPosts = await getUnreadPosts(cookieJar, { boardInfo: true, unreadLimit: recentPostsLimit, boards: extraBoards });
            posts = mergePosts(posts, extraPosts);
        }
        savePosts(posts);    // Save initial posts
        postsHash = hash(JSON.stringify(posts));
        latestPostId = posts.length > 0 ? posts[0].postId : -1;
        log.verbose('App: Initialization successful!');
    }
    catch (error) {
        if(!error.code) error.code = "EOTHER";
        throw new Error('App: ' + error + "(" + error.code + ")");
    }

    while(true) {
        try{
            await refreshSessionDataIfNeeded();
            await fetch();
            log.verbose('App: Cooling down for ' + dataFetchCooldown/1000 + 's...');
            await new Promise(resolve => setTimeout(resolve, dataFetchCooldown));
        }
        catch (error) {
            log.error('App: ' + error);
            try{
                if(!await isThmmyReachable()){
                    log.error('App: Lost connection to thmmy.gr. Waiting to be restored...');
                    while(!await isThmmyReachable())
                        await new Promise(resolve => setTimeout(resolve, reachableCheckCooldown));
                    log.info('App: Connection to thmmy.gr is restored!');
                }
                if(!await refreshSessionDataIfNeeded() && error.code && error.code === 'EINVALIDSESC'){
                    sesc = await getSesc(cookieJar);    // Refresh sesc
                    log.error('App: sesc was refreshed.');
                }
            }
            catch (error) {
                log.error('App: ' + error);
            }
        }
    }
}

function mergePosts(posts1, posts2) {
    let posts = posts1.concat(posts2);
    posts.sort(function(a, b) {
        return b.postId - a.postId;
    });
    return (recentPostsLimit<posts.length) ? posts.slice(0,recentPostsLimit) : posts;
}

function savePosts(posts){
    firebase.saveToFirestore(posts);
    if(savePostsToFile)
        writePostsToFile(posts);
}

// For FCM messages (push notifications)
async function pushToFirebase(newPosts) {
    if (newPosts.length > 0) {
        log.verbose('App: Found ' + newPosts.length + ' new post(s)!');
        newPosts.forEach(function (post) {
            if (post.postId > latestPostId)
                latestPostId = post.postId;
            stringifyJSONValues(post);
        });

        newPosts.reverse();

        backupTopicsToBeMarked(newPosts);

        let newBoardPosts = [];
        for (let i = 0; i < newPosts.length; i++) {
            let boards = await getTopicBoards(newPosts[i].topicId, {cookieJar: cookieJar});
            await markTopicAsUnread(newPosts[i].topicId, cookieJar, {sesc: sesc});    // The line above will mark is as read
            boards.forEach(function (board) {
                let newBoardPost = JSON.parse(JSON.stringify(newPosts[i]));   // Deep cloning
                newBoardPost = Object.assign(newBoardPost, board);
                newBoardPost.boardId = newBoardPost.boardId.toString();
                newBoardPost.boardIds = JSON.stringify(boards.map(b => b.boardId));
                newBoardPosts.push(newBoardPost);
            });
        }

        clearBackedUpTopicsToBeMarked();    // Everything was marked as unread successfully and no longer needed

        newPosts.forEach(function (newPost) {
            firebase.send(newPost.topicId, newPost);
        });

        newBoardPosts.forEach(function (newBoardPost) {
            firebase.send('b' + newBoardPost.boardId, newBoardPost);
        });
    }
}

async function fetch() {
    nIterations++;
    log.verbose('App: Current iteration: ' + nIterations);
    const tStart = performance.now();
    let posts = await getUnreadPosts(cookieJar, { boardInfo: true, unreadLimit: recentPostsLimit });
    if(extraBoards.length>0){
        const extraPosts = await getUnreadPosts(cookieJar, { boardInfo: true, unreadLimit: recentPostsLimit, boards: extraBoards });
        posts = mergePosts(posts, extraPosts);
    }
    if(posts && posts.length>0) {
        let currentHash = hash(JSON.stringify(posts));
        if(currentHash!==postsHash) {
            log.verbose('App: Got a new hash...');
            savePosts(posts);
            let newPosts = posts.filter(post => post.postId>latestPostId);
            if(newPosts.length>0)
                pushToFirebase(newPosts);
            else
                log.verbose('App: ...but no new posts were found.');

            postsHash = currentHash;    // This belongs here to make Sisyphus retry for this hash in case of error
        }
        else
            log.verbose('App: No new posts.');
    }

    log.verbose("App: Iteration finished in " + ((performance.now() - tStart)/1000).toFixed(3) + " seconds.")
}

async function refreshSessionDataIfNeeded(){
    if(!cookieJar.getCookieString('https://www.thmmy.gr').includes('THMMYgrC00ki3')) {
        ({ cookieJar, sesc } = await login(thmmyUsername, thmmyPassword));    // Refresh cookieJar & sesc
        log.info('App: CookieJar and sesc were refreshed.');
        return true;
    }
    return false;
}

// This will be an array to be stored as a backup in case something goes wrong
function backupTopicsToBeMarked(newPosts){
    topicIdsToBeMarked = newPosts.map(function (newPost) {
        return parseInt(newPost.topicId);
    });
    writeTopicsToBeMarkedToFile(topicIdsToBeMarked);
}
