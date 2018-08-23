const crypto = require('crypto');

module.exports.hash = function (string)
{
    return crypto.createHash('md5').update(string).digest('hex').substring(0,12);
};

//Helper function (Firebase FCM does not accept integers as JSON values)
module.exports.stringifyJSONIntegers = function (json)
{
    for (let k in json)
        if (json.hasOwnProperty(k))
            json[k] = String(json[k]);

    return json;
};
