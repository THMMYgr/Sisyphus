FROM node:lts-alpine

LABEL version=2.5.0 maintainer="ezerous@gmail.com"

RUN apk update && apk add nano

WORKDIR /app

# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install dependencies
RUN npm ci

# Bundle app source
COPY . .

CMD [ "npm", "start" ]
