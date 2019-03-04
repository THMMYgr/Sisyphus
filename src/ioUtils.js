const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const log = require('./logger');

const outDir = './out';
const recentPostsFile = 'recent_posts.json';
const topicsToBeMarkedFile = 'topics_to_be_marked.json';

function writeToFile(file, dir, data){
    const filePath = path.join(dir, file);
    fs.stat(dir, (error) => {
        if(error){
            if (error.code === 'ENOENT') {
                fs.mkdir(dir, (error) => {
                    if (error) log.error('IOUtils: ' + error);
                    else
                        fs.writeFile(filePath, data, (error) => {
                            if(error) log.error('IOUtils: ' + error);
                        });
                });
            }
            else log.error('IOUtils: ' + error);
        }
        else
            fs.writeFile(filePath, data, (error) => {
                if(error) log.error('IOUtils: ' + error);
            });
    });
}

function writeToFileSync(file, dir, data){
    const filePath = path.join(dir, file);
    try{
        if(fs.statSync(dir))
            fs.writeFileSync(filePath, data);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            try{
                fs.mkdirSync(dir);
                fs.writeFileSync(filePath, data);
            }
            catch (error) {
                log.error('IOUtils: ' + error);
            }
        }
        else log.error('IOUtils: ' + error);
    }
}

function writePostsToFile(posts){
    const data = JSON.stringify({posts, timestamp: moment().unix()}, null, 4);
    writeToFile(recentPostsFile, outDir, data);
}

function writeTopicsToBeMarkedToFile(topicIds){
    writeToFileSync(topicsToBeMarkedFile, outDir, JSON.stringify(topicIds));
}

function clearBackedUpTopicsToBeMarked(){
    writeToFile(topicsToBeMarkedFile, outDir, '[]');
}

function getTopicsToBeMarked(){
    try{
        const filePath = path.join(outDir, topicsToBeMarkedFile);
        if(fs.statSync(filePath)) return JSON.parse(fs.readFileSync(filePath));
    }
    catch (error) {
        if (error.code !== 'ENOENT') log.warn('IOUtils: Error reading topics-to-be-marked-as-unread backup: ' + error);
    }
    return [];
}

module.exports = { writePostsToFile, writeTopicsToBeMarkedToFile, clearBackedUpTopicsToBeMarked, getTopicsToBeMarked };