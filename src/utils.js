import crypto from 'crypto';

function hash(string) {
  return crypto.createHash('md5').update(string).digest('hex').substring(0, 12);
}

// Helper function (Firebase FCM does not accept integers as JSON values)
function stringifyJSONValues(json) {
  Object.keys(json).forEach(k => {
    json[k] = String(json[k]);
  });
  return json;
}

export { hash, stringifyJSONValues };
