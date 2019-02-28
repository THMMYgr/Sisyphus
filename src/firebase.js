const log = require('./logger');
const admin = require('firebase-admin');

const config = require('../config/config.json');
const serviceAccount = require('../config/' + config.firebaseServiceAccountKey);

const databaseURL = config.firebaseDatabaseURL;
const firestoreCollection = config.firestoreCollection;
const firestoreDocument = config.firestoreDocument;
const firestoreField = config.firestoreField;

const reattemptCooldown  = 2000;
const maxAttempts = 100;


let docRef; // Firestore document reference
async function init() {
   admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: databaseURL
    });
    log.verbose('Firebase: Initialization successful!');

    docRef = admin.firestore().collection(firestoreCollection).doc(firestoreDocument);
}

function send(topic, post, attempt=1) {
    let messageInfo;
    if (!topic.includes('b'))
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

function saveToFirestore (posts) {
    // Because Firestore doesn't support JavaScript objects with custom prototypes
    // (i.e. objects that were created via the 'new' operator).
    posts = posts.map(function(post) {
        return JSON.parse(JSON.stringify(post));
    });

    docRef.set({[firestoreField]: posts})
        .then(() => {
            log.verbose('Firebase: Firestore document written successfully!');
        })
        .catch((error)=> {
            log.error('Firebase: Firestore error while writing document.');
            logFirebaseError(error);
        });
}

function logFirebaseError(error) {
    (error.errorInfo && error.errorInfo.code) ? log.error('Firebase: ' + error.errorInfo.code) : log.error('Firebase: ' + error);
}

module.exports = { init, send, saveToFirestore };
