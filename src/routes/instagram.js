"use strict";

const express = require("express");
const crypto = require("crypto");
const { createStorageClient } = require("../utils/infra/gcs_storage");
const { resolveEnv } = require("../utils/env");

function base64UrlDecode(input) {
  const s = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, "base64");
}

function verifySignedRequest(signedRequest, appSecret) {
  const parts = String(signedRequest || "").split(".");
  if (parts.length !== 2) return { ok: false, error: "invalid_format" };
  const [sig, payload] = parts;
  const expected = crypto.createHmac("sha256", appSecret).update(payload).digest();
  const sigBuf = base64UrlDecode(sig);
  if (sigBuf.length !== expected.length) return { ok: false, error: "signature_length" };
  const ok = crypto.timingSafeEqual(sigBuf, expected);
  return ok ? { ok: true, payload } : { ok: false, error: "signature_mismatch" };
}

function decodePayload(payload) {
  try {
    const raw = base64UrlDecode(payload).toString("utf8");
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function buildBaseUrl(req, env) {
  const base = String(env?.PUBLIC_BASE_URL || "").trim();
  if (base) return base.replace(/\/$/, "");
  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "https");
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "");
  return host ? `${proto}://${host}` : "";
}

function createIgRouter(deps = {}) {
  const router = express.Router();
  const env = deps.env || {};
  const env2 = resolveEnv(env);

  function parseProxyAllowPrefixes() {
    const raw = String(env2.IG_PROXY_ALLOW_PREFIXES || "ig/carousel/,ig/story/,ig/moon_event/").trim();
    return raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }

  function isAllowedProxyPath(filePath) {
    if (!filePath) return { ok: false, error: "path_missing" };
    const cleaned = String(filePath).replace(/^\/+/, "");
    if (!cleaned) return { ok: false, error: "path_missing" };
    if (cleaned.includes("..")) return { ok: false, error: "invalid_path" };
    const allowPrefixes = parseProxyAllowPrefixes();
    if (!allowPrefixes.some((prefix) => cleaned.startsWith(prefix))) return { ok: false, error: "path_not_allowed" };
    const lower = cleaned.toLowerCase();
    if (!/\.(png|jpe?g)$/.test(lower)) return { ok: false, error: "unsupported_ext" };
    return { ok: true, cleaned };
  }

  router.post("/data-deletion", (req, res) => {
    const appSecret = String(env.IG_APP_SECRET || "").trim();
    if (!appSecret) {
      return res.status(500).json({ ok: false, error: "IG_APP_SECRET missing" });
    }

    const signedRequest = req.body?.signed_request || req.query?.signed_request || "";
    if (!signedRequest) {
      return res.status(400).json({ ok: false, error: "signed_request missing" });
    }

    const verified = verifySignedRequest(signedRequest, appSecret);
    if (!verified.ok) {
      return res.status(401).json({ ok: false, error: verified.error || "invalid_signature" });
    }

    const payload = decodePayload(verified.payload);
    if (!payload) {
      return res.status(400).json({ ok: false, error: "invalid_payload" });
    }

    const confirmationCode = crypto.randomBytes(16).toString("hex");
    const baseUrl = buildBaseUrl(req, env);
    const url = baseUrl ? `${baseUrl}/ig/data-deletion/status?code=${confirmationCode}` : "";

    return res.json({
      confirmation_code: confirmationCode,
      url,
    });
  });

  router.get("/data-deletion/status", (req, res) => {
    const code = String(req.query?.code || "").trim();
    res.status(200).type("text/plain").send(code
      ? `Data deletion request received. Confirmation code: ${code}`
      : "Data deletion request received.");
  });

  // IG image proxy (secure-ish): only allow specific prefixes + png/jpg/jpeg
  router.get("/proxy", async (req, res) => {
    try {
      const rawPath = String(req.query?.path || "").trim();
      const allowed = isAllowedProxyPath(rawPath);
      if (!allowed.ok) {
        return res.status(400).json({ ok: false, error: allowed.error || "invalid_path" });
      }
      const cleaned = allowed.cleaned;

      const bucketName = env2.IG_GCS_BUCKET || env2.GCS_BUCKET_SORA || env2.GCS_BUCKET_BLUEPRINTS;
      if (!bucketName) {
        return res.status(500).json({ ok: false, error: "IG_GCS_BUCKET missing" });
      }

      const storageClient = await createStorageClient({ storage: deps.storage, env: env2 });
      const file = storageClient.bucket(bucketName).file(cleaned);

      let metadata = null;
      try {
        [metadata] = await file.getMetadata();
      } catch (err) {
        if (err?.code === 404 || err?.code === 400) {
          return res.status(404).json({ ok: false, error: "not_found" });
        }
      }

      const lower = cleaned.toLowerCase();
      const fallbackType = lower.endsWith(".png") ? "image/png" : "image/jpeg";
      const contentType = metadata?.contentType || fallbackType;
      const cacheControl = String(env2.IG_PROXY_CACHE_CONTROL || "public, max-age=3600");

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", cacheControl);
      if (metadata?.size) res.setHeader("Content-Length", String(metadata.size));
      res.setHeader("Content-Disposition", "inline");

      const stream = file.createReadStream();
      stream.on("error", (err) => {
        if (!res.headersSent) {
          return res.status(500).json({ ok: false, error: err?.message || "stream_error" });
        }
        res.end();
      });
      stream.pipe(res);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });

  return router;
}

module.exports = { createIgRouter };
