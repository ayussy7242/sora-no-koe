FROM node:20-slim

# swisseph(node-gyp) build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY package*.json ./

# ✅ npm取得の揺れ対策（tarball corrupted ループ対策）
ENV npm_config_cache=/tmp/.npm
RUN npm config set registry https://registry.npmjs.org/ \
 && npm config set fetch-retries 6 \
 && npm config set fetch-retry-mintimeout 20000 \
 && npm config set fetch-retry-maxtimeout 120000 \
 && npm config set prefer-online true \
 && npm cache clean --force \
 && npm ci --omit=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
CMD ["npm","start"]
