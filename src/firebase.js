const log = require('./logger');
const admin = require('firebase-admin');
const stringifyJSONValues = require('./utils').stringifyJSONValues;

const config = require('../config/config.json');
const serviceAccount = require('../config/' + config.firebaseServiceAccountKey);

const databaseURL = config.firebaseDatabaseURL;

const retryBaseCooldown  = 1000;

async function init(){
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseURL
    });
    log.verbose('Firebase: Initialization successful!');
}

function sendForTopic(post, retryCooldown = retryBaseCooldown/2){
    const messageInfo = '(topicId, postId)=(' + post.topicId + ', ' + post.postId +')';
    admin.messaging().sendToTopic('/topics/' + post.topicId, {data: post}, {priority: "high"})
        .then((response) => {
            log.info('Firebase: Successfully sent TOPIC message ' + messageInfo + ' with messageId: ' +  response.messageId);
        })
        .catch((error) => {
            log.error('Firebase: Error sending TOPIC message ' + messageInfo);
            logFirebaseError(error);
            log.info('Firebase: Retrying in ' + (retryCooldown*2)/1000 +'s...');
            setTimeout(sendForTopic, retryCooldown*2, post, retryCooldown*2);

        });
}

function sendForBoard(post, retryCooldown = retryBaseCooldown/2){
    const messageInfo = '(boardId, topicId, postId)=(' + post.boardId + ', ' + post.topicId + ', ' + post.postId + ')';
    admin.messaging().sendToTopic('/topics/b' + post.boardId, {data: post}, {priority: "high"})
        .then((response) => {
            log.info('Firebase: Successfully sent BOARD message ' + messageInfo + ' with messageId: ' +  response.messageId);
        })
        .catch((error) => {
            log.error('Firebase: Error sending BOARD message ' + messageInfo);
            logFirebaseError(error);
            log.info('Firebase: Retrying in ' + (retryCooldown*2)/1000 +'s...');
            setTimeout(sendForBoard, retryCooldown*2, post, retryCooldown*2);
        });
}

function sendForStatus(lastErrorTimestamp){
    const data = stringifyJSONValues({timestamp: (+ new Date()), lastErrorTimestamp: lastErrorTimestamp, appStartTimestamp: appStartTimestamp});
    admin.messaging().sendToTopic('/topics/status', {data: data}, {priority: "high"})
        .then((response) => {
            log.verbose('Firebase: Successfully sent STATUS message ' + JSON.stringify(data) + ' with messageId: ' +  response.messageId);
        })
        .catch((error) => {
            log.error('Firebase: Error sending STATUS message ' + JSON.stringify(data));
            logFirebaseError(error);
        });
}

let appStartTimestamp;

function setAppStartTimestamp(timestamp){appStartTimestamp=timestamp;}

function logFirebaseError(error){
    if(error.errorInfo.code)
        log.error('Firebase: ' + error.errorInfo.code);
    else
        log.error('Firebase: ' + error);
}

module.exports = {
    init,
    sendForTopic,
    sendForBoard,
    sendForStatus,
    setAppStartTimestamp
};