const firebase = require('./src/firebase');
const log = require('./src/logger');
const stringifyJSONIntegers = require('./src/utils').stringifyJSONIntegers;
const hash = require('./src/utils').hash;
const getRecentPosts = require('thmmy').getRecentPosts;

const cooldown = 10000;  //Cooldown before next data fetch

let nIterations = 0;
let postsHash;

const examsResultsTopicId = 70720;

firebase.init();

log.info('App started!');

main();

async function main() {
    nIterations++;
    log.verbose('Current iteration: ' + nIterations);

    try{
        const posts = await getRecentPosts();
        if(posts && posts.length>0)
        {
            let currentPostsHash = hash(JSON.stringify(posts));
            if(currentPostsHash!==postsHash)
            {
                log.verbose('New posts obtained!');
                postsHash = currentPostsHash;
                let examsResultsPost = posts.find(function (post) { return post.topicId === examsResultsTopicId; });
                if(examsResultsPost)
                {
                    log.verbose('Found a new exam result!');
                    stringifyJSONIntegers(examsResultsPost);
                    log.verbose('Sending data to Firebase...');
                    firebase.send(examsResultsPost);
                }
                else
                    log.verbose('No new exam result.');
            }
            else
                log.verbose('No new posts.');
        }
    }
    catch (err){
        log.error(err);
    }

    log.verbose('Cooling down...');
    setTimeout(main, cooldown);
}




