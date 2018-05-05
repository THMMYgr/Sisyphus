const log = require('./logger');
const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

const databaseURL = 'https://DATABASE_NAME.firebaseio.com/';
const topic = 'examsResults';

module.exports.init = function (){
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseURL
    });
    log.verbose('Firebase initialized.');
};

module.exports.send = function (data){
    let message = {
        data: data,
        topic: topic
    };

    admin.messaging().send(message)
        .then((response) => {
            log.verbose('Firebase: successfully sent message (' + response + ')');
        })
        .catch((error) => {
            log.error(error);
        });
};

