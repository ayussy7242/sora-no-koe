"use strict";

const express = require("express");
const crypto = require("crypto");
const { getJobRef } = require("../usecases/pdf/blueprint/jobs/state");

function requireInternalToken({ env, req }) {
  const tokenExpected = env?.INTERNAL_TASKS_TOKEN || null;
  if (!tokenExpected) return { ok: false, status: 500, error: "INTERNAL_TASKS_TOKEN not set" };
  const token = String(req.header("x-internal-tasks-token") || "").trim();
  if (!token || !safeEqual(token, tokenExpected)) {
    return { ok: false, status: 403, error: "invalid token" };
  }
  return { ok: true };
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function toIso(v) {
  if (!v) return null;
  try {
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    if (typeof v.toMillis === "function") return new Date(v.toMillis()).toISOString();
  } catch (_) { }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function guessPhase({ status, error, stage, filePath, signedUrl }) {
  const err = String(error || "").toLowerCase();
  const st = String(stage || "").toLowerCase();
  if (status === "running") return "running";
  if (signedUrl) return "signed_url_ready";
  if (filePath && !signedUrl) return "signed_url_failed";
  if (st.includes("line") || err.includes("line")) return "line_push";
  if (err.includes("gcs") || err.includes("storage") || err.includes("bucket")) return "gcs_store";
  if (err.includes("pdf")) return "pdf_render";
  if (err.includes("ai") || err.includes("json_parse") || err.includes("validation_failed")) return "ai_generate";
  if (status === "failed") return "pre_pdf_or_store";
  return "unknown";
}

function createBlueprintsDebugRouter(deps = {}) {
  const router = express.Router();
  const env = deps.env || {};
  const db = deps.db;

  if (!db) throw new Error("deps.db is required for blueprints debug router");

  // GET /internal/debug/blueprints/light/job?line_user_id=...
  router.get("/light/job", async (req, res) => {
    const auth = requireInternalToken({ env, req });
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const lineUserId = String(req.query?.line_user_id || "").trim();
    if (!lineUserId) return res.status(400).json({ ok: false, error: "line_user_id required" });

    const ref = getJobRef(db, lineUserId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(200).json({ ok: true, status: "not_found", line_user_id: lineUserId });
    }

    const job = snap.data() || {};
    const status = String(job.status || "unknown");
    const stage = job.stage || job.error_stage || null;
    const error = job.error || null;
    const attempts = Number.isFinite(job.attempts) ? job.attempts : 0;
    const filePath = job.file_path_mobile || job.file_path || null;
    const signedUrl = job.signed_url_mobile || job.signed_url || null;

    return res.status(200).json({
      ok: true,
      line_user_id: lineUserId,
      status,
      stage,
      error,
      attempts,
      created_at: toIso(job.created_at),
      updated_at: toIso(job.updated_at),
      started_at: toIso(job.started_at || (status === "running" ? job.updated_at : null)),
      finished_at: toIso(job.finished_at),
      lease_until: toIso(job.lease_until),
      file_path_mobile: job.file_path_mobile || null,
      signed_url_mobile: job.signed_url_mobile || null,
      phase_hint: guessPhase({ status, error, stage, filePath, signedUrl }),
    });
  });

  return router;
}

module.exports = { createBlueprintsDebugRouter };
