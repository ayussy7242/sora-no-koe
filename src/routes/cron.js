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
const { handleJobsWorker } = require("../runners/jobs/worker");
const { runDaily8 } = require("../runners/cron/daily8");
const { rebuildDaily8 } = require("../runners/cron/rebuild");
const { sendDaily8 } = require("../runners/cron/send");
const { runDailyBlog } = require("../runners/cron/blog_daily");
const { runIgPost, runIgMoonEventPost } = require("../runners/cron/ig_post");
const { runXMorningPost, runXNightPost, runXMoonEventPost, runXNext30DaysPost } = require("../runners/cron/x_post");
const { runDailyIgStoryDelivery } = require("../usecases/ig_story/run_daily_story_delivery");

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

function normalizeDateTimeLocalJST(datetimeLocalRaw) {
  const s0 = String(datetimeLocalRaw || "").trim();
  if (!s0) return null;
  const s = s0.includes(" ") && !s0.includes("T") ? s0.replace(" ", "T") : s0;
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    return isValidISO(s) ? s : null;
  }
  const withOffset = `${s}+09:00`;
  return isValidISO(withOffset) ? withOffset : null;
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
  const storage = deps.storage;
  const dict = deps.dict;

  if (!db) throw new Error("deps.db is required for cron router");
  if (!admin) throw new Error("deps.admin is required for cron router");
  if (!storyService?.buildStoryForUser) throw new Error("deps.storyService.buildStoryForUser is missing");
  if (!renderers?.renderLine || !renderers?.renderX || !renderers?.renderIG) {
    throw new Error("deps.renderers (renderLine/renderX/renderIG) is missing");
  }
  if (!renderers?.renderXMorning || !renderers?.renderXNight || !renderers?.renderXResonance) {
    throw new Error("deps.renderers (renderXMorning/renderXNight/renderXResonance) is missing");
  }

  function requireCronToken(req) {
    const token = String(req.header("x-cron-token") || "").trim();
    const CRON_TOKEN = String(env2.CRON_TOKEN || "").trim();

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
        { db, admin, env, storyService, renderers, storage },
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

      const result = await rebuildDaily8({ db, admin, env, storyService, renderers, storage }, { dateLocal, mode, target });
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

  // ✅ POST /cron/ig/story/daily : IG Story素材（画像3枚 + テキスト3本）をLINEへ送信
  router.post("/ig/story/daily", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/ig/story/daily" });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : toDateLocalJST();
      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);

      const result = await runDailyIgStoryDelivery(
        { env, storyService, storage, dict, db },
        { dateLocal, dryRun }
      );

      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/ig/story/daily" });
    }
  });

  // ✅ POST /cron/x/morning : X朝投稿（2本 + 共鳴があれば3本）
  router.post("/x/morning", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/x/morning" });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : null;

      const asOfRaw = b.as_of || q.as_of;
      const dtLocalRaw = b.datetime_local || q.datetime_local;
      const asOfISO =
        (isValidISO(asOfRaw) ? String(asOfRaw) : null) ||
        normalizeDateTimeLocalJST(dtLocalRaw) ||
        null;

      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);
      const useAiRaw = b.ai ?? q.ai;
      const useAi = useAiRaw === undefined ? true : boolish(useAiRaw);
      const orbMaxDeg = toNumberSafe(b.orb_max_deg ?? q.orb_max_deg ?? b.orbMaxDeg ?? q.orbMaxDeg, undefined);
      const precisionDeg = toNumberSafe(b.precision_deg ?? q.precision_deg ?? b.precisionDeg ?? q.precisionDeg, undefined);
      const resonanceOrbMax = toNumberSafe(b.resonance_orb_max ?? q.resonance_orb_max ?? b.resonanceOrbMax ?? q.resonanceOrbMax, undefined);

      const result = await runXMorningPost(
        { env, storyService, renderers, dict },
        { dateLocal, asOfISO, dryRun, useAi, orbMaxDeg, precisionDeg, resonanceOrbMax }
      );

      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/x/morning" });
    }
  });

  // ✅ POST /cron/x/night : X夜投稿（単発）
  router.post("/x/night", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/x/night" });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : null;

      const asOfRaw = b.as_of || q.as_of;
      const dtLocalRaw = b.datetime_local || q.datetime_local;
      const asOfISO =
        (isValidISO(asOfRaw) ? String(asOfRaw) : null) ||
        normalizeDateTimeLocalJST(dtLocalRaw) ||
        null;

      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);
      const useAiRaw = b.ai ?? q.ai;
      const useAi = useAiRaw === undefined ? true : boolish(useAiRaw);
      const orbMaxDeg = toNumberSafe(b.orb_max_deg ?? q.orb_max_deg ?? b.orbMaxDeg ?? q.orbMaxDeg, undefined);
      const precisionDeg = toNumberSafe(b.precision_deg ?? q.precision_deg ?? b.precisionDeg ?? q.precisionDeg, undefined);

      const result = await runXNightPost(
        { env, storyService, renderers, dict },
        { dateLocal, asOfISO, dryRun, useAi, orbMaxDeg, precisionDeg }
      );

      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/x/night" });
    }
  });

  // ✅ POST /cron/x/moon_event : X満月/新月イベント（該当日だけ投稿）
  router.post("/x/moon_event", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/x/moon_event" });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : null;

      const asOfRaw = b.as_of || q.as_of;
      const dtLocalRaw = b.datetime_local || q.datetime_local;
      const asOfISO =
        (isValidISO(asOfRaw) ? String(asOfRaw) : null) ||
        normalizeDateTimeLocalJST(dtLocalRaw) ||
        null;

      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);
      const useAiRaw = b.ai ?? q.ai;
      const useAi = useAiRaw === undefined ? true : boolish(useAiRaw);
      const dateOffsetDays = toNumberSafe(
        b.date_offset_days ?? q.date_offset_days ?? b.dateOffsetDays ?? q.dateOffsetDays ?? b.date_offset ?? q.date_offset,
        undefined
      );

      const result = await runXMoonEventPost(
        { env, storyService, renderers, dict },
        { dateLocal, asOfISO, dryRun, useAi, dateOffsetDays }
      );

      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/x/moon_event" });
    }
  });

  // ✅ POST /cron/x/next_30_days : Xこれからの1ヶ月（いつでも）
  router.post("/x/next_30_days", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/x/next_30_days" });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : null;

      const asOfRaw = b.as_of || q.as_of;
      const dtLocalRaw = b.datetime_local || q.datetime_local;
      const asOfISO =
        (isValidISO(asOfRaw) ? String(asOfRaw) : null) ||
        normalizeDateTimeLocalJST(dtLocalRaw) ||
        null;

      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);
      const useAiRaw = b.ai ?? q.ai;
      const useAi = useAiRaw === undefined ? true : boolish(useAiRaw);

      const result = await runXNext30DaysPost(
        { env, storyService, renderers, dict },
        { dateLocal, asOfISO, dryRun, useAi }
      );

      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/x/next_30_days" });
    }
  });

  // ✅ POST /cron/ig/post : Instagram carousel auto-post
  router.post("/ig/post", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/ig/post" });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : null;

      const asOfRaw = b.as_of || q.as_of;
      const dtLocalRaw = b.datetime_local || q.datetime_local;
      const asOfISO =
        (isValidISO(asOfRaw) ? String(asOfRaw) : null) ||
        normalizeDateTimeLocalJST(dtLocalRaw) ||
        null;

      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);
      const withCtaRaw = b.with_cta ?? q.with_cta ?? b.withCta ?? q.withCta;
      const withCta = withCtaRaw === undefined ? true : boolish(withCtaRaw);
      const useAiRaw = b.ai ?? q.ai;
      const useAi = useAiRaw === undefined ? true : boolish(useAiRaw);
      const forceAiRaw = b.force_ai ?? q.force_ai ?? b.forceAi ?? q.forceAi;
      const forceAi = forceAiRaw === undefined ? false : boolish(forceAiRaw);

      const result = await runIgPost(
        { db, admin, env, storyService, renderers, storage, dict },
        { dateLocal, asOfISO, dryRun, withCta, useAi, forceAi }
      );

      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/ig/post" });
    }
  });

  // ✅ POST /cron/ig/moon_event : IG 満月/新月カルーセル（前日投稿）
  router.post("/ig/moon_event", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/ig/moon_event" });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : null;

      const asOfRaw = b.as_of || q.as_of;
      const dtLocalRaw = b.datetime_local || q.datetime_local;
      const asOfISO =
        (isValidISO(asOfRaw) ? String(asOfRaw) : null) ||
        normalizeDateTimeLocalJST(dtLocalRaw) ||
        null;

      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);
      const withCtaRaw = b.with_cta ?? q.with_cta ?? b.withCta ?? q.withCta;
      const withCta = withCtaRaw === undefined ? true : boolish(withCtaRaw);
      const offsetRaw = b.date_offset_days ?? q.date_offset_days ?? b.dateOffsetDays ?? q.dateOffsetDays ?? b.dateOffset ?? q.dateOffset;
      const dateOffsetDays = Number.isFinite(Number(offsetRaw)) ? Number(offsetRaw) : undefined;

      const result = await runIgMoonEventPost(
        { env, storyService, storage, dict },
        { dateLocal, asOfISO, dryRun, withCta, dateOffsetDays }
      );

      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/ig/moon_event" });
    }
  });

  // ✅ POST /cron/blog/daily : WordPress 日次下書き生成
  router.post("/blog/daily", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/blog/daily" });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : toDateLocalJST();

      const asOfRaw = b.as_of || q.as_of;
      const asOfISO = isValidISO(asOfRaw) ? String(asOfRaw) : asOfIsoFromDateLocalJST(dateLocal);

      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);
      const force = boolish(b.force ?? q.force);
      const publishRaw = b.publish ?? q.publish ?? b.is_publish ?? q.is_publish;
      const publish = publishRaw === undefined ? true : boolish(publishRaw);

      const result = await runDailyBlog(
        { env: env2, storyService, db },
        { dateLocal, asOfISO, dryRun, force, publish }
      );

      return res.json(result);
    } catch (e) {
      console.error("[cron/blog/daily] error:", e?.message || String(e));
      if (e?.stack) console.error(e.stack);
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/blog/daily" });
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
