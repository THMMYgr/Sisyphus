const {version} = require('./package.json');
const firebase = require('./src/firebase');
const log = require('./src/logger');
const stringifyJSONValues = require('./src/utils').stringifyJSONValues;
const hash = require('./src/utils').hash;
const isThmmyReachable = require('./src/utils').isThmmyReachable;
const getRecentPosts = require('thmmy').getRecentPosts;
const getTopicBoards = require('thmmy').getTopicBoards;
const login = require('thmmy').login;
const config = require('./config/config.json');
const dataFetchCooldown = config.dataFetchCooldown;  //Cooldown before next data fetch

const reachableCheckCooldown = 2000;
let nIterations = 0, cookieJar, postsHash, latestPostId;

main();

async function main() {
    try{
        log.info('App: Sisyphus v' + version + ' started!');
        await firebase.init();
        cookieJar = await login(config.thmmyUsername, config.thmmyPassword);
        let posts = await getRecentPosts({cookieJar: cookieJar});
        postsHash = hash(JSON.stringify(posts));
        latestPostId = posts[0].postId;
        log.verbose('App: Initialization successful!');
    }
    catch (error) {
        throw new Error('App: ' + error);
    }

    while(true) {
        try{
            if(!cookieJar.getCookieString('https://www.thmmy.gr').includes('THMMYgrC00ki3')) {
                cookieJar = await login(config.thmmyUsername, config.thmmyPassword);    // Refresh cookieJar
                log.info('App: CookieJar was refreshed.');
            }
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
            }
            catch (error) {
                log.error('App: ' + error);
            }
        }
    }
}

async function fetch() {
    nIterations++;
    log.verbose('App: Current iteration: ' + nIterations);
    let posts = await getRecentPosts({cookieJar: cookieJar});
    if(posts && posts.length>0) {
        let currentHash = hash(JSON.stringify(posts));
        if(currentHash!==postsHash) {
            log.verbose('App: Got a new hash...');
            firebase.saveToFirestore(posts);
            let newPosts = posts.filter(post => post.postId>latestPostId);
            if(newPosts.length>0) {
                log.verbose('App: Found ' + newPosts.length + ' new post(s)!');
                newPosts.forEach(function(post) {
                    if(post.postId>latestPostId)
                        latestPostId = post.postId;
                    stringifyJSONValues(post);
                });

                newPosts.reverse();

                let newBoardPosts = [];
                for(let i=0; i<newPosts.length; i++) {
                    let boards = await getTopicBoards(newPosts[i].topicId, {cookieJar: cookieJar});
                    boards.forEach(function(board) {
                        let newBoardPost = JSON.parse(JSON.stringify(newPosts[i]));   // Deep cloning
                        newBoardPost = Object.assign(newBoardPost, board);
                        newBoardPost.boardId = newBoardPost.boardId.toString();
                        newBoardPost.boardIds = JSON.stringify(boards.map(b => b.boardId));
                        newBoardPosts.push(newBoardPost);
                    });
                }

                newPosts.forEach(function(newPost) {
                    firebase.send(newPost.topicId, newPost);
                });

                newBoardPosts.forEach(function(newBoardPost) {
                    firebase.send('b'+ newBoardPost.boardId, newBoardPost);
                });
            }
            else
                log.verbose('App: ...but no new posts were found.');

            postsHash = currentHash;    // This belongs here to make Sisyphus retry for this hash in case of error
        }
        else
            log.verbose('App: No new posts.');
    }
}
