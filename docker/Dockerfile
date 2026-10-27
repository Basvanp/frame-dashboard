FROM node:22-bookworm-slim

ENV FRAME_IN_DOCKER=1 \
    CHROME_PATH=/usr/bin/chromium \
    FRAME_TOKEN_FILE=/data/frame-tv.token \
    FRAME_STATE_FILE=/data/frame-art.json

RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY lib/frame-art.js lib/tv-socket.js lib/
COPY scripts/frame-art.mjs scripts/frame-art.mjs

VOLUME /data
CMD ["node", "scripts/frame-art.mjs"]
