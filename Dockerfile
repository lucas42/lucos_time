FROM node:12-alpine

WORKDIR /web/lucos/time

# Legacy method of installing resources was using the lucos_core library - installed in a relative location on the file system
RUN apk add git
RUN git clone https://github.com/lucas42/lucos_core.git /web/lucos/core

RUN npm install node-fetch
COPY . .

ENV NODE_ENV production
ENV PORT 8008
EXPOSE $PORT

CMD [ "node", "server.js" ]