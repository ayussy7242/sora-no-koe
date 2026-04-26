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
const { runDaily8, rebuildDaily8, sendDaily8, runBlueprintResend } = require("../runners/cron/line");
const { runDailyBlog } = require("../runners/cron/blog");
const {
  runIgPost,
  runIgMorningPost,
  runIgResonancePost,
  runIgNightPost,
  runIgMoonEventPost,
  runIgMonthlyPost,
  runIgMonthlyOverviewReel,
} = require("../runners/cron/instagram");
const { runXMorningPost, runXResonancePost, runXNightPost, runXMoonEventPost, runXNext30DaysPost } = require("../runners/cron/x");
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
const { assertDeps } = require("../utils/infra/assert");
const { resolveEnv } = require("../utils/env");
const { createCronTokenGuard, logCronPhase, cronError, registerCronPostRoute } = require("./cron_helpers");


// -------------------- router factory --------------------
function createCronRouter(deps = {}) {
  const router = express.Router();

  // ✅ ここ超重要：cron配下だけでも body を確実に読む
  router.use(express.json({ limit: "1mb" }));

  const env = deps.env || {};
  const env2 = resolveEnv(env);
  const db = deps.db;
  const admin = deps.admin;
  const swisseph = deps.swisseph;
  const storyService = deps.storyService;
  const renderers = deps.renderers;
  const storage = deps.storage;
  const dict = deps.dict;

  assertDeps(deps, ["db", "admin", "storyService.buildStoryForUser"], { label: "deps" });
  assertDeps(deps, ["renderers.renderLine", "renderers.renderX", "renderers.renderIG"], { label: "deps" });
  assertDeps(deps, ["renderers.renderXMorning", "renderers.renderXNight", "renderers.renderXResonance"], { label: "deps" });

  const requireCronToken = createCronTokenGuard({ env: env2 });

  function getLocalOutDir(q = {}, b = {}) {
    return b?.local_out_dir ?? q?.local_out_dir ?? b?.localOutDir ?? q?.localOutDir;
  }

  function getBaseCronOptions(req, { fallbackNow = false, fallbackFromDateLocal = false } = {}) {
    const { q, b } = getRequestParts(req);
    const dateLocal = pickDateLocal({ q, b, fallbackNow });
    const asOfISO = pickAsOfISO({ q, b, dateLocal, fallbackFromDateLocal });
    return { q, b, dateLocal, asOfISO };
  }

  function registerCronRoutes(definitions = []) {
    definitions.forEach((definition) => registerCronPostRoute(router, definition));
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


  registerCronPostRoute(router, {
    path: "/daily8",
    requireCronToken,
    buildOptions: (req) => {
      const { q, b, dateLocal } = getBaseCronOptions(req, { fallbackNow: true });
      return {
        dateLocal,
        dryRun: pickDryRun({ q, b }),
        mode: pickMode({ q, b }),
        target: pickTarget({ q, b }),
        debug: pickBoolFlag({ q, b, keys: ["debug"], defaultValue: false }),
        local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
        localOutDir: getLocalOutDir(q, b),
      };
    },
    run: ({ opts }) => runDaily8({ db, admin, env, storyService, renderers, storage }, opts),
  });

  registerCronPostRoute(router, {
    path: "/rebuild8",
    requireCronToken,
    buildOptions: (req) => {
      const { q, b, dateLocal } = getBaseCronOptions(req, { fallbackNow: true });
      return {
        dateLocal,
        mode: pickMode({ q, b }),
        target: pickTarget({ q, b }),
        local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
        localOutDir: getLocalOutDir(q, b),
      };
    },
    run: ({ opts }) => rebuildDaily8({ db, admin, env, storyService, renderers, storage }, opts),
  });
  
  registerCronPostRoute(router, {
    path: "/send8",
    requireCronToken,
    buildOptions: (req) => {
      const { q, b, dateLocal } = getBaseCronOptions(req, { fallbackNow: true });
      return {
        dateLocal,
        target: pickTarget({ q, b }),
        dryRun: pickDryRun({ q, b }),
        local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
        localOutDir: getLocalOutDir(q, b),
      };
    },
    run: ({ opts }) => sendDaily8({ db, admin, env }, opts),
  });

  registerCronPostRoute(router, {
    path: "/blueprint/resend",
    requireCronToken,
    buildOptions: (req) => {
      const { q, b, dateLocal } = getBaseCronOptions(req, { fallbackNow: true });
      return {
        dateLocal,
        target: pickTarget({ q, b }),
        dryRun: pickDryRun({ q, b }),
        includeInactive: pickBoolFlag({ q, b, keys: ["include_inactive", "includeInactive"], defaultValue: false }),
        includeDone: pickBoolFlag({ q, b, keys: ["include_done", "includeDone"], defaultValue: false }),
        forceRegen: pickBoolFlag({ q, b, keys: ["force_regen", "forceRegen", "force"], defaultValue: false }),
        limit: pickNumberFlag({ q, b, keys: ["limit"], defaultValue: 0 }),
        line_user_id: b?.line_user_id ?? q?.line_user_id ?? b?.lineUserId ?? q?.lineUserId ?? null,
        app_user_id: b?.app_user_id ?? q?.app_user_id ?? b?.appUserId ?? q?.appUserId ?? null,
      };
    },
    run: ({ opts }) => runBlueprintResend({ db, admin, env, storage, dict }, opts),
  });

  registerCronPostRoute(router, {
    path: "/ig/story/daily",
    requireCronToken,
    logLabel: "[cron/ig/story/daily]",
    logMeta: (phase, result) => phase === "start"
      ? { endpoint: "ig_story_daily" }
      : {
          ok: result?.ok,
          skipped: result?.skipped,
          reason: result?.reason,
          date_local: result?.date_local,
        },
    buildOptions: (req) => {
      const { q, b, dateLocal } = getBaseCronOptions(req, { fallbackNow: true });
      return {
        dateLocal,
        dryRun: pickDryRun({ q, b }),
        textOnly: pickBoolFlag({ q, b, keys: ["text_only", "textOnly", "textonly"], defaultValue: false }),
        local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
        localOutDir: getLocalOutDir(q, b),
        force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
      };
    },
    run: ({ opts }) => runDailyIgStoryDelivery({ env, storyService, storage, dict, db, admin }, opts),
  });

  registerCronRoutes([
    {
      path: "/x/morning",
      requireCronToken,
      logLabel: "[cron/x/morning]",
      logMeta: (phase, result) => phase === "start" ? { endpoint: "x_morning" } : { ok: result?.ok },
      buildOptions: (req) => {
        const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: true });
        return {
          dateLocal,
          asOfISO,
          dryRun: pickDryRun({ q, b }),
          useAi: pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true }),
          forceAi: pickBoolFlag({ q, b, keys: ["force_ai", "forceAi"], defaultValue: false }),
          orbMaxDeg: pickNumberFlag({ q, b, keys: ["orb_max_deg", "orbMaxDeg"], defaultValue: undefined }),
          precisionDeg: pickNumberFlag({ q, b, keys: ["precision_deg", "precisionDeg"], defaultValue: undefined }),
          resonanceOrbMax: pickNumberFlag({ q, b, keys: ["resonance_orb_max", "resonanceOrbMax"], defaultValue: undefined }),
          image: pickBoolFlag({ q, b, keys: ["image", "with_image", "withImage", "image_enabled", "imageEnabled"] }),
          force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
          local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
          localOutDir: getLocalOutDir(q, b),
        };
      },
      run: ({ opts }) => runXMorningPost({ env, storyService, renderers, dict, db }, opts),
    },
    {
      path: "/x/resonance",
      requireCronToken,
      logLabel: "[cron/x/resonance]",
      logMeta: (phase, result) => phase === "start" ? { endpoint: "x_resonance" } : { ok: result?.ok },
      buildOptions: (req) => {
        const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: false });
        return {
          dateLocal,
          asOfISO,
          dryRun: pickDryRun({ q, b }),
          useAi: pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true }),
          resonanceOrbMax: pickNumberFlag({ q, b, keys: ["resonance_orb_max", "resonanceOrbMax"], defaultValue: undefined }),
          resonanceTriggerOrbMax: pickNumberFlag({ q, b, keys: ["resonance_trigger_orb_max", "resonanceTriggerOrbMax"], defaultValue: undefined }),
          debug: pickBoolFlag({ q, b, keys: ["debug"], defaultValue: false }),
          image: pickBoolFlag({ q, b, keys: ["image", "with_image", "withImage", "image_enabled", "imageEnabled"] }),
          force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
          local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
          localOutDir: getLocalOutDir(q, b),
        };
      },
      run: ({ opts }) => runXResonancePost({ env, storyService, renderers, dict, db }, opts),
    },
    {
      path: "/x/night",
      requireCronToken,
      logLabel: "[cron/x/night]",
      logMeta: (phase, result) => phase === "start" ? { endpoint: "x_night" } : { ok: result?.ok },
      buildOptions: (req) => {
        const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: false });
        return {
          dateLocal,
          asOfISO,
          dryRun: pickDryRun({ q, b }),
          useAi: pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true }),
          orbMaxDeg: pickNumberFlag({ q, b, keys: ["orb_max_deg", "orbMaxDeg"], defaultValue: undefined }),
          precisionDeg: pickNumberFlag({ q, b, keys: ["precision_deg", "precisionDeg"], defaultValue: undefined }),
          image: pickBoolFlag({ q, b, keys: ["image", "with_image", "withImage", "image_enabled", "imageEnabled"] }),
          force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
          local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
          localOutDir: getLocalOutDir(q, b),
        };
      },
      run: ({ opts }) => runXNightPost({ env, storyService, renderers, dict, db }, opts),
    },
    {
      path: "/x/moon_event",
      requireCronToken,
      logLabel: "[cron/x/moon_event]",
      logMeta: (phase, result) => phase === "start" ? { endpoint: "x_moon_event" } : { ok: result?.ok },
      buildOptions: (req) => {
        const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: false });
        return {
          dateLocal,
          asOfISO,
          dryRun: pickDryRun({ q, b }),
          useAi: pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true }),
          dateOffsetDays: pickNumberFlag({ q, b, keys: ["date_offset_days", "dateOffsetDays", "date_offset", "dateOffset"], defaultValue: undefined }),
          force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
          local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
          localOutDir: getLocalOutDir(q, b),
        };
      },
      run: ({ opts }) => runXMoonEventPost({ env, storyService, renderers, dict, db }, opts),
    },
    {
      path: "/x/next_30_days",
      requireCronToken,
      logLabel: "[cron/x/next_30_days]",
      logMeta: (phase, result) => phase === "start" ? { endpoint: "x_next_30_days" } : { ok: result?.ok },
      buildOptions: (req) => {
        const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: false });
        return {
          dateLocal,
          asOfISO,
          dryRun: pickDryRun({ q, b }),
          useAi: pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true }),
          force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
          local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
          localOutDir: getLocalOutDir(q, b),
        };
      },
      run: ({ opts }) => runXNext30DaysPost({ env, storyService, renderers, dict, db }, opts),
    },
  ]);

  registerCronRoutes([
    {
      path: "/ig/post",
      requireCronToken,
      logLabel: "[cron/ig/post]",
      logMeta: (phase, result) => phase === "start"
        ? { endpoint: "ig_post" }
        : { ok: result?.ok, skipped: result?.skipped, reason: result?.reason, date_local: result?.date_local },
      buildOptions: (req) => {
        const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: false });
        return {
          dateLocal,
          asOfISO,
          slot: b?.slot ?? q?.slot ?? "",
          dryRun: pickDryRun({ q, b }),
          withCta: pickBoolFlag({ q, b, keys: ["with_cta", "withCta"], defaultValue: true }),
          useAi: pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true }),
          forceAi: pickBoolFlag({ q, b, keys: ["force_ai", "forceAi"], defaultValue: false }),
          local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
          localOutDir: getLocalOutDir(q, b),
          force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
        };
      },
      run: ({ opts }) => runIgPost({ db, admin, env, storyService, renderers, storage, dict }, opts),
    },
  ]);

  registerCronPostRoute(router, {
    path: "/ig/monthly",
    requireCronToken,
    logLabel: "[cron/ig/monthly]",
    logMeta: (phase, result) => phase === "start"
      ? { endpoint: "ig_monthly" }
      : { ok: result?.ok, skipped: result?.skipped, reason: result?.reason, month: result?.month },
    buildOptions: (req) => {
      const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: false });
      return {
        dateLocal,
        month: b?.month ?? q?.month ?? (dateLocal ? String(dateLocal).slice(0, 7) : undefined),
        asOfISO,
        dryRun: pickDryRun({ q, b }),
        useAi: pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true }),
        forceAi: pickBoolFlag({ q, b, keys: ["force_ai", "forceAi"], defaultValue: false }),
        local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
        localOutDir: getLocalOutDir(q, b),
        force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
      };
    },
    run: ({ opts }) => runIgMonthlyPost({ db, admin, env, storyService, renderers, storage, dict }, opts),
  });

  registerCronPostRoute(router, {
    path: "/ig/monthly_overview_reel",
    requireCronToken,
    logLabel: "[cron/ig/monthly_overview_reel]",
    logMeta: (phase, result) => phase === "start"
      ? { endpoint: "ig_monthly_overview_reel" }
      : { ok: result?.ok, skipped: result?.skipped, reason: result?.reason, month: result?.month },
    buildOptions: (req) => {
      const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: false });
      return {
        dateLocal,
        month: b?.month ?? q?.month ?? (dateLocal ? String(dateLocal).slice(0, 7) : undefined),
        asOfISO,
        dryRun: pickDryRun({ q, b }),
        local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
        localOutDir: getLocalOutDir(q, b),
        fps: pickNumberFlag({ q, b, keys: ["fps", "frame_rate", "frameRate"], defaultValue: null }),
        outroSeconds: pickNumberFlag({ q, b, keys: ["outro_seconds", "outroSeconds"], defaultValue: null }),
        outro: pickBoolFlag({ q, b, keys: ["outro"], defaultValue: true }),
        video: pickBoolFlag({ q, b, keys: ["video"], defaultValue: true }),
        force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
      };
    },
    run: ({ opts }) => runIgMonthlyOverviewReel({ db, admin, env, storyService, storage, dict }, opts),
  });

  registerCronRoutes([
    {
      path: "/ig/morning",
      requireCronToken,
      logLabel: "[cron/ig/morning]",
      logMeta: (phase, result) => phase === "start"
        ? { endpoint: "ig_morning" }
        : { ok: result?.ok, skipped: result?.skipped, reason: result?.reason, date_local: result?.date_local },
      buildOptions: (req) => {
        const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: false });
        return {
          dateLocal,
          asOfISO,
          dryRun: pickDryRun({ q, b }),
          withCta: pickBoolFlag({ q, b, keys: ["with_cta", "withCta"], defaultValue: true }),
          useAi: pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true }),
          forceAi: pickBoolFlag({ q, b, keys: ["force_ai", "forceAi"], defaultValue: false }),
          local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
          localOutDir: getLocalOutDir(q, b),
          force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
        };
      },
      run: ({ opts }) => runIgMorningPost({ db, admin, env, storyService, renderers, storage, dict }, opts),
    },
    {
      path: "/ig/resonance",
      requireCronToken,
      logLabel: "[cron/ig/resonance]",
      logMeta: (phase, result) => phase === "start"
        ? { endpoint: "ig_resonance" }
        : { ok: result?.ok, skipped: result?.skipped, reason: result?.reason, date_local: result?.date_local },
      buildOptions: (req) => {
        const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: false });
        return {
          dateLocal,
          asOfISO,
          dryRun: pickDryRun({ q, b }),
          useAi: pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true }),
          forceAi: pickBoolFlag({ q, b, keys: ["force_ai", "forceAi"], defaultValue: false }),
          local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
          localOutDir: getLocalOutDir(q, b),
          force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
        };
      },
      run: ({ opts }) => runIgResonancePost({ db, admin, env, storyService, renderers, storage, dict }, opts),
    },
    {
      path: "/ig/night",
      requireCronToken,
      logLabel: "[cron/ig/night]",
      logMeta: (phase, result) => phase === "start"
        ? { endpoint: "ig_night" }
        : { ok: result?.ok, skipped: result?.skipped, reason: result?.reason, date_local: result?.date_local },
      buildOptions: (req) => {
        const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: false });
        return {
          dateLocal,
          asOfISO,
          dryRun: pickDryRun({ q, b }),
          useAi: pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true }),
          forceAi: pickBoolFlag({ q, b, keys: ["force_ai", "forceAi"], defaultValue: false }),
          local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
          localOutDir: getLocalOutDir(q, b),
          force: pickBoolFlag({ q, b, keys: ["force", "force_lock", "forceLock"], defaultValue: false }),
        };
      },
      run: ({ opts }) => runIgNightPost({ db, admin, env, storyService, renderers, storage, dict }, opts),
    },

    {
      path: "/ig/moon_event",
      requireCronToken,
      buildOptions: (req) => {
        const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: false });
        const fullFlag = pickBoolFlag({ q, b, keys: ["full", "full_moon", "fullMoon", "moon_full"], defaultValue: false });
        const newFlag = pickBoolFlag({ q, b, keys: ["new", "new_moon", "newMoon", "moon_new"], defaultValue: false });
        const eventKindRaw = b?.event_kind ?? q?.event_kind ?? b?.eventKind ?? q?.eventKind ?? b?.moon_event_kind ?? q?.moon_event_kind;
        return {
          dateLocal,
          asOfISO,
          dryRun: pickDryRun({ q, b }),
          withCta: pickBoolFlag({ q, b, keys: ["with_cta", "withCta"], defaultValue: true }),
          dateOffsetDays: pickNumberFlag({ q, b, keys: ["date_offset_days", "dateOffsetDays", "date_offset", "dateOffset"], defaultValue: undefined }),
          useAi: pickBoolFlag({ q, b, keys: ["ai"], defaultValue: true }),
          forceAi: pickBoolFlag({ q, b, keys: ["force_ai", "forceAi"], defaultValue: false }),
          local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
          localOutDir: getLocalOutDir(q, b),
          forceNext: pickBoolFlag({ q, b, keys: ["force_next", "forceNext", "use_next", "useNext"], defaultValue: false }),
          eventKind: eventKindRaw
            ? String(eventKindRaw)
            : (fullFlag && !newFlag)
              ? "full"
              : (!fullFlag && newFlag)
                ? "new"
                : "",
        };
      },
      run: ({ opts }) => runIgMoonEventPost({ env, storyService, storage, dict, db }, opts),
    },
  ]);

  registerCronPostRoute(router, {
    path: "/blog/daily",
    requireCronToken,
    logLabel: "[cron/blog/daily]",
    logMeta: (phase, result) => phase === "start" ? { endpoint: "blog_daily" } : { ok: result?.ok },
    buildOptions: (req) => {
      const { q, b, dateLocal, asOfISO } = getBaseCronOptions(req, { fallbackNow: true, fallbackFromDateLocal: true });
      return {
        dateLocal,
        asOfISO,
        dryRun: pickDryRun({ q, b }),
        force: pickBoolFlag({ q, b, keys: ["force"], defaultValue: false }),
        publish: pickBoolFlag({ q, b, keys: ["publish", "is_publish"], defaultValue: true }),
        local: pickBoolFlag({ q, b, keys: ["local", "local_only", "localOnly"], defaultValue: false }),
        localOutDir: getLocalOutDir(q, b),
      };
    },
    run: ({ opts }) => runDailyBlog({ env: env2, storyService, db }, opts),
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
