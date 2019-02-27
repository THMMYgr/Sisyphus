const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const isReachable = require("is-reachable");
const moment = require('moment-timezone');
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
    const data = JSON.stringify({posts, timestamp: moment().unix()}, null, 4);
    writeToFile('recent_posts.json', './out', data);
}

function writeLatestIterationToFile(){
    writeToFile('latest_iteration.json', './out', moment().unix());
}

function writeToFile(file, dir, data){
    const filePath = path.join(dir, file);
    fs.stat(dir, function(error) {
        if(error){
            if (error.code === 'ENOENT') {
                fs.mkdir(dir, (error) => {
                    if (error) log.error('Utils: ' + error);
                    else
                        fs.writeFile(filePath, data, function (error){
                            if(error) log.error('Utils: ' + error);
                        });
                });
            }
            else log.error('Utils: ' + error);
        }
        else
            fs.writeFile(filePath, data, function (error){
                if(error) log.error('Utils: ' + error);
            });
    });
}

module.exports = { hash, stringifyJSONValues, isThmmyReachable, writePostsToFile, writeLatestIterationToFile };
