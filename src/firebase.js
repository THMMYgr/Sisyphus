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

module.exports.send = function (data){
    let message = {
        data: data,
        topic: data.topicId
    };

    admin.messaging().send(message)
        .then((response) => {
            log.verbose('Firebase: successfully sent message (' + response + ')');
        })
        .catch((error) => {
            log.error(error);
        });
};

