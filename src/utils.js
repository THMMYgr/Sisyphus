const crypto = require('crypto');
const isReachable = require("is-reachable");

function hash(string) {
    return crypto.createHash('md5').update(string).digest('hex').substring(0,12);
}

//Helper function (Firebase FCM does not accept integers as JSON values)
function stringifyJSONValues(json) {
    for (let k in json)
        if (json.hasOwnProperty(k))
            json[k] = String(json[k]);

    return json;
}

async function isThmmyReachable() {
    return isReachable('thmmy.gr').then(reachable => {
        return reachable;
    });
}

module.exports = { hash, stringifyJSONValues, isThmmyReachable };
