const firebase = require('./src/firebase');
const log = require('./src/logger');
const stringifyJSONIntegers = require('./src/utils').stringifyJSONIntegers;
const hash = require('./src/utils').hash;
const getRecentPosts = require('thmmy').getRecentPosts;
const login = require('thmmy').login;
const config = require('./config/config.json');

const cooldown = config.dataFetchCooldown;  //Cooldown before next data fetch

let nIterations = 0;

let cookieJar;
let postsHash;

let latestPostId;

main();

async function main() {
    try{
        log.verbose('Initializing app...');
        await firebase.init();
        cookieJar = await login(config.thmmyUsername, config.thmmyPassword);
        let posts = await getRecentPosts({cookieJar: cookieJar});
        postsHash = hash(JSON.stringify(posts));
        latestPostId = posts[0].postId;
        log.info('App started!');
    }
    catch (e) {
        log.error(e);
    }

    while(true)
    {
        try {
            await fetch();
            log.verbose('Cooling down...');
            await new Promise(resolve => setTimeout(resolve, cooldown));
        }
        catch (e) {
            log.error(e);
        }
    }
}

async function fetch() {
    nIterations++;
    log.verbose('Current iteration: ' + nIterations);
    let posts = await getRecentPosts({cookieJar:cookieJar});
    if(posts && posts.length>0)
    {
        let currentHash = hash(JSON.stringify(posts));
        if(currentHash!==postsHash)
        {
            log.verbose('Got a new hash...');
            postsHash = currentHash;
            let newPosts = posts.filter(post => post.postId>latestPostId);
            if(newPosts.length>0)
            {
                log.verbose('Found ' + newPosts.length+ ' new post(s)!');
                newPosts.forEach(function(post) {
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
