/*  定期配信は 2段構えで固定：
 *  - 07:58  /cron/rebuild8  : story再生成 + text再生成 → outbox保存（送信しない）
 *  - 08:00  /cron/send8     : outboxを読むだけでLINE push（生成しない）
 *
 * /cron/daily8 は “レガシー兼デバッグ用”：
 *  - 生成 + 即送信（outboxを使わない）
 *  - Cloud Schedulerの定期運用では使用しない（手動検証・臨時配信向け）
 *
 * mode:
 *  - today : personal（storyService mode="auto"）
 *  - sky   : public sky（appUserId="public", mode="public"）
 *
 * target:
 *  - owner : OWNER_APP_USER_ID + OWNER_LINE_USER_ID のみ
 *  - all   : users条件（active / natal.enabled / natal.delivery.daily_8）に合う全員
 */

"use strict";

const express = require("express");
const { handleJobsWorker } = require("../jobs/worker");
const { runDaily8 } = require("../cron/daily8");
const { rebuildDaily8 } = require("../cron/rebuild");
const { sendDaily8 } = require("../cron/send");

// -------------------- helpers --------------------
function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toDateLocalJST(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function asOfIsoFromDateLocalJST(dateLocal) {
  return `${dateLocal}T03:00:00.000Z`;
}

function toNumberSafe(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function isValidISO(s) {
  if (typeof s !== "string" || !s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function boolish(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v !== "string") return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function normLower(x, fallback = "") {
  const s = x == null ? "" : String(x);
  const t = s.trim().toLowerCase();
  return t || fallback;
}

function pickMode(x) {
  const m = normLower(x, "today");
  return m === "sky" ? "sky" : "today";
}

function pickTarget(x) {
  const t = normLower(x, "all");
  return t === "owner" ? "owner" : "all";
}


// -------------------- router factory --------------------
function createCronRouter(deps = {}) {
  const router = express.Router();

  // ✅ ここ超重要：cron配下だけでも body を確実に読む
  router.use(express.json({ limit: "1mb" }));

  const env = deps.env || {};
  const env2 = { ...(env || {}), ...(process.env || {}) };
  const db = deps.db;
  const admin = deps.admin;
  const swisseph = deps.swisseph;
  const storyService = deps.storyService;
  const renderers = deps.renderers;

  if (!db) throw new Error("deps.db is required for cron router");
  if (!admin) throw new Error("deps.admin is required for cron router");
  if (!storyService?.buildStoryForUser) throw new Error("deps.storyService.buildStoryForUser is missing");
  if (!renderers?.renderLine || !renderers?.renderX || !renderers?.renderIG) {
    throw new Error("deps.renderers (renderLine/renderX/renderIG) is missing");
  }

  function requireCronToken(req) {
    const token = req.header("x-cron-token") || "";
    const CRON_TOKEN = env2.CRON_TOKEN;

    if (!CRON_TOKEN) return { ok: false, status: 500, message: "CRON_TOKEN is not set" };
    if (String(token) !== String(CRON_TOKEN)) return { ok: false, status: 401, message: "invalid cron token" };
    return { ok: true };
  }

  router.get("/health", (_req, res) => {
    return res.json({
      ok: true,
      project: env.PROJECT,
      timezone: env.DEFAULT_TZ,
      schema_version: env.SCHEMA_VERSION,
      has_swisseph: !!swisseph,
      has_cron_token: !!env.CRON_TOKEN,
    });
  });


  // ✅ POST /cron/daily8 : LINE配信 + posts_daily_delivery ログ
  router.post("/daily8", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/daily8" });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : toDateLocalJST();
      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);

      const mode = pickMode(b.mode ?? q.mode);
      const target = pickTarget(b.target ?? q.target);

      const result = await runDaily8(
        { db, admin, env, storyService, renderers },
        { dateLocal, dryRun, mode, target }
      );

      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/daily8" });
    }
  });

  router.post("/rebuild8", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message });

    try {
      const q = req.query || {};
      const b = req.body || {};
      const dateLocal = isYYYYMMDD(b.date_local || q.date_local) ? String(b.date_local || q.date_local) : toDateLocalJST();
      const mode = pickMode(b.mode ?? q.mode);
      const target = pickTarget(b.target ?? q.target);

      const result = await rebuildDaily8({ db, admin, env, storyService, renderers }, { dateLocal, mode, target });
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });
  
  router.post("/send8", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : toDateLocalJST();

      const target = pickTarget(b.target ?? q.target);

      // ✅ 追加：dry_run を拾う（クエリ/ボディ両対応）
      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);

      // ✅ 追加：dryRun を sendDaily8 に渡す
      const result = await sendDaily8({ db, admin, env }, { dateLocal, target, dryRun });

      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/send8" });
    }
  });


  // POST /cron/worker : jobs_natal_calc を 1件処理
  router.post("/worker", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/worker" });

    const ok = (res, payload) => res.status(200).json({ ok: true, ...payload });
    const bad = (res, status, message, extra = {}) =>
      res.status(status || 500).json({ ok: false, error: message, ...extra });

    try {
      if (!swisseph) return bad(res, 500, "deps.swisseph missing");
      return await handleJobsWorker(req, res, { db, admin, env, ok, bad, swisseph });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/worker" });
    }
  });

  return router;
}

module.exports = { createCronRouter };

