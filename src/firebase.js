const log = require('./logger');
const admin = require('firebase-admin');
const stringifyJSONValues = require('./utils').stringifyJSONValues;

const config = require('../config/config.json');
const serviceAccount = require('../config/' + config.firebaseServiceAccountKey);

const databaseURL = config.firebaseDatabaseURL;

const reattemptCooldown  = 2000;
const maxAttempts = 15;

async function init(){
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseURL
    });
    log.verbose('Firebase: Initialization successful!');
}


function send(topic, post, attempt=1)  {
    let messageInfo;
    if (!post.boardId)
        messageInfo = 'TOPIC message (topicId, postId)=(' + post.topicId + ', ' + post.postId +')';
    else
        messageInfo = 'BOARD message (boardId, topicId, postId)=(' + post.boardId + ', ' + post.topicId + ', ' + post.postId + ')';

    admin.messaging().sendToTopic('/topics/' + topic, {data: post}, {priority: "high"})
        .then((response) => {
            log.info('Firebase: Successfully sent ' + messageInfo + ' with messageId: ' +  response.messageId);
        })
        .catch((error) => {
            log.error('Firebase: Error sending ' + messageInfo + ' (attempt ' + attempt +')');
            logFirebaseError(error);
            if(attempt < maxAttempts) {
                attempt++;
                log.info('Firebase: Retrying to send ' + messageInfo + ' in ' + reattemptCooldown/1000 + 's...');
                setTimeout(send, reattemptCooldown, topic, post, attempt);
            } else{
                if (!post.boardId)
                    undeliveredNewPosts++;
                log.error('Firebase: Maximum number of attempts reached. ' + messageInfo + ' will not be delivered.');
            }
        });
}

const appStartTimestamp = + new Date();
let undeliveredNewPosts = 0;

function sendStatus(lastErrorTimestamp){
    const data = stringifyJSONValues({timestamp: (+ new Date()),
        lastErrorTimestamp: lastErrorTimestamp, appStartTimestamp: appStartTimestamp, undeliveredNewPosts: undeliveredNewPosts});
    admin.messaging().sendToTopic('/topics/status', {data: data}, {priority: "high"})
        .then((response) => {
            log.verbose('Firebase: Successfully sent STATUS message ' + JSON.stringify(data) + ' with messageId: ' +  response.messageId);
        })
        .catch((error) => {
            log.error('Firebase: Error sending STATUS message ' + JSON.stringify(data));
            logFirebaseError(error);
        });
}


function logFirebaseError(error){
    if(error.errorInfo.code)
        log.error('Firebase: ' + error.errorInfo.code);
    else
        log.error('Firebase: ' + error);
}

module.exports = {
    init,
    send,
    sendStatus
};
