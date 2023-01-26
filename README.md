# Sisyphus
![Version](https://img.shields.io/github/package-json/v/ThmmyNoLife/Sisyphus/master.svg?color=red)
[![API](https://img.shields.io/badge/API-Recent_posts-orange.svg?style==flat)](https://firestore.googleapis.com/v1/projects/mthmmy-release-3aef0/databases/(default)/documents/thmmy/recent_posts/)
[![API](https://img.shields.io/badge/API-Status-blue.svg?style==flat)](https://firestore.googleapis.com/v1/projects/mthmmy-release-3aef0/databases/(default)/documents/sisyphus/status/)
![Last Commit](https://img.shields.io/github/last-commit/ThmmyNoLife/Sisyphus/develop.svg)

A service that fetches data from [thmmy.gr](https://www.thmmy.gr/) and provides them to [mTHMMY](https://github.com/ThmmyNoLife/mTHMMY) through [Firebase](https://firebase.google.com/).

## Introduction

Sisyphus is a long-running process, that crawls [thmmy.gr](https://www.thmmy.gr/) and scrapes the retrieved data in order to extract the most recent posts.

Its main purpose is to provide notifications for every new post to the devices that use [mTHMMY](https://github.com/ThmmyNoLife/mTHMMY) and are subscribed to the corresponding topics or boards. This is achieved through [Firebase Cloud Messaging](https://firebase.google.com/products/cloud-messaging).

Furthermore, it stores the retrieved posts in [Firestore](https://firebase.google.com/products/firestore), exposing a REST API endpoint at https://firestore.googleapis.com/v1/projects/FIREBASE_PROJECT_ID/databases/(default)/documents/thmmy/recent_posts/.
Another endpoint at https://firestore.googleapis.com/v1/projects/FIREBASE_PROJECT_ID/databases/(default)/documents/sisyphus/status provides useful information about the current status of the service.

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
A *dedicated* thmmy.gr account will also be required. **DO NOT** use this account for any other purpose.

### Development

Install dependencies using [npm](https://www.npmjs.com/):

```shell
npm install
```

Then set up the required configuration in the *config* directory by adding the *serviceAccountKey.json* there and by editing the *config.json* file.

Finally, start the app with:

```shell
npm start
```

### Production

#### Initial setup

The proposed way to run Sisyphus in production is by using [Docker](https://www.docker.com/).

After installing Docker, clone Sisyphus using git:

```shell
git clone -b master --depth=1 https://github.com/ThmmyNoLife/Sisyphus.git Sisyphus
```

Navigate inside *./Sisyphus/config* directory, edit the existing files as needed and add a valid *serviceAccountKey.json* file.

From *./Sisyphus* run the app in detached mode with:

```shell
docker compose up -d
```

**Note**: Sisyphus is rather silent in production mode. For verbose log messages, change the environment variable `LOG_LEVEL` in *compose.yaml* to `verbose`.
