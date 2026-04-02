FROM node:20-slim

# swisseph(node-gyp) build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    fonts-noto-cjk \
    libglib2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 libx11-6 libx11-xcb1 \
    libxcb1 libxext6 libxrender1 libpango-1.0-0 libpangocairo-1.0-0 \
    libcairo2 libfontconfig1 libexpat1 libfreetype6 libjpeg62-turbo \
    libpng16-16 libharfbuzz0b libuuid1 libdbus-1-3 libgtk-3-0 \
    libu2f-udev xdg-utils \
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

# npm ci
RUN npm ci --omit=dev --no-audit --no-fund --prefer-online --cache /tmp/npm-cache

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

CMD ["npm","start"]
