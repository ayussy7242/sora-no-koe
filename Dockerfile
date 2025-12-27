FROM node:20-slim

WORKDIR /usr/src/app

# swisseph (node-gyp) build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

CMD ["npm","start"]
