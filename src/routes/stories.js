// routes/stories.js — Unified STABLE (v2026-01-27 safe-outputs + single-render)
"use strict";

const express = require("express");
const { buildStoryOutputs } = require("../usecases/story/outputs");
const { createStoriesAiHelpers } = require("../usecases/story/ai");
const { parseStoriesRequest } = require("../usecases/story/request");
const { buildStoryContext } = require("../usecases/story/build");
const { resolveEnv } = require("../utils/env");

// -------------------- helpers --------------------
// -------------------- router factory --------------------
function createStoriesRouter(deps = {}) {
  const router = express.Router();

  const db = deps.db;
  const storyService = deps.storyService;
  const renderers = deps.renderers;
  const env = deps.env || {};
  const env2 = resolveEnv(env);
  const dict = deps.dict || require("../content/dict");

  if (!db) throw new Error("deps.db is required for stories router");
  if (!storyService?.buildStoryForUser) throw new Error("deps.storyService.buildStoryForUser is missing");
  if (
    !renderers?.renderLine ||
    !renderers?.renderSoraLine ||
    !renderers?.renderDistributionLine ||
    !renderers?.renderNatalListFromcache ||
    !renderers?.renderX ||
    !renderers?.renderXMorning ||
    !renderers?.renderXNight ||
    !renderers?.renderXResonance ||
    !renderers?.renderXMoonEvent ||
    !renderers?.renderXMonthly ||
    !renderers?.renderXThread ||
    !renderers?.renderIG ||
    !renderers?.renderThreads
  ) {
    throw new Error("deps.renderers (renderLine/renderSoraLine/renderDistributionLine/renderNatalListFromcache/renderX/renderXMorning/renderXNight/renderXResonance/renderXMoonEvent/renderXMonthly/renderXThread/renderIG/renderThreads) is missing");
  }

  const {
    maybeAttachIgResonanceText,
    maybeAttachIgTsukijiStructure,
    maybeAttachIgMoonText,
    maybeAttachIgObservationText,
    maybeAttachIgSkyOverviewText,
    maybeAttachXSoraText,
    maybeAttachXNightText,
    maybeAttachXResonanceText,
    maybeAttachXMoonEventText,
    maybeAttachXMonthlyText,
  } = createStoriesAiHelpers({ db, env: env2, dict });

  router.get("/", async (req, res) => {
    try {
      const request = parseStoriesRequest(req);

      const {
        format,
        channel: ch,
        appUserId,
        dateLocal,
        includeOutputs,
        wantIgAi,
        wantXMorning,
        wantXNight,
        wantXResonance,
        wantXMoonEvent,
        wantXMonthly,
        xAiForce,
      } = request;

      // saved/doc_id
      let saved = false;
      let doc_id = null;

      // build story
      const { story, natalCache } = await buildStoryContext({ db, storyService, request });

      // IG resonance AI (optional)
      await maybeAttachIgObservationText({ story, wantAi: wantIgAi, appUserId, dateLocal });
      await maybeAttachIgSkyOverviewText({ story, wantAi: wantIgAi, appUserId, dateLocal });
      await maybeAttachIgMoonText({ story, wantAi: wantIgAi, appUserId, dateLocal });
      await maybeAttachIgResonanceText({ story, wantAi: wantIgAi, appUserId, dateLocal });
      await maybeAttachIgTsukijiStructure({ story, wantAi: wantIgAi, appUserId, dateLocal });

      // X AI (on-demand per channel)
      await maybeAttachXSoraText({ story, wantAi: wantXMorning, forceAi: xAiForce });
      await maybeAttachXNightText({ story, wantAi: wantXNight, forceAi: xAiForce });
      await maybeAttachXResonanceText({ story, wantAi: wantXResonance, forceAi: xAiForce });
      await maybeAttachXMoonEventText({ story, wantAi: wantXMoonEvent, forceAi: xAiForce });
      await maybeAttachXMonthlyText({ story, wantAi: wantXMonthly, forceAi: xAiForce });

      // --------------------
      // render only what is requested (NO collateral failures)
      // --------------------
      const { primaryText } = await buildStoryOutputs({
        renderers,
        story,
        natalCache,
        format,
        channel: ch,
        includeOutputs,
      });

      // save（※現状 doc_id が日付固定なので “今”を保存すると上書きになる）
      if (request.save) {
        doc_id = `${appUserId}-${dateLocal}`;
        const ref = db.collection("stories").doc(doc_id);

        const txResult = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const existing = snap.exists ? snap.data() : null;
          const isFinalized = !!existing?.meta?.finalized;

          if (request.final && isFinalized && !request.force) {
            return { didWrite: false, alreadyFinal: true };
          }

          if (!request.final && isFinalized && !request.force) {
            const err = new Error("already_finalized");
            err.statusCode = 409;
            throw err;
          }

          const toSave = JSON.parse(JSON.stringify(story));
          if (toSave.outputs && typeof toSave.outputs === "object") {
            const igOut = toSave.outputs.ig;
            delete toSave.outputs;
            if (igOut && typeof igOut === "object") {
              toSave.outputs = { ig: igOut };
            }
          } else {
            delete toSave.outputs;
          }

          toSave.meta = toSave.meta || {};

          if (request.final) {
            toSave.meta.finalized = true;
            toSave.meta.finalized_at_utc = new Date().toISOString();
            toSave.meta.finalized_by = "api";
          } else if (isFinalized) {
            toSave.meta.finalized = true;
            toSave.meta.finalized_at_utc = existing?.meta?.finalized_at_utc;
            toSave.meta.finalized_by = existing?.meta?.finalized_by;
          }

          tx.set(ref, toSave, { merge: true });
          return { didWrite: true, alreadyFinal: isFinalized };
        });

        saved = !!txResult?.didWrite;
      }

      // respond (json)
      if (format === "json") return res.json({ ok: true, saved, doc_id, meta: story.meta, story });
      if (format === "all") return res.json({ ok: true, saved, doc_id, meta: story.meta, story });

      // respond (single text channel)
      if (
        format === "line" ||
        format === "x" ||
        format === "x_morning" ||
        format === "x_morning_main" ||
        format === "x_morning_log" ||
        format === "x_night" ||
        format === "x_moon_event" ||
        format === "x_monthly" ||
        format === "x_thread" ||
        format === "ig" ||
        format === "threads" ||
        format === "threads_app"
      ) {
        return res.json({ ok: true, saved, doc_id, text: primaryText });
      }

      if (format === "x_thread_text" || format === "thread_text") {
        res.setHeader("content-type", "text/plain; charset=utf-8");
        return res.status(200).send(primaryText);
      }

      // text/plain
      if (format === "text") {
        res.setHeader("content-type", "text/plain; charset=utf-8");
        return res.status(200).send(primaryText);
      }

      // fallback
      return res.json({ ok: true, saved, doc_id, story });
    } catch (e) {
      const code = e?.statusCode || 500;
      return res.status(code).json({
        ok: false,
        error: e?.message || String(e),
        path: "/stories",
      });
    }
  });

  return router;
}

module.exports = { createStoriesRouter };
