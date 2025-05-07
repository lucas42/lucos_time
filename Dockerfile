FROM node:24-alpine

WORKDIR /web/lucos/time

COPY src/package* ./
RUN npm install
COPY src .

## Run the build step and then delete everything which only gets used for the build
RUN npm run build
RUN npm prune --omit=dev
RUN rm -rf client service-worker webpack*

ENV NODE_ENV production
ENV PORT 8008
EXPOSE $PORT

CMD [ "npm", "start" ]