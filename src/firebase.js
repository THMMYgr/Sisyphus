const log = require('./logger');
const admin = require('firebase-admin');

const config = require('../config/config.json');
const serviceAccount = require('../config/' + config.firebaseServiceAccountKey);

const databaseURL = config.firebaseDatabaseURL;

const reattemptCooldown  = 2000;
const maxAttempts = 100;

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
        messageInfo = 'TOPIC message (topicId: ' + post.topicId + ', postId: ' + post.postId +')';
    else
        messageInfo = 'BOARD message (boardId: ' + post.boardId + ', topicId: ' + post.topicId + ', postId: ' + post.postId + ')';

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
            } else
                log.error('Firebase: Maximum number of attempts reached. ' + messageInfo + ' will not be delivered.');
        });
}

function logFirebaseError(error){
    (error.errorInfo && error.errorInfo.code) ? log.error('Firebase: ' + error.errorInfo.code) : log.error('Firebase: ' + error);
}

module.exports = {
    init,
    send
};
