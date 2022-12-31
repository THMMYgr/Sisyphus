FROM node:18.12.1-alpine

LABEL version=2.1.0 maintainer="ezerous@gmail.com"

RUN apk update && apk add nano

ENV NODE_ENV production

WORKDIR /app

# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install dependencies
RUN npm ci

# Bundle app source
COPY . .

CMD [ "npm", "start" ]
