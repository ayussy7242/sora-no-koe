"use strict";

const crypto = require("crypto");

function percentEncode(value) {
  return encodeURIComponent(String(value == null ? "" : value))
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normalizeUrl(url) {
  return String(url || "").replace(/\?.*$/, "");
}

function parseQueryParams(url) {
  const out = {};
  try {
    const u = new URL(String(url || ""));
    for (const [key, value] of u.searchParams.entries()) {
      if (!key) continue;
      out[key] = value;
    }
  } catch (_) {
    return out;
  }
  return out;
}

function buildOAuthSignature(method, url, oauthParams, consumerSecret, tokenSecret, extraParams) {
  const normUrl = normalizeUrl(url);
  const queryParams = parseQueryParams(url);
  const baseParams = { ...oauthParams, ...queryParams, ...(extraParams || {}) };

  const paramString = Object.keys(baseParams)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(baseParams[key])}`)
    .join("&");

  const baseString =
    String(method || "GET").toUpperCase() +
    "&" +
    percentEncode(normUrl) +
    "&" +
    percentEncode(paramString);

  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
}

function buildOAuthHeader(oauthParams) {
  const parts = Object.keys(oauthParams)
    .sort()
    .map((key) => `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`);
  return `OAuth ${parts.join(", ")}`;
}

function buildOAuthParams(env) {
  const apiKey = String(env?.X_API_KEY || "").trim();
  const apiSecret = String(env?.X_API_SECRET || "").trim();
  const token = String(env?.X_ACCESS_TOKEN || "").trim();
  const tokenSecret = String(env?.X_ACCESS_SECRET || "").trim();

  if (!apiKey || !apiSecret || !token || !tokenSecret) {
    const missing = [
      !apiKey && "X_API_KEY",
      !apiSecret && "X_API_SECRET",
      !token && "X_ACCESS_TOKEN",
      !tokenSecret && "X_ACCESS_SECRET",
    ].filter(Boolean).join(", ");
    const err = new Error(`X credentials missing: ${missing}`);
    err.code = "X_CREDENTIALS_MISSING";
    throw err;
  }

  return {
    apiKey,
    apiSecret,
    token,
    tokenSecret,
    params: {
      oauth_consumer_key: apiKey,
      oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: String(Math.floor(Date.now() / 1000)),
      oauth_token: token,
      oauth_version: "1.0",
    },
  };
}

async function oauth1Fetch({ url, method, body, contentType, extraParams, env }) {
  const { apiSecret, tokenSecret, params } = buildOAuthParams(env);
  const signature = buildOAuthSignature(method, url, params, apiSecret, tokenSecret, extraParams);
  const oauthParams = { ...params, oauth_signature: signature };

  const headers = {
    Authorization: buildOAuthHeader(oauthParams),
  };
  if (contentType) headers["content-type"] = contentType;

  const env2 = { ...(env || {}), ...(process.env || {}) };
  const timeoutMs = Number.isFinite(Number(env2.X_API_TIMEOUT_MS))
    ? Number(env2.X_API_TIMEOUT_MS)
    : 8000;
  const maxRetries = Number.isFinite(Number(env2.X_API_RETRY_MAX))
    ? Number(env2.X_API_RETRY_MAX)
    : 3;
  const baseDelayMs = Number.isFinite(Number(env2.X_API_RETRY_BASE_MS))
    ? Number(env2.X_API_RETRY_BASE_MS)
    : 1000;

  const shouldRetryStatus = (status) => status === 429 || (status >= 500 && status <= 599);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const backoffMs = (retryIndex) => {
    const base = baseDelayMs * Math.pow(2, Math.max(0, retryIndex - 1));
    const jitter = 0.7 + Math.random() * 0.6;
    return Math.round(base * jitter);
  };

  const attemptFetch = async () => {
    const opts = {
      method: String(method || "GET").toUpperCase(),
      headers,
    };
    if (opts.method !== "GET" && body != null) {
      opts.body = body;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
    try {
      return await fetch(url, { ...opts, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await attemptFetch();
      if (res.ok) return res;
      if (attempt < maxRetries && shouldRetryStatus(res.status)) {
        const wait = backoffMs(attempt + 1);
        console.warn(`[x_api] retrying (${attempt + 1}/${maxRetries}) status=${res.status} wait=${wait}ms`);
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const name = String(err?.name || "");
      const message = String(err?.message || "");
      const isAbort = name === "AbortError" || message.includes("timeout");
      if (attempt < maxRetries && isAbort) {
        const wait = backoffMs(attempt + 1);
        console.warn(`[x_api] retrying (${attempt + 1}/${maxRetries}) reason=timeout wait=${wait}ms`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }

  if (lastErr) throw lastErr;
  return attemptFetch();
}

function normalizeMediaIds(input) {
  if (!input) return [];
  if (Array.isArray(input)) return input.map((id) => String(id || "").trim()).filter(Boolean);
  if (typeof input === "string" || typeof input === "number") {
    const s = String(input).trim();
    return s ? [s] : [];
  }
  return [];
}

async function postTweetV2({ text, replyToId, mediaIds, env }) {
  const url = "https://api.x.com/2/tweets";
  const payload = replyToId
    ? { text, reply: { in_reply_to_tweet_id: replyToId } }
    : { text };
  const media = normalizeMediaIds(mediaIds);
  if (media.length) {
    payload.media = { media_ids: media };
  }

  const res = await oauth1Fetch({
    url,
    method: "POST",
    body: JSON.stringify(payload),
    contentType: "application/json",
    env,
  });

  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`X v2 post failed: ${res.status} / ${body}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  let json = null;
  try {
    json = JSON.parse(body);
  } catch (_) {
    json = null;
  }

  const id = json?.data?.id || "";
  return { id, raw: json };
}

