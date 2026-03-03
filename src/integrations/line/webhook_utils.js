"use strict";

function isNonEmptyText(x) {
  const s = x == null ? "" : String(x);
  return s.trim().length > 0;
}

function toSafeText(x, maxLen = 4800) {
  const s = x == null ? "" : String(x);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function getReqId(req) {
  return (
    req?.headers?.["x-request-id"] ||
    req?.headers?.["x-cloud-trace-context"] ||
    req?.headers?.["x-amzn-trace-id"] ||
    null
  );
}

function envFlag(v, defaultOn = true) {
  if (v === undefined || v === null || v === "") return defaultOn;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "enable", "enabled"].includes(s);
}

function getRawBodyBuffer(req0) {
  if (Buffer.isBuffer(req0.rawBody)) return req0.rawBody;
  if (typeof req0.rawBody === "string") return Buffer.from(req0.rawBody, "utf8");
  return null;
}

function verifySignature({ rawBodyBuf, signature, secret }) {
  if (!secret) return { ok: false, reason: "secret missing" };
  if (!signature) return { ok: false, reason: "signature missing" };
  if (!rawBodyBuf) return { ok: false, reason: "raw body missing" };

  const computed = require("crypto")
    .createHmac("sha256", secret)
    .update(rawBodyBuf)
    .digest("base64");

  const a = Buffer.from(computed);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return { ok: false, reason: "length mismatch" };
  const ok = require("crypto").timingSafeEqual(a, b);
  return { ok, reason: ok ? "ok" : "mismatch" };
}

function createMessageDeduper({ ttlMs = 10 * 60 * 1000, max = 5000 } = {}) {
  const seen = new Map(); // messageId -> timestamp

  function cleanup(nowTs) {
    const now = nowTs || Date.now();
    for (const [id, ts] of seen.entries()) {
      if (now - ts > ttlMs) seen.delete(id);
    }
    if (seen.size <= max) return;
    const entries = Array.from(seen.entries()).sort((a, b) => a[1] - b[1]);
    const overflow = entries.length - max;
    for (let i = 0; i < overflow; i++) {
      seen.delete(entries[i][0]);
    }
  }

  function isDuplicate(messageId) {
    if (!messageId) return false;
    const now = Date.now();
    cleanup(now);
    if (seen.has(messageId)) return true;
    seen.set(messageId, now);
    return false;
  }

  return { isDuplicate };
}

module.exports = {
  isNonEmptyText,
  toSafeText,
  getReqId,
  envFlag,
  getRawBodyBuffer,
  verifySignature,
  createMessageDeduper,
};
