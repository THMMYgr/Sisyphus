# Sisyphus
![Last Commit](https://img.shields.io/github/last-commit/ThmmyNoLife/Sisyphus/develop.svg)

Backend service that fetches data from [thmmy.gr](https://www.thmmy.gr/) and provides them to  [mTHMMY](https://github.com/ThmmyNoLife/mTHMMY) through Firebase.

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

This will also expose a REST API endpoint at https://firestore.googleapis.com/v1/projects/FIREBASE_PROJECT_ID/databases/(default)/documents/thmmy/recent_posts/
that will publicly provide the retrieved recent posts.

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

Create a directory named *config*, where a backup of the required configuration will be kept (or be deleted afterwards).
After that, copy the template *config.json* file from the *Sisyphus/config* directory to *config*:
```bash
mkdir config
cp Sisyphus/config/config.json config
```

Edit the *config/config.json* file (e.g. with `nano config/config.json`) and add a valid *serviceAccountKey.json* inside *config*.

Run the following commands to set up Docker and run Sisyphus:
```bash
docker swarm init
docker build -t sisyphus ./Sisyphus/
docker secret create sisyphus-config ./config/config.json
docker secret create sisyphus-service-account-key ./config/serviceAccountKey.json
docker service create --name sisyphus-service \
    --secret sisyphus-config \
    --secret sisyphus-service-account-key \
    sisyphus
```

**Note**: Sisyphus is rather silent in production mode. For verbose log messages, also add `ENV LOG_LEVEL verbose` to Dockerfile.