# Sisyphus
![Version](https://img.shields.io/github/package-json/v/ThmmyNoLife/Sisyphus/master.svg?color=red)
[![API](https://img.shields.io/badge/API-Recent_posts-orange.svg?style==flat)](https://firestore.googleapis.com/v1/projects/mthmmy-release-3aef0/databases/(default)/documents/thmmy/recent_posts/)
[![API](https://img.shields.io/badge/API-Status-blue.svg?style==flat)](https://firestore.googleapis.com/v1/projects/mthmmy-release-3aef0/databases/(default)/documents/sisyphus/status/)
![Last Commit](https://img.shields.io/github/last-commit/ThmmyNoLife/Sisyphus/develop.svg)

Backend service that fetches data from [thmmy.gr](https://www.thmmy.gr/) and provides them to [mTHMMY](https://github.com/ThmmyNoLife/mTHMMY) through [Firebase](https://firebase.google.com/).

## Usage

Before starting, make sure to set up Firebase by:
* Getting a valid *serviceAccountKey.json* (see also the docs [here](https://firebase.google.com/docs/admin/setup))

* Setting the following rules for Firestore:

```
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read;
      allow write: if false;
    }
  }
}
```

This will also expose a REST API endpoint at https://firestore.googleapis.com/v1/projects/FIREBASE_PROJECT_ID/databases/(default)/documents/thmmy/recent_posts/,
that will publicly provide the retrieved recent posts.

Furthermore, another endpoint at https://firestore.googleapis.com/v1/projects/FIREBASE_PROJECT_ID/databases/(default)/documents/sisyphus/status will provide useful information about the app's status.

### Development

Install dependencies using [npm](https://www.npmjs.com/):

```bash
npm install
```

Then set up the required configuration in the *config* directory by adding the *serviceAccountKey.json* there and by editing the *config.json* file.

Finally, start the app:

```bash
npm start
```

### Production

#### Initial setup

The proposed way to run Sisyphus in production is by using [Docker](https://www.docker.com/).

After installing Docker, clone Sisyphus using git:
```bash
git clone -b master --depth=1 https://github.com/ThmmyNoLife/Sisyphus.git Sisyphus
```

Navigate inside *./Sisyphus/config* directory, edit the existing files and add a valid *serviceAccountKey.json* file.

From *./Sisyphus* run the app in detached mode with:
```bash
docker compose up -d
```

**Note**: Sisyphus is rather silent in production mode. For verbose log messages, change the environment variable `LOG_LEVEL` in *compose.yaml* to `verbose`.
