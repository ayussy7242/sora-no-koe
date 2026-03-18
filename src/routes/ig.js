"use strict";

const express = require("express");
const crypto = require("crypto");

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

  return router;
}

module.exports = { createIgRouter };
