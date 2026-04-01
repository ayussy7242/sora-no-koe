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
const { safeEqual } = require("../utils/safe_equal");
const { handleJobsWorker } = require("../runners/jobs/worker");
const { runDaily8 } = require("../runners/cron/daily8");
const { rebuildDaily8 } = require("../runners/cron/rebuild");
const { sendDaily8 } = require("../runners/cron/send");
const { runDailyBlog } = require("../runners/cron/blog_daily");
const { runIgPost, runIgMoonEventPost } = require("../runners/cron/ig_post");
const { runXMorningPost, runXNightPost, runXMoonEventPost, runXNext30DaysPost } = require("../runners/cron/x_post");
const { runDailyIgStoryDelivery } = require("../usecases/channels/instagram/story/run_daily_delivery");
const {
  getRequestParts,
  pickMode,
  pickTarget,
  pickDateLocal,
  pickAsOfISO,
  pickDryRun,
  pickBoolFlag,
  pickNumberFlag,
} = require("../usecases/cron/utils");
const { memorySnapshot, logWithReq } = require("../utils/logging");


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

  function stripQuery(url) {
    if (!url) return "";
    const idx = url.indexOf("?");
    return idx === -1 ? url : url.slice(0, idx);
  }

  function requireCronToken(req) {
    const token = String(req.header("x-cron-token") || "").trim();
    const CRON_TOKEN = String(env2.CRON_TOKEN || "").trim();

    if (!CRON_TOKEN) return { ok: false, status: 500, message: "CRON_TOKEN is not set" };
    if (!safeEqual(token, CRON_TOKEN)) return { ok: false, status: 401, message: "invalid cron token" };
    return { ok: true };
  }

  function logCronError(path, err, req) {
    const message = err?.message || String(err);
    const error_code = err?.code || err?.name || null;
    const meta = {
      path,
      method: req?.method,
      url: stripQuery(req?.originalUrl),
      error_code,
    };
    console.error(`[cron] error ${path}`, { message, ...meta });
    if (err?.stack) console.error(err.stack);
  }

  function logCronPhase(req, label, meta = {}) {
    logWithReq(req, label, { ...meta, mem: memorySnapshot() });
  }

  function cronError(res, req, path, err) {
    logCronError(path, err, req);
    const error_code = err?.code || err?.name || null;
    return res.status(500).json({
      ok: false,
      error: err?.message || String(err),
      error_code,
      path,
    });
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
      const { q, b } = getRequestParts(req);
      const dateLocal = pickDateLocal({ q, b, fallbackNow: true });
      const dryRun = pickDryRun({ q, b });
      const mode = pickMode({ q, b });
      const target = pickTarget({ q, b });
      const local = pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false });
      const localOutDir = b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;

      const result = await runDaily8(
        { db, admin, env, storyService, renderers, storage },
        { dateLocal, dryRun, mode, target, local, localOutDir }
      );

      return res.json(result);
    } catch (e) {
      return cronError(res, req, "/cron/daily8", e);
    }
  });

  router.post("/rebuild8", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message });

    try {
      const { q, b } = getRequestParts(req);
      const dateLocal = pickDateLocal({ q, b, fallbackNow: true });
      const mode = pickMode({ q, b });
      const target = pickTarget({ q, b });
      const local = pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false });
      const localOutDir = b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;

      const result = await rebuildDaily8(
        { db, admin, env, storyService, renderers, storage },
        { dateLocal, mode, target, local, localOutDir }
      );
      return res.json(result);
    } catch (e) {
      return cronError(res, req, "/cron/rebuild8", e);
    }
  });
  
  router.post("/send8", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message });

    try {
      const { q, b } = getRequestParts(req);
      const dateLocal = pickDateLocal({ q, b, fallbackNow: true });
      const target = pickTarget({ q, b });
      const dryRun = pickDryRun({ q, b });
      const local = pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false });
      const localOutDir = b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;

      // ✅ 追加：dryRun を sendDaily8 に渡す
      const result = await sendDaily8({ db, admin, env }, { dateLocal, target, dryRun, local, localOutDir });

      return res.json(result);
    } catch (e) {
      return cronError(res, req, "/cron/send8", e);
    }
  });

  // ✅ POST /cron/ig/story/daily : IG Story素材（画像3枚 + テキスト3本）をLINEへ送信
  router.post("/ig/story/daily", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/ig/story/daily" });

    try {
      const t0 = Date.now();
      logCronPhase(req, "[cron/ig/story/daily] start", { url: stripQuery(req?.originalUrl) });
      const { q, b } = getRequestParts(req);
      const dateLocal = pickDateLocal({ q, b, fallbackNow: true });
      const dryRun = pickDryRun({ q, b });
      const textOnly = pickBoolFlag({ q, b, keys: ["text_only", "textOnly", "textonly"], defaultValue: false });
      const local = pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false });
      const localOutDir = b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;
      const force = pickBoolFlag({
        q,
        b,
        keys: ["force", "force_lock", "forceLock"],
        defaultValue: false,
      });

      const result = await runDailyIgStoryDelivery(
        { env, storyService, storage, dict, db, admin },
        { dateLocal, dryRun, textOnly, force, local, localOutDir }
      );

      logCronPhase(req, "[cron/ig/story/daily] done", {
        ok: result?.ok,
        skipped: result?.skipped,
        reason: result?.reason,
        date_local: result?.date_local,
        ms: Date.now() - t0,
      });
      return res.json(result);
    } catch (e) {
      return cronError(res, req, "/cron/ig/story/daily", e);
    }
  });

  // ✅ POST /cron/x/morning : X朝投稿（2本 + 共鳴があれば3本）
  router.post("/x/morning", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/x/morning" });

    try {
      const t0 = Date.now();
      const { q, b } = getRequestParts(req);
      const dateLocal = pickDateLocal({ q, b, fallbackNow: false });
      const asOfISO = pickAsOfISO({ q, b, dateLocal, fallbackFromDateLocal: false });
      const dryRun = pickDryRun({ q, b });
      const useAi = pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true });
      const orbMaxDeg = pickNumberFlag({ q, b, keys: ["orb_max_deg", "orbMaxDeg"], defaultValue: undefined });
      const precisionDeg = pickNumberFlag({ q, b, keys: ["precision_deg", "precisionDeg"], defaultValue: undefined });
      const resonanceOrbMax = pickNumberFlag({
        q,
        b,
        keys: ["resonance_orb_max", "resonanceOrbMax"],
        defaultValue: undefined,
      });
      const local = pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false });
      const localOutDir = b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;

      logCronPhase(req, "[cron/x/morning] start", {
        date_local: dateLocal,
        as_of: asOfISO,
        dry_run: dryRun,
        use_ai: useAi,
      });
      const result = await runXMorningPost(
        { env, storyService, renderers, dict, db },
        { dateLocal, asOfISO, dryRun, useAi, orbMaxDeg, precisionDeg, resonanceOrbMax, local, localOutDir }
      );

      logCronPhase(req, "[cron/x/morning] done", { ok: result?.ok, ms: Date.now() - t0 });
      return res.json(result);
    } catch (e) {
      return cronError(res, req, "/cron/x/morning", e);
    }
  });

  // ✅ POST /cron/x/night : X夜投稿（単発）
  router.post("/x/night", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/x/night" });

    try {
      const t0 = Date.now();
      const { q, b } = getRequestParts(req);
      const dateLocal = pickDateLocal({ q, b, fallbackNow: false });
      const asOfISO = pickAsOfISO({ q, b, dateLocal, fallbackFromDateLocal: false });
      const dryRun = pickDryRun({ q, b });
      const useAi = pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true });
      const orbMaxDeg = pickNumberFlag({ q, b, keys: ["orb_max_deg", "orbMaxDeg"], defaultValue: undefined });
      const precisionDeg = pickNumberFlag({ q, b, keys: ["precision_deg", "precisionDeg"], defaultValue: undefined });
      const local = pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false });
      const localOutDir = b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;

      logCronPhase(req, "[cron/x/night] start", {
        date_local: dateLocal,
        as_of: asOfISO,
        dry_run: dryRun,
        use_ai: useAi,
      });
      const result = await runXNightPost(
        { env, storyService, renderers, dict, db },
        { dateLocal, asOfISO, dryRun, useAi, orbMaxDeg, precisionDeg, local, localOutDir }
      );

      logCronPhase(req, "[cron/x/night] done", { ok: result?.ok, ms: Date.now() - t0 });
      return res.json(result);
    } catch (e) {
      return cronError(res, req, "/cron/x/night", e);
    }
  });

  // ✅ POST /cron/x/moon_event : X満月/新月イベント（該当日だけ投稿）
  router.post("/x/moon_event", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/x/moon_event" });

    try {
      const t0 = Date.now();
      const { q, b } = getRequestParts(req);
      const dateLocal = pickDateLocal({ q, b, fallbackNow: false });
      const asOfISO = pickAsOfISO({ q, b, dateLocal, fallbackFromDateLocal: false });
      const dryRun = pickDryRun({ q, b });
      const useAi = pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true });
      const dateOffsetDays = pickNumberFlag({
        q,
        b,
        keys: ["date_offset_days", "dateOffsetDays", "date_offset", "dateOffset"],
        defaultValue: undefined,
      });
      const local = pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false });
      const localOutDir = b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;

      logCronPhase(req, "[cron/x/moon_event] start", {
        date_local: dateLocal,
        as_of: asOfISO,
        dry_run: dryRun,
        use_ai: useAi,
        date_offset_days: dateOffsetDays,
      });
      const result = await runXMoonEventPost(
        { env, storyService, renderers, dict, db },
        { dateLocal, asOfISO, dryRun, useAi, dateOffsetDays, local, localOutDir }
      );

      logCronPhase(req, "[cron/x/moon_event] done", { ok: result?.ok, ms: Date.now() - t0 });
      return res.json(result);
    } catch (e) {
      return cronError(res, req, "/cron/x/moon_event", e);
    }
  });

  // ✅ POST /cron/x/next_30_days : Xこれからの1ヶ月（いつでも）
  router.post("/x/next_30_days", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/x/next_30_days" });

    try {
      const t0 = Date.now();
      const { q, b } = getRequestParts(req);
      const dateLocal = pickDateLocal({ q, b, fallbackNow: false });
      const asOfISO = pickAsOfISO({ q, b, dateLocal, fallbackFromDateLocal: false });
      const dryRun = pickDryRun({ q, b });
      const useAi = pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true });
      const local = pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false });
      const localOutDir = b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;

      logCronPhase(req, "[cron/x/next_30_days] start", {
        date_local: dateLocal,
        as_of: asOfISO,
        dry_run: dryRun,
        use_ai: useAi,
      });
      const result = await runXNext30DaysPost(
        { env, storyService, renderers, dict, db },
        { dateLocal, asOfISO, dryRun, useAi, local, localOutDir }
      );

      logCronPhase(req, "[cron/x/next_30_days] done", { ok: result?.ok, ms: Date.now() - t0 });
      return res.json(result);
    } catch (e) {
      return cronError(res, req, "/cron/x/next_30_days", e);
    }
  });

  // ✅ POST /cron/ig/post : Instagram carousel auto-post
  router.post("/ig/post", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/ig/post" });

    try {
      const t0 = Date.now();
      logCronPhase(req, "[cron/ig/post] start", { url: stripQuery(req?.originalUrl) });
      const { q, b } = getRequestParts(req);
      const dateLocal = pickDateLocal({ q, b, fallbackNow: false });
      const asOfISO = pickAsOfISO({ q, b, dateLocal, fallbackFromDateLocal: false });
      const dryRun = pickDryRun({ q, b });
      const withCta = pickBoolFlag({ q, b, keys: ["with_cta", "withCta"], defaultValue: true });
      const useAi = pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true });
      const forceAi = pickBoolFlag({ q, b, keys: ["force_ai", "forceAi"], defaultValue: false });
      const local = pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false });
      const localOutDir = b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;
      const force = pickBoolFlag({
        q,
        b,
        keys: ["force", "force_lock", "forceLock"],
        defaultValue: false,
      });

      const result = await runIgPost(
        { db, admin, env, storyService, renderers, storage, dict },
        { dateLocal, asOfISO, dryRun, withCta, useAi, forceAi, local, localOutDir, force }
      );

      logCronPhase(req, "[cron/ig/post] done", {
        ok: result?.ok,
        skipped: result?.skipped,
        reason: result?.reason,
        date_local: result?.date_local,
        ms: Date.now() - t0,
      });
      return res.json(result);
    } catch (e) {
      return cronError(res, req, "/cron/ig/post", e);
    }
  });

  // ✅ POST /cron/ig/moon_event : IG 満月/新月カルーセル（前日投稿）
  router.post("/ig/moon_event", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/ig/moon_event" });

    try {
      const { q, b } = getRequestParts(req);
      const dateLocal = pickDateLocal({ q, b, fallbackNow: false });
      const asOfISO = pickAsOfISO({ q, b, dateLocal, fallbackFromDateLocal: false });
      const dryRun = pickDryRun({ q, b });
      const withCta = pickBoolFlag({ q, b, keys: ["with_cta", "withCta"], defaultValue: true });
      const dateOffsetDays = pickNumberFlag({
        q,
        b,
        keys: ["date_offset_days", "dateOffsetDays", "date_offset", "dateOffset"],
        defaultValue: undefined,
      });
      const useAi = pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true });
      const forceAi = pickBoolFlag({ q, b, keys: ["force_ai", "forceAi"], defaultValue: false });
      const local = pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false });
      const localOutDir = b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;
      const forceNext = pickBoolFlag({
        q,
        b,
        keys: ["force_next", "forceNext", "use_next", "useNext"],
        defaultValue: false,
      });
      const fullFlag = pickBoolFlag({
        q,
        b,
        keys: ["full", "full_moon", "fullMoon", "moon_full"],
        defaultValue: false,
      });
      const newFlag = pickBoolFlag({
        q,
        b,
        keys: ["new", "new_moon", "newMoon", "moon_new"],
        defaultValue: false,
      });
      const eventKindRaw = b?.event_kind ?? q?.event_kind ?? b?.eventKind ?? q?.eventKind ?? b?.moon_event_kind ?? q?.moon_event_kind;
      const eventKind = eventKindRaw
        ? String(eventKindRaw)
        : (fullFlag && !newFlag)
          ? "full"
          : (!fullFlag && newFlag)
            ? "new"
            : "";

      const result = await runIgMoonEventPost(
        { env, storyService, storage, dict, db },
        { dateLocal, asOfISO, dryRun, withCta, dateOffsetDays, useAi, forceAi, local, localOutDir, forceNext, eventKind }
      );

      return res.json(result);
    } catch (e) {
      return cronError(res, req, "/cron/ig/moon_event", e);
    }
  });

  // ✅ POST /cron/blog/daily : WordPress 日次下書き生成
  router.post("/blog/daily", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/blog/daily" });

    try {
      const t0 = Date.now();
      const { q, b } = getRequestParts(req);
      const dateLocal = pickDateLocal({ q, b, fallbackNow: true });
      const asOfISO = pickAsOfISO({ q, b, dateLocal, fallbackFromDateLocal: true });
      const dryRun = pickDryRun({ q, b });
      const force = pickBoolFlag({ q, b, keys: ["force"], defaultValue: false });
      const publish = pickBoolFlag({ q, b, keys: ["publish", "is_publish"], defaultValue: true });
      const local = pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false });
      const localOutDir = b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;

      logCronPhase(req, "[cron/blog/daily] start", {
        date_local: dateLocal,
        as_of: asOfISO,
        dry_run: dryRun,
        force,
        publish,
      });
      const result = await runDailyBlog(
        { env: env2, storyService, db },
        { dateLocal, asOfISO, dryRun, force, publish, local, localOutDir }
      );

      logCronPhase(req, "[cron/blog/daily] done", { ok: result?.ok, ms: Date.now() - t0 });
      return res.json(result);
    } catch (e) {
      return cronError(res, req, "/cron/blog/daily", e);
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
      return cronError(res, req, "/cron/worker", e);
    }
  });

  return router;
}

module.exports = { createCronRouter };
