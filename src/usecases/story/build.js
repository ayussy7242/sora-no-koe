"use strict";

const { normalizeStoryArgs } = require("./args");
const { buildPublicStorySnapshot } = require("./store");

const ROUTER_BUILD = "routes/stories.js v2026-01-27 safe-outputs + single-render";

async function buildStoryContext({ db, storyService, request }) {
  const {
    appUserId,
    mode,
    dateLocal,
    asOfISO,
    orbMaxDeg,
    precisionDeg,
    resonanceMode,
    asOfSource,
    aiDebugOn,
  } = request;

  let story = null;
  if (appUserId === "public" && String(mode || "").toLowerCase() === "public") {
    story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;
  } else {
    story = await storyService.buildStoryForUser(
      normalizeStoryArgs({
        appUserId,
        mode,       // public | auto
        dateLocal,  // 表示用
        asOfISO,    // ✅ ここが NOW
        orbMaxDeg,
        precisionDeg,
      })
    );
  }

  if (resonanceMode) {
    story.meta = story.meta && typeof story.meta === "object" ? story.meta : {};
    story.meta.resonance_mode = resonanceMode;
  }

  // natal 用に natal_cache を補足（publicは取得しない）
  let natalCache = null;
  if (appUserId && appUserId !== "public") {
    try {
      const snap = await db.collection("natal_cache").doc(appUserId).get();
      const data = snap.exists ? snap.data() : null;
      natalCache = data;
    } catch (_) {
      natalCache = null;
    }
  }

  // router印（デバッグ用）
  story.meta = story.meta || {};
  story.meta.router_build = ROUTER_BUILD;
  story.meta.router_asof_source = asOfSource;
  if (aiDebugOn) story.meta.ai_debug_on = true;

  return { story, natalCache };
}

module.exports = {
  buildStoryContext,
  ROUTER_BUILD,
};
