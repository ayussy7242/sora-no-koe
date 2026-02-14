FROM node:20-slim

# swisseph(node-gyp) build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    fonts-noto-cjk fonts-noto-color-emoji fonts-noto-mono \
    libnss3 libatk-bridge2.0-0 libatk1.0-0 libdrm2 libxkbcommon0 libgbm1 \
    libxcomposite1 libxdamage1 libxrandr2 libxss1 libasound2 \
    libpangocairo-1.0-0 libgtk-3-0 libx11-xcb1 libxfixes3 libx11-6 \
    libxcb1 libxext6 libxrender1 libxshmfence1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# npm 安定化（取得壊れ・キャッシュ汚染耐性）
ENV npm_config_registry=https://registry.npmjs.org/ \
    npm_config_strict_ssl=true \
    npm_config_fetch_retries=12 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=180000 \
    npm_config_prefer_online=true \
    npm_config_cache=/tmp/npm-cache \
    npm_config_audit=false \
    npm_config_fund=false \
    npm_config_update_notifier=false

COPY package*.json ./

# キャッシュを毎回捨てて、オンライン優先で ci
RUN rm -rf /root/.npm /tmp/npm-cache \
 && npm cache clean --force \
 && npm ci --omit=dev --no-audit --no-fund --prefer-online --cache /tmp/npm-cache

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

CMD ["npm","start"]
