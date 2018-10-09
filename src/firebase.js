const log = require('./logger');
const admin = require('firebase-admin');

const config = require('../config/config.json');
const serviceAccount = require('../config/' + config.firebaseServiceAccountKey);

const databaseURL = config.firebaseDatabaseURL;


module.exports.init = async function (){
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseURL
    });
    log.verbose('Firebase: initialized.');
};

module.exports.sendForTopic = function (post){
    const messageInfo = '(topicId, postId) =  (' + post.topicId + ', ' + post.postId +')';
    admin.messaging().sendToTopic('/topics/' + post.topicId, {data: post}, {priority: "high"})
        .then((response) => {
            log.verbose('Firebase: successfully sent message ' + messageInfo + ' with messageId: ' +  response.messageId);
        })
        .catch((error) => {
            log.verbose('Firebase: error sending message ' + messageInfo);
            log.error(error);
        });
};

module.exports.sendForBoard = function (post){
    const messageInfo = '(topicId, postId, boardId) =  (' + post.topicId + ', ' + post.postId + ', ' + post.boardId + ')';
    admin.messaging().sendToTopic('/topics/b' + post.boardId, {data: post}, {priority: "high"})
        .then((response) => {
            log.verbose('Firebase: successfully sent message ' + messageInfo + ' with messageId: ' +  response.messageId);
        })
        .catch((error) => {
            log.verbose('Firebase: error sending message ' + messageInfo);
            log.error(error);
        });
};

