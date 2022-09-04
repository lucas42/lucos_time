FROM node:18-alpine

WORKDIR /web/lucos/time

COPY package* ./
RUN npm install
COPY src .

## Run the build step and then delete everything which only gets used for the build
RUN npm run build
RUN npm prune --production
RUN rm -rf client service-worker webpack*

## Remove package files for now, as the server side code is still CommonJS
RUN rm package*

ENV NODE_ENV production
ENV PORT 8008
EXPOSE $PORT

CMD [ "node", "server.js" ]