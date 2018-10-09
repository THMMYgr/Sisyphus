const log = require('./logger');
const admin = require('firebase-admin');

const config = require('../config/config.json');
const serviceAccount = require('../config/' + config.firebaseServiceAccountKey);

const databaseURL = config.firebaseDatabaseURL;

const maxAttempts  = 10;
const reAttemptCooldown  = 5000;

async function init(){
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseURL
    });
    log.verbose('Firebase: Initialized.');
}

function sendForTopic(post, attempt = 1){
    const messageInfo = '(topicId, postId)=(' + post.topicId + ', ' + post.postId +')';
    admin.messaging().sendToTopic('/topics/' + post.topicId, {data: post}, {priority: "high"})
        .then((response) => {
            log.info('Firebase: Successfully sent message ' + messageInfo + ' with messageId: ' +  response.messageId);
        })
        .catch((error) => {
            log.error('Firebase: Error while sending message ' + messageInfo);
            logFirebaseError(error);
            if (attempt < maxAttempts) {
                attempt++;
                log.verbose('Firebase: Reattempting in ' + reAttemptCooldown/1000 +'s (attempt ' + attempt +')...');
                setTimeout(sendForTopic, reAttemptCooldown, post, attempt);
            }
        });
}

function sendForBoard(post, attempt = 1){
    const messageInfo = '(topicId, postId, boardId)=(' + post.topicId + ', ' + post.postId + ', ' + post.boardId + ')';
    admin.messaging().sendToTopic('/topics/b' + post.boardId, {data: post}, {priority: "high"})
        .then((response) => {
            log.info('Firebase: Successfully sent message ' + messageInfo + ' with messageId: ' +  response.messageId);
        })
        .catch((error) => {
            log.error('Firebase: Error while sending message ' + messageInfo);
            logFirebaseError(error);
            if (attempt < maxAttempts) {
                attempt++;
                log.info('Firebase: Reattempting in ' + reAttemptCooldown/1000 +'s (attempt ' + attempt +')...');
                setTimeout(sendForBoard, reAttemptCooldown, post, attempt);
            }
        });
}

function sendForStatus(errorFlag){
    const data = {timestamp: (+ new Date()).toString(), errorFlag: errorFlag.toString()};
    admin.messaging().sendToTopic('/topics/status', {data: data}, {priority: "high"})
        .then((response) => {
            log.verbose('Firebase: Successfully sent status message ' + JSON.stringify(data) + ' with messageId: ' +  response.messageId);
        })
        .catch((error) => {
            log.error('Firebase: Error while sending status message ' + JSON.stringify(data));
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
    sendForTopic,
    sendForBoard,
    sendForStatus
};