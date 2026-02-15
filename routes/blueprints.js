"use strict";

const express = require("express");
const { createBlueprintLightService } = require("../engine/blueprint_light");
const { enqueueBlueprintGenerate } = require("../engine/tasks_queue");
const { createLineApi } = require("../line/line_api");
const dict = require("../dict");

function requireTasksCaller(env, req) {
  const tokenExpected = env?.INTERNAL_TASKS_TOKEN || null;
  if (!tokenExpected) return { ok: false, status: 500, error: "INTERNAL_TASKS_TOKEN not set" };
  const token = String(req.header("x-internal-tasks-token") || "").trim();
  if (!token || token !== tokenExpected) {
    return { ok: false, status: 403, error: "invalid token" };
  }
  return { ok: true };
}

async function markFailed_(db, admin, lineUserId, { stage, error, extra } = {}) {
  if (!lineUserId) return;
  const ref = getJobRef(db, lineUserId);
  await ref.set(
    {
      status: "failed",
      stage: stage || "worker",
      error: String(error || "unknown_error"),
      extra: extra || null,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function getJobRef(db, lineUserId) {
  return db.collection("jobs").doc("blueprint_light").collection("items").doc(lineUserId);
}

function getNowMillis() {
  return Date.now();
}

function isLeaseActive(job, nowMs) {
  const leaseUntil = job?.lease_until;
  if (!leaseUntil) return false;
  const leaseMs = typeof leaseUntil.toMillis === "function" ? leaseUntil.toMillis() : Number(leaseUntil);
  return Number.isFinite(leaseMs) && leaseMs > nowMs;
}

function nextLeaseMs(nowMs, minutes = 15) {
  return new Date(nowMs + minutes * 60 * 1000);
}

function createBlueprintsRouter(deps = {}) {
  const router = express.Router();
  const env = deps.env || {};
  const db = deps.db;
  const admin = deps.admin;
  const storage = deps.storage;

  if (!db) throw new Error("deps.db is required for blueprints router");
  if (!admin) throw new Error("deps.admin is required for blueprints router");
  if (!storage) throw new Error("deps.storage is required for blueprints router");

  router.get("/ping", (_req, res) => {
    return res.json({ ok: true, where: "blueprints" });
  });

  router.post("/light/generate", express.json({ limit: "1mb" }), async (req, res) => {
    const auth = requireTasksCaller(env, req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const lineUserId = String(req.body?.line_user_id || "").trim();
    if (!lineUserId) return res.status(400).json({ ok: false, error: "line_user_id required" });

    const userSnap = await db.collection("line_users").doc(lineUserId).get();
    if (!userSnap.exists) {
      return res.status(202).json({ ok: true, code: "skipped_user_not_found" });
    }

    const jobRef = getJobRef(db, lineUserId);
    const nowMs = getNowMillis();
    const blueprint = createBlueprintLightService({ db, admin, storage, env, dict });

    let shouldEnqueue = true;
    let currentStatus = "queued";
    let currentSignedUrl = null;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef);
      const job = snap.exists ? snap.data() : null;
      if (job?.status === "done") {
        currentStatus = "done";
        shouldEnqueue = false;
        return;
      }
      if (job?.status === "running" && isLeaseActive(job, nowMs)) {
        currentStatus = "running";
        shouldEnqueue = false;
        return;
      }
      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.set(
        jobRef,
        {
          status: "queued",
          line_user_id: lineUserId,
          product: "blueprint_light_v1",
          updated_at: now,
          created_at: job?.created_at || now,
          lease_until: null,
        },
        { merge: true }
      );
      currentStatus = "queued";
      shouldEnqueue = true;
    });

    if (currentStatus === "done") {
      const signed = await blueprint.getOrCreateSignedUrl({ lineUserId });
      if (signed?.ok && signed?.url) currentSignedUrl = signed.url;
      return res.status(200).json({ ok: true, status: "done", signed_url: currentSignedUrl });
    }
    if (!shouldEnqueue) {
      return res.status(202).json({ ok: true, status: currentStatus });
    }
    try {
      await enqueueBlueprintGenerate({ env, lineUserId, blueprintType: "light" });
      return res.status(202).json({ ok: true, status: "queued", job_id: lineUserId });
    } catch (e) {
      console.log("[blueprint] enqueue failed:", e?.message || String(e));
      await jobRef.set(
        {
          status: "failed",
          error: e?.message || String(e),
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  router.get("/light/status", async (req, res) => {
    const auth = requireTasksCaller(env, req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const lineUserId = String(req.query?.line_user_id || "").trim();
    if (!lineUserId) return res.status(400).json({ ok: false, error: "line_user_id required" });

    const jobRef = getJobRef(db, lineUserId);
    const snap = await jobRef.get();
    if (!snap.exists) {
      return res.status(200).json({ ok: true, status: "not_ready" });
    }
    const job = snap.data() || {};
    const nowMs = getNowMillis();
    if (job.status === "running" && job.error && !isLeaseActive(job, nowMs)) {
      await jobRef.set(
        {
          status: "failed",
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          lease_until: null,
        },
        { merge: true }
      );
      job.status = "failed";
    }
    if (job.status === "done") {
      const blueprint = createBlueprintLightService({ db, admin, storage, env, dict });
      const signed = await blueprint.getOrCreateSignedUrl({ lineUserId });
      if (signed?.ok && signed?.url) {
        await jobRef.set(
          { signed_url: signed.url, updated_at: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
        return res.status(200).json({ ok: true, status: "done", signed_url: signed.url });
      }
      await jobRef.set(
        {
          status: "queued",
          error: "file_not_ready",
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return res.status(200).json({ ok: true, status: "not_ready" });
    }
    return res.status(200).json({
      ok: true,
      status: job.status || "queued",
      signed_url: job.signed_url || null,
      error: job.error || null,
    });
  });

  const workerHandler = async (req, res) => {
    const auth = requireTasksCaller(env, req);
    if (!auth.ok) {
      const maybeLineUserId = String(req.body?.line_user_id || req.body?.lineUserId || "").trim();
      await markFailed_(db, admin, maybeLineUserId, {
        stage: "auth",
        error: auth.error || "invalid_auth",
      }).catch(() => {});
      return res.status(200).json({ ok: false, nonRetry: true, error: auth.error });
    }

    const lineUserId = String(req.body?.line_user_id || req.body?.lineUserId || "").trim();
    if (!lineUserId) {
      await markFailed_(db, admin, null, {
        stage: "validate_input",
        error: "missing_line_user_id",
        extra: { bodyKeys: Object.keys(req.body || {}) },
      }).catch(() => {});
      return res.status(200).json({ ok: false, nonRetry: true, error: "missing_line_user_id" });
    }

    const jobRef = getJobRef(db, lineUserId);
    const nowMs = getNowMillis();
    let shouldRun = true;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef);
      const job = snap.exists ? snap.data() : null;
      if (job?.status === "done") {
        shouldRun = false;
        return;
      }
      if (job?.status === "running" && isLeaseActive(job, nowMs)) {
        shouldRun = false;
        return;
      }
      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.set(
        jobRef,
        {
          status: "running",
          updated_at: now,
          lease_until: nextLeaseMs(nowMs),
        },
        { merge: true }
      );
    });
    if (!shouldRun) {
      return res.status(200).json({ ok: true, code: "skipped" });
    }

    const blueprint = createBlueprintLightService({ db, admin, storage, env, dict });
    try {
      const gen = await blueprint.generateAndStore({ lineUserId });
      const signed = await blueprint.getOrCreateSignedUrl({ lineUserId });
      if (!signed?.ok || !signed?.url) {
        throw new Error("signed url missing after generate");
      }

      const lineApiClient = createLineApi({
        accessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
        maxText: Number(env.MAX_LINE_TEXT || 4800),
      });

      const templateMessage = {
        type: "template",
        altText: "魂の設計図（LIGHT）はこちら",
        template: {
          type: "buttons",
          title: "魂の設計図（LIGHT）",
          text: "あなた専用の設計図です🌌",
          actions: [
            {
              type: "uri",
              label: "設計図を開く",
              uri: signed.url,
            },
          ],
        },
      };

      await lineApiClient.pushMessages(lineUserId, templateMessage);
      await jobRef.set(
        {
          status: "done",
          file_path: gen?.filePath || null,
          signed_url: signed.url,
          updated_at: admin.firestore.FieldValue.serverTimestamp(),
          finished_at: admin.firestore.FieldValue.serverTimestamp(),
          lease_until: null,
        },
        { merge: true }
      );
      return res.json({ ok: true, code: gen?.skipped ? "already_exists" : "generated" });
    } catch (e) {
      const message = String(e?.message || e || "");
      const code = String(e?.code || "");
      const nonRetry =
        message.includes("ai_failed:") ||
        message.includes("validation_failed:") ||
        message.includes("json_parse_failed:") ||
        message.includes("line user not found") ||
        message.includes("missing_") ||
        message.includes("token") ||
        code === "UNAUTHENTICATED" ||
        code === "PERMISSION_DENIED";

      console.log("[blueprint] worker failed:", message);

      if (nonRetry) {
        await markFailed_(db, admin, lineUserId, { stage: "worker", error: message }).catch(() => {});
        await jobRef.set(
          { finished_at: admin.firestore.FieldValue.serverTimestamp(), lease_until: null },
          { merge: true }
        );
        return res.status(200).json({ ok: false, nonRetry: true, error: message });
      }

      await markFailed_(db, admin, lineUserId, { stage: "worker_unhandled", error: message }).catch(() => {});
      await jobRef.set(
        { finished_at: admin.firestore.FieldValue.serverTimestamp(), lease_until: null },
        { merge: true }
      );
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  };

  router.post("/light/run", express.json({ limit: "1mb" }), workerHandler);
  router.post("/light/worker", express.json({ limit: "1mb" }), workerHandler);

  return router;
}

module.exports = { createBlueprintsRouter };
