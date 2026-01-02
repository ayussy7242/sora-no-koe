"use strict";

const express = require("express");
const { handleJobsWorker } = require("../jobs/worker");
const { runDaily8 } = require("../cron/daily8");

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

// -------------------- router factory --------------------
function createCronRouter(deps = {}) {
  const router = express.Router();

  const env = deps.env || {};
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
    const CRON_TOKEN = env.CRON_TOKEN;

    if (!CRON_TOKEN) return { ok: false, status: 500, message: "CRON_TOKEN is not set" };
    if (token !== CRON_TOKEN) return { ok: false, status: 401, message: "invalid cron token" };
    return { ok: true };
  }

  router.get("/health", (_req, res) => {
    return res.json({
      ok: true,
      project: env.PROJECT,
      timezone: env.DEFAULT_TZ,
      schema_version: env.SCHEMA_VERSION,
      has_swisseph: !!swisseph,
    });
  });

  // POST /cron/daily : posts_daily 生成
  router.post("/daily", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/daily" });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const appUserId = String(b.app_user_id || q.app_user_id || "public");

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : toDateLocalJST();

      const asOfRaw = b.as_of || q.as_of;
      const asOfISO = isValidISO(asOfRaw) ? String(asOfRaw) : asOfIsoFromDateLocalJST(dateLocal);

      const orbMaxDeg = clamp(toNumberSafe(b.orb ?? q.orb, 6), 0.1, 12);
      const precisionDeg = clamp(toNumberSafe(b.precision ?? q.precision, 0.01), 0.001, 1);

      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);
      const isPublic = String(appUserId) === "public";

      const story = await storyService.buildStoryForUser({
        appUserId,
        ...(isPublic ? { mode: "public" } : {}),
        dateLocal,
        asOfISO,
        orbMaxDeg,
        precisionDeg,
      });

      const texts = {
        line: renderers.renderLine(story),
        x: renderers.renderX(story),
        ig: renderers.renderIG(story),
      };

      const story_doc_id = `${appUserId}-${dateLocal}`;
      const posts_doc_id = `${dateLocal}`;
      let saved = false;

      if (!dryRun) {
        await db.collection("stories").doc(story_doc_id).set(story, { merge: true });

        await db.collection("posts_daily").doc(posts_doc_id).set(
          {
            meta: {
              project: env.PROJECT,
              timezone: env.DEFAULT_TZ,
              schema_version: env.SCHEMA_VERSION,
              date_local: dateLocal,
              as_of: asOfISO,
              generated_at_utc: new Date().toISOString(),
            },
            app_user_id: appUserId,
            texts,
            story_ref: { collection: "stories", doc_id: story_doc_id },
          },
          { merge: true }
        );

        saved = true;
      }

      return res.json({
        ok: true,
        dry_run: dryRun,
        saved,
        date_local: dateLocal,
        as_of: asOfISO,
        app_user_id: appUserId,
        story_doc_id,
        posts_doc_id,
        preview: {
          sky_top: story?.public?.sky_top || [],
          moon: story?.public?.moon || null,
        },
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/daily" });
    }
  });

  // ✅ POST /cron/daily8 : posts_daily を配信（LINE） + posts_daily_delivery ログ
  router.post("/daily8", async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/daily8" });

    try {
      const q = req.query || {};
      const b = req.body || {};

      const dateLocalRaw = b.date_local || q.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : toDateLocalJST();
      const dryRun = boolish(b.dryRun ?? q.dryRun ?? b.dry_run ?? q.dry_run);

      const mode = String(b.mode || q.mode || "today");      // ★追加
      const target = String(b.target || q.target || "all");  // ★追加

      const result = await runDaily8(
        { db, admin, env, storyService, renderers },         // ★ここが本命
        { dateLocal, dryRun, mode, target }
      );

      return res.json(result);
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/cron/daily8" });
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