async function postTweetV1({ text, replyToId, env }) {
  const url = "https://api.twitter.com/1.1/statuses/update.json";
  const params = replyToId
    ? { status: text, in_reply_to_status_id: replyToId, auto_populate_reply_metadata: true }
    : { status: text };
  const body = new URLSearchParams(params).toString();

  const res = await oauth1Fetch({
    url,
    method: "POST",
    body,
    contentType: "application/x-www-form-urlencoded",
    extraParams: params,
    env,
  });

  const resBody = await res.text();
  if (!res.ok) {
    const err = new Error(`X v1.1 post failed: ${res.status} / ${resBody}`);
    err.status = res.status;
    err.body = resBody;
    throw err;
  }

  let json = null;
  try {
    json = JSON.parse(resBody);
  } catch (_) {
    json = null;
  }

  const id = json?.id_str || json?.id || "";
  return { id, raw: json };
}

async function uploadMedia({ buffer, mediaType = "image/png", env }) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    const err = new Error("X media upload buffer missing");
    err.code = "X_MEDIA_BUFFER_MISSING";
    throw err;
  }

  const url = "https://upload.twitter.com/1.1/media/upload.json";
  const media = buffer.toString("base64");
  const params = {
    media,
    media_category: "tweet_image",
  };
  if (mediaType) params.media_type = mediaType;

  const body = new URLSearchParams(params).toString();

  const res = await oauth1Fetch({
    url,
    method: "POST",
    body,
    contentType: "application/x-www-form-urlencoded",
    extraParams: params,
    env,
  });

  const resBody = await res.text();
  if (!res.ok) {
    const err = new Error(`X media upload failed: ${res.status} / ${resBody}`);
    err.status = res.status;
    err.body = resBody;
    throw err;
  }

  let json = null;
  try {
    json = JSON.parse(resBody);
  } catch (_) {
    json = null;
  }
  const id = json?.media_id_string || json?.media_id || "";
  return { id, raw: json };
}

async function postTweet({ text, replyToId, mediaIds, env }) {
  if (!String(text || "").trim()) {
    const err = new Error("X post text empty");
    err.code = "X_EMPTY_TEXT";
    throw err;
  }

  return await postTweetV2({ text, replyToId, mediaIds, env });
}

module.exports = {
  postTweet,
  uploadMedia,
};
