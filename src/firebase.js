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
    log.verbose('Firebase initialized.');
};

module.exports.send = function (post){
    admin.messaging().sendToTopic(post.topicId, {data: post}, {priority: "high"})
        .then((response) => {
            log.verbose('Firebase: successfully sent message with messageId: ' + response.messageId);
        })
        .catch((error) => {
            log.error(error);
        });
};

