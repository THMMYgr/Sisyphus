const fs = require('fs');
const crypto = require('crypto');
const isReachable = require("is-reachable");
const log = require('./logger');

function hash(string) {
    return crypto.createHash('md5').update(string).digest('hex').substring(0,12);
}

//Helper function (Firebase FCM does not accept integers as JSON values)
function stringifyJSONValues(json) {
    for (let k in json)
        if (json.hasOwnProperty(k))
            json[k] = String(json[k]);

    return json;
}

async function isThmmyReachable() {
    return isReachable('thmmy.gr').then(reachable => {
        return reachable;
    });
}

function writePostsToFile(posts){
    const now = parseInt((+ new Date())/1000);  //Current time in seconds
    fs.writeFile('recent_posts.json', JSON.stringify({posts, timestamp: now}, null, 4), function (error){
        if(error)
            log.error('Utils: ' + error);
        else
            log.verbose('Utils: Posts written to file successfully!');
    });
}

module.exports = { hash, stringifyJSONValues, isThmmyReachable, writePostsToFile };
