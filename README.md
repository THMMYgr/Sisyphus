# Sisyphus
[![Dependencies](https://img.shields.io/david/ThmmyNoLife/Sisyphus.svg)](https://david-dm.org/ThmmyNoLife/Sisyphus)

Backend service that fetches data from [thmmy.gr](https://www.thmmy.gr/) and pushes them to  [mTHMMY](https://github.com/ThmmyNoLife/mTHMMY) through Firebase.

## Usage

### Development

Install dependepcies using [yarn](https://yarnpkg.com/) (recommended):

```bash
yarn
```

or [npm](https://www.npmjs.com/):

```bash
npm install
```

Then set up the required configuration in the *config* directory by adding a valid *serviceAccountKey.json* there and by editing the *config.json* file (refer to [firebase docs](https://firebase.google.com/docs/admin/setup) for more details).

Finally, start the app either by using yarn:

```bash
yarn start
```

or npm:

```bash
npm start
```

### Production

A quick proposed way to set up everything in production from scratch is the following (Ubuntu server):

Open a root terminal to make sure you don't run into permission problems:
```bash
sudo -s
```

Install [nvm](https://github.com/creationix/nvm) with:
```bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash
```

**Note**: If you get `nvm: command not found` after running the above, simply close your current terminal and open a new one.

Install Node using nvm:
```bash
nvm install node
```

Install [yarn](https://yarnpkg.com/) and [pm2](https://pm2.io/) globally using npm. Also install [pm2-logrotate](https://github.com/keymetrics/pm2-logrotate):
```bash
npm install -g yarn pm2
pm2 install pm2-logrotate
```

Clone Sisyphus using git:
```bash
git clone https://github.com/ThmmyNoLife/Sisyphus.git Sisyphus-prod
```

Create a directory name *config* where a backup of the required configuration will be kept. After that, copy the template *config.json* file from the *Sisyphus-prod/config* directory to *config*:
```bash
mkdir config
cp Sisyphus-prod/config/config.json config
```

Edit the *config/config.json* file (e.g. with `nano config/config.json`), add a valid *serviceAccountKey.json* inside *config* and copy everything to *Sisyphus-prod/config* with:
```bash
cp -rf config Sisyphus-prod
```

Install dependencies and run Sisyphus using pm2:
```bash
cd Sisyphus-prod
yarn
NODE_ENV=production pm2 start app.js --name Sisyphus-prod
```

Configure pm2 to restart itself and the process:
```bash
pm2 startup ubuntu  # Sets a startup hook
pm2 save  # Saves current process list
```

To monitor Sisyphus use: `pm2 list` and `pm2 monit`.

**Note**: Sisyphus in production is *very* silent. For verbose messages run in development mode (i.e. without `NODE_ENV=production``).
