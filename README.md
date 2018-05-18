# Sisyphus
[![Dependencies](https://img.shields.io/david/ThmmyNoLife/Sisyphus.svg)](https://david-dm.org/ThmmyNoLife/Sisyphus)

Backend service that fetches data from [`thmmy.gr`](https://www.thmmy.gr/) and pushes them to  [`mTHMMY`](https://github.com/ThmmyNoLife/mTHMMY) through Firebase.

## Usage

Install dependepcies using [`yarn`](https://yarnpkg.com/) (recommended):

```bash
yarn
```

or via [`npm`](https://www.npmjs.com/):

```bash
npm install
```

Then set up the required configuration in the `config` directory by adding a valid `serviceAccountKey.json` there and by editing the `config.json` file (refer to [firebase docs](https://firebase.google.com/docs/admin/setup) for more details).

Finally, start the app either by using yarn:

```bash
yarn start
```

or npm:

```bash
npm start
```

To run it continuously in the background (e.g. in production) you can use something like [`forever`](https://github.com/foreverjs/forever).
