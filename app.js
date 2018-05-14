const firebase = require('./src/firebase');
const log = require('./src/logger');
const stringifyJSONIntegers = require('./src/utils').stringifyJSONIntegers;
const hash = require('./src/utils').hash;
const getRecentPosts = require('thmmy').getRecentPosts;
const login = require('thmmy').login;
const config = require('./config/config.json');

const cooldown = 10000;  //Cooldown before next data fetch
let nIterations = 0;

let cookieJar;
let postsHash;

let latestTimestamp, latestPostId;

main();

async function main() {
    try{
        log.verbose('Initializing app...');
        await firebase.init();
        cookieJar = await login(config.thmmyUsername, config.thmmyPassword);
        let posts = await getRecentPosts({cookieJar:cookieJar});
        postsHash = hash(JSON.stringify(posts));
        latestTimestamp = posts[0].timestamp;
        latestPostId = posts[0].postId;
        log.info('App started!');
        await fetch();
    }
    catch (e) {
        log.error(e);
    }
}

async function fetch() {
    nIterations++;
    log.verbose('Current iteration: ' + nIterations);

    try{
        let posts = await getRecentPosts({cookieJar:cookieJar});
        if(posts && posts.length>0)
        {
            let currentHash = hash(JSON.stringify(posts));
            if(currentHash!==postsHash)
            {
                log.verbose('Got a new hash...');
                postsHash = currentHash;
                let newPosts = posts.filter(post =>(post.timestamp>=latestTimestamp && post.postId>latestPostId));
                if(newPosts.length>0)
                {
                    log.verbose('Found ' + newPosts.length+ ' new post(s)!');
                    newPosts.forEach(function(post) {
                        if(post.timestamp>latestTimestamp)
                            latestTimestamp = post.timestamp;
                        if(post.postId>latestPostId)
                            latestPostId = post.postId;
                        stringifyJSONIntegers(post);
                    });

                    log.verbose('Sending to Firebase...');
                    for(let i=0; i<newPosts.length; i++)
                        firebase.send(newPosts[newPosts.length-i-1]);
                }
                else
                    log.verbose('...but no new posts.');
            }
            else
                log.verbose('No new posts.');
        }
    }
    catch (e){
        log.error(e);
    }

    log.verbose('Cooling down...');
    setTimeout(fetch, cooldown);
}
