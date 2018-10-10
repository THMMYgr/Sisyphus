const {version} = require('./package.json');
const firebase = require('./src/firebase');
const log = require('./src/logger');
const stringifyJSONValues = require('./src/utils').stringifyJSONValues;
const hash = require('./src/utils').hash;
const getRecentPosts = require('thmmy').getRecentPosts;
const getTopicBoards = require('thmmy').getTopicBoards;
const login = require('thmmy').login;
const config = require('./config/config.json');
const cooldown = config.dataFetchCooldown;  //Cooldown before next data fetch

let nIterations = 0;

let cookieJar;
let postsHash;

let latestPostId;

let lastErrorTimestamp;

main();

async function main() {
    try{
        log.info('App: Sisyphus v' + version + ' started!');
        firebase.setAppStartTimestamp(+ new Date());
        log.verbose('App: Initializing...');
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

    while(true)
    {
        try{
            firebase.sendForStatus(lastErrorTimestamp);
            log.verbose('App: Cooling down for ' + cooldown/1000 + 's...');
            await new Promise(resolve => setTimeout(resolve, cooldown));
            await fetch();
        }
        catch (error) {
            log.error('App: ' + error);
            lastErrorTimestamp = + new Date();
        }

    }
}

async function fetch() {
    nIterations++;
    log.verbose('App: Current iteration: ' + nIterations);
    let posts = await getRecentPosts({cookieJar: cookieJar});
    if(posts && posts.length>0)
    {
        let currentHash = hash(JSON.stringify(posts));
        if(currentHash!==postsHash)
        {
            log.verbose('App: Got a new hash...');
            postsHash = currentHash;
            let newPosts = posts.filter(post => post.postId>latestPostId);
            if(newPosts.length>0)
            {
                log.verbose('App: Found ' + newPosts.length + ' new post(s)!');
                newPosts.forEach(function(post) {
                    if(post.postId>latestPostId)
                        latestPostId = post.postId;
                    stringifyJSONValues(post);
                });

                newPosts.reverse();

                let newBoardPosts = [];
                for(let i=0; i<newPosts.length; i++){
                    let boards = await getTopicBoards(newPosts[i].topicId, {cookieJar: cookieJar});
                    boards.forEach(function(board) {
                        let newPostWithBoardInfo = Object.assign(newPosts[i], board);
                        newPostWithBoardInfo.boardId = newPostWithBoardInfo.boardId.toString();
                        newBoardPosts.push(newPostWithBoardInfo);
                    });
                }

                newPosts.forEach(function(newPost) {
                    firebase.sendForTopic(newPost);
                });

                newBoardPosts.forEach(function(newPostWithBoardInfo) {
                    firebase.sendForBoard(newPostWithBoardInfo);
                });
            }
            else
                log.verbose('App: ...but no new posts.');
        }
        else
            log.verbose('App: No new posts.');
    }
}
