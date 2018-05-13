const firebase = require('./src/firebase');
const log = require('./src/logger');
const stringifyJSONIntegers = require('./src/utils').stringifyJSONIntegers;
const hash = require('./src/utils').hash;
const getRecentPosts = require('thmmy').getRecentPosts;
const login = require('thmmy').login;
const config = require('./config/config.json');

const cooldown = 10000;  //Cooldown before next data fetch

let cookieJar;

let nIterations = 0;
let postsHash, posts = [];

main();

async function main() {
    try{
        log.verbose('Initializing app...');
        await firebase.init();
        cookieJar = await login(config.thmmyUsername, config.thmmyPassword);
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
        let newPosts = await getRecentPosts({cookieJar:cookieJar});
        if(newPosts && newPosts.length>0)
        {
            let newPostsHash = hash(JSON.stringify(newPosts));
            if(newPostsHash!==postsHash)
            {
                log.verbose('New posts obtained!');
                const diff = newPosts.filter(function(newPost) {
                    return !posts.some(function(oldPost) {
                        return newPost.postId === oldPost.postId;
                    });
                });
                postsHash = newPostsHash;
                posts = newPosts;
                log.verbose('Sending ' + diff.length + ' new post(s) to Firebase...');
                for(let i=0; i<diff.length; i++)
                    firebase.send(stringifyJSONIntegers(diff[i]));
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
