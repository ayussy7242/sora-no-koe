// routes/stories.js — Unified STABLE (v2026-01-27 safe-outputs + single-render)
"use strict";

const express = require("express");
const { normalizeStoryArgs } = require("../usecases/story/story_args");
const { buildRenderMap, resolvePrimaryKey, attachOutputs } = require("./stories_render");
const { generateIgResonanceText } = require("../usecases/channels/ig/ig_resonance_ai");
const { generateIgObservationText } = require("../usecases/channels/ig/ig_observation_ai");
const { generateIgSkyOverviewText } = require("../usecases/channels/ig/ig_sky_overview_ai");
const { generateIgTsukijiStructureText } = require("../usecases/channels/ig/ig_tsukiji_structure_ai");
const { generateIgMoonText } = require("../usecases/channels/ig/ig_moon_ai");
const { generateXSoraAiText } = require("../usecases/channels/x/generate_x_sora_ai");
const { generateXResonanceAiText, pickPrimaryResonanceAspect } = require("../usecases/channels/x/generate_x_resonance_ai");
const { generateXNightAiText } = require("../usecases/channels/x/generate_x_night_ai");
const { generateXMoonEventAiText, detectMoonEvent } = require("../usecases/channels/x/generate_x_moon_event_ai");
const { generateXMonthlyAiText, buildMonthlyContext } = require("../usecases/channels/x/generate_x_monthly_ai");
const { SPEC } = require("../config/sora_spec");

// -------------------- helpers --------------------
function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toDateLocalJST(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function pickAppUserId(req) {
  return req.query.app_user_id || req.header("x-app-user-id") || "public";
}

function boolish(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v !== "string") return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function toNumberSafe(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Date() で解釈できるかだけ
function isValidISO(s) {
  if (typeof s !== "string" || !s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function ensureIgOutputs(story) {
  story.outputs = story.outputs && typeof story.outputs === "object" ? story.outputs : {};
  story.outputs.ig = story.outputs.ig && typeof story.outputs.ig === "object" ? story.outputs.ig : {};
  story.outputs.ig.source = story.outputs.ig.source && typeof story.outputs.ig.source === "object" ? story.outputs.ig.source : {};
  story.outputs.ig.parts = story.outputs.ig.parts && typeof story.outputs.ig.parts === "object" ? story.outputs.ig.parts : {};
  story.outputs.ig.rendered = story.outputs.ig.rendered && typeof story.outputs.ig.rendered === "object" ? story.outputs.ig.rendered : {};
  story.outputs.ig.rendered.carousel = story.outputs.ig.rendered.carousel && typeof story.outputs.ig.rendered.carousel === "object"
    ? story.outputs.ig.rendered.carousel
    : {};
  return story.outputs.ig;
}

function ensureXMeta(story) {
  story.meta = story.meta || {};
  story.meta.x_ai = story.meta.x_ai && typeof story.meta.x_ai === "object" ? story.meta.x_ai : {};
  story.meta.x_source = story.meta.x_source && typeof story.meta.x_source === "object" ? story.meta.x_source : {};
  return story.meta;
}

function isMonthStartDateLocal(dateLocal) {
  const parts = String(dateLocal || "").split("-");
  return parts.length === 3 && parts[2] === "01";
}

/**
 * datetime_local を “JST +09:00” として ISO化
 * - 受け付け例:
 *   1) 2026-01-23T18:10:00+09:00 (そのまま)
 *   2) 2026-01-23T18:10:00Z      (そのまま)
 *   3) 2026-01-23T18:10:00       (JSTとみなして +09:00 を付ける)
 *   4) 2026-01-23 18:10:00       (Tに直して +09:00)
 */
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

/**
 * “as_of をどう決めるか” を統一
 * 優先順位:
 * 1) ?as_of=... (完全指定)
 * 2) ?datetime_local=... (JSTとして解釈してISO化)
 * 3) default: NOW (new Date().toISOString())
 */
function resolveAsOfISO(req) {
  const asOfRaw = req.query.as_of;
  if (isValidISO(asOfRaw)) return String(asOfRaw);

  const dtLocal = normalizeDateTimeLocalJST(req.query.datetime_local);
  if (dtLocal) return dtLocal;

  return new Date().toISOString();
}

/**
 * “date_local をどう決めるか”
 * - 明示指定があればそれ（YYYY-MM-DDのみ）
 * - 無ければ “今のJST日付”
 */
function resolveDateLocal(req) {
  const dateLocalRaw = req.query.date_local;
  if (isYYYYMMDD(dateLocalRaw)) return String(dateLocalRaw);
  return toDateLocalJST();
}

/**
 * routes の “mode” は storyService の mode と別物として扱う
 * - req.mode: now | public | auto | (default)
 * - storyService mode: public | auto のみ
 */
function resolveStoryMode(reqMode, appUserId) {
  const m = String(reqMode || "").trim().toLowerCase();

  if (m === "auto") return "auto";
  if (m === "public") return "public";

  return String(appUserId) === "public" ? "public" : "auto";
}

// -------------------- router factory --------------------
function createStoriesRouter(deps = {}) {
  const router = express.Router();

  const db = deps.db;
  const storyService = deps.storyService;
  const renderers = deps.renderers;
  const env = deps.env || {};
  const env2 = { ...(env || {}), ...(process.env || {}) };
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

  async function maybeAttachIgResonanceText({ story, wantAi, appUserId, dateLocal }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    if (story.outputs?.ig?.parts?.resonance) return;

    const apiKey = String(env2.OPENAI_API_KEY || "").trim();
    const canGenerate = !!apiKey;

    // If saved story exists, reuse stored IG outputs first
    try {
      if (db && appUserId && dateLocal) {
        const docId = `${appUserId}-${dateLocal}`;
        const snap = await db.collection("stories").doc(docId).get();
        const saved = snap.exists ? snap.data() : null;
        const savedIg = saved?.outputs?.ig || null;
        const savedText =
          savedIg?.parts?.resonance ||
          savedIg?.rendered?.carousel?.slide3_text ||
          savedIg?.resonance_text ||
          savedIg?.carousel?.slide3_text ||
          null;
        if (savedText) {
          const igOut = ensureIgOutputs(story);
          igOut.parts.resonance = savedText;
          igOut.rendered.carousel.slide3_text = savedIg?.rendered?.carousel?.slide3_text || savedIg?.carousel?.slide3_text || savedText;
          story.meta = story.meta || {};
          story.meta.ig_resonance_source = "saved";
          return;
        }
      }
    } catch (_) {
      // ignore saved lookup failure
    }

    if (!canGenerate) return;

    try {
      const result = await generateIgResonanceText({
        story,
        dict,
        openai: {
          apiKey,
          baseUrl: env2.OPENAI_BASE_URL,
          model: env2.OPENAI_MODEL,
        },
      });

      if (result?.ok && result?.text) {
        const igOut = ensureIgOutputs(story);
        igOut.parts.resonance = result.text;
        igOut.rendered.carousel.slide3_text = result.text;
        story.meta = story.meta || {};
        story.meta.ig_resonance_ai = {
          model: result.model || env2.OPENAI_MODEL || null,
          chars: result.text.length,
          generated_at_utc: new Date().toISOString(),
        };
        story.meta.ig_resonance_source = "generated";
      } else {
        story.meta = story.meta || {};
        story.meta.ig_resonance_ai_error = result?.error || "unknown";
      }
    } catch (e) {
      story.meta = story.meta || {};
      story.meta.ig_resonance_ai_error = e?.message || String(e);
    }
  }

  async function maybeAttachIgTsukijiStructure({ story, wantAi, appUserId, dateLocal }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    if (story.outputs?.ig?.parts?.structure_label) return;

    const apiKey = String(env2.OPENAI_API_KEY || "").trim();
    const canGenerate = !!apiKey;

    try {
      if (db && appUserId && dateLocal) {
        const docId = `${appUserId}-${dateLocal}`;
        const snap = await db.collection("stories").doc(docId).get();
        const saved = snap.exists ? snap.data() : null;
        const savedIg = saved?.outputs?.ig || null;
        const savedText =
          savedIg?.parts?.structure_label ||
          savedIg?.rendered?.carousel?.slide4_label ||
          savedIg?.carousel?.slide4_structure ||
          savedIg?.tsukiji_structure_text ||
          null;
        if (savedText) {
          const igOut = ensureIgOutputs(story);
          igOut.parts.structure_label = savedText;
          igOut.rendered.carousel.slide4_label = savedIg?.rendered?.carousel?.slide4_label || savedIg?.carousel?.slide4_structure || savedText;
          story.meta = story.meta || {};
          story.meta.ig_tsukiji_source = "saved";
          return;
        }
      }
    } catch (_) {
      // ignore saved lookup failure
    }

    if (!canGenerate) return;

    try {
      const result = await generateIgTsukijiStructureText({
        story,
        dict,
        openai: {
          apiKey,
          baseUrl: env2.OPENAI_BASE_URL,
          model: env2.OPENAI_MODEL,
        },
      });

      if (result?.ok && result?.text) {
        const igOut = ensureIgOutputs(story);
        igOut.parts.structure_label = result.text;
        igOut.rendered.carousel.slide4_label = result.text;
        story.meta = story.meta || {};
        story.meta.ig_tsukiji_ai = {
          model: result.model || env2.OPENAI_MODEL || null,
          chars: result.text.length,
          generated_at_utc: new Date().toISOString(),
        };
        story.meta.ig_tsukiji_source = "generated";
      } else {
        story.meta = story.meta || {};
        story.meta.ig_tsukiji_ai_error = result?.error || "unknown";
      }
    } catch (e) {
      story.meta = story.meta || {};
      story.meta.ig_tsukiji_ai_error = e?.message || String(e);
    }
  }

  async function maybeAttachIgMoonText({ story, wantAi, appUserId, dateLocal }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    if (story.outputs?.ig?.parts?.moon) return;

    const apiKey = String(env2.OPENAI_API_KEY || "").trim();
    const canGenerate = !!apiKey;

    try {
      if (db && appUserId && dateLocal) {
        const docId = `${appUserId}-${dateLocal}`;
        const snap = await db.collection("stories").doc(docId).get();
        const saved = snap.exists ? snap.data() : null;
        const savedIg = saved?.outputs?.ig || null;
        const savedText =
          savedIg?.parts?.moon ||
          savedIg?.rendered?.carousel?.slide2_text ||
          savedIg?.moon_text ||
          savedIg?.carousel?.slide2_text ||
          null;
        if (savedText) {
          const igOut = ensureIgOutputs(story);
          igOut.parts.moon = savedText;
          igOut.rendered.carousel.slide2_text = savedIg?.rendered?.carousel?.slide2_text || savedIg?.carousel?.slide2_text || savedText;
          story.meta = story.meta || {};
          story.meta.ig_moon_source = "saved";
          return;
        }
      }
    } catch (_) {
      // ignore saved lookup failure
    }

    if (!canGenerate) return;

    try {
      const result = await generateIgMoonText({
        story,
        dict,
        openai: {
          apiKey,
          baseUrl: env2.OPENAI_BASE_URL,
          model: env2.OPENAI_MODEL,
        },
      });

      if (result?.ok && result?.text) {
        const igOut = ensureIgOutputs(story);
        igOut.parts.moon = result.text;
        igOut.rendered.carousel.slide2_text = result.text;
        story.meta = story.meta || {};
        story.meta.ig_moon_ai = {
          model: result.model || env2.OPENAI_MODEL || null,
          chars: result.text.length,
          generated_at_utc: new Date().toISOString(),
        };
        story.meta.ig_moon_source = "generated";
      } else {
        story.meta = story.meta || {};
        story.meta.ig_moon_ai_error = result?.error || "unknown";
      }
    } catch (e) {
      story.meta = story.meta || {};
      story.meta.ig_moon_ai_error = e?.message || String(e);
    }
  }

  async function maybeAttachIgObservationText({ story, wantAi, appUserId, dateLocal }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    if (story.outputs?.ig?.parts?.observation) return;

    const apiKey = String(env2.OPENAI_API_KEY || "").trim();
    const canGenerate = !!apiKey;

    // If saved story exists, reuse stored IG outputs first
    try {
      if (db && appUserId && dateLocal) {
        const docId = `${appUserId}-${dateLocal}`;
        const snap = await db.collection("stories").doc(docId).get();
        const saved = snap.exists ? snap.data() : null;
        const savedIg = saved?.outputs?.ig || null;
        const savedText =
          savedIg?.parts?.observation ||
          savedIg?.rendered?.carousel?.slide1_observation ||
          savedIg?.carousel?.slide1_observation ||
          savedIg?.observation_text ||
          null;
        if (savedText) {
          const igOut = ensureIgOutputs(story);
          igOut.parts.observation = savedText;
          igOut.rendered.carousel.slide1_observation = savedIg?.rendered?.carousel?.slide1_observation || savedIg?.carousel?.slide1_observation || savedText;
          story.meta = story.meta || {};
          story.meta.ig_observation_source = "saved";
          return;
        }
      }
    } catch (_) {
      // ignore saved lookup failure
    }

    if (!canGenerate) return;

    try {
      const result = await generateIgObservationText({
        story,
        dict,
        openai: {
          apiKey,
          baseUrl: env2.OPENAI_BASE_URL,
          model: env2.OPENAI_MODEL,
        },
      });

      if (result?.ok && result?.text) {
        const igOut = ensureIgOutputs(story);
        igOut.parts.observation = result.text;
        igOut.rendered.carousel.slide1_observation = result.text;
        story.meta = story.meta || {};
        story.meta.ig_observation_ai = {
          model: result.model || env2.OPENAI_MODEL || null,
          chars: result.text.length,
          generated_at_utc: new Date().toISOString(),
        };
        story.meta.ig_observation_source = "generated";
      } else {
        story.meta = story.meta || {};
        story.meta.ig_observation_ai_error = result?.error || "unknown";
      }
    } catch (e) {
      story.meta = story.meta || {};
      story.meta.ig_observation_ai_error = e?.message || String(e);
    }
  }

  async function maybeAttachIgSkyOverviewText({ story, wantAi, appUserId, dateLocal }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    if (story.outputs?.ig?.parts?.sky_overview) return;

    const apiKey = String(env2.OPENAI_API_KEY || "").trim();
    const canGenerate = !!apiKey;

    try {
      if (db && appUserId && dateLocal) {
        const docId = `${appUserId}-${dateLocal}`;
        const snap = await db.collection("stories").doc(docId).get();
        const saved = snap.exists ? snap.data() : null;
        const savedIg = saved?.outputs?.ig || null;
        const savedText =
          savedIg?.parts?.sky_overview ||
          savedIg?.sky_overview_text ||
          savedIg?.caption_sky_overview ||
          null;
        if (savedText) {
          const igOut = ensureIgOutputs(story);
          igOut.parts.sky_overview = savedText;
          story.meta = story.meta || {};
          story.meta.ig_sky_overview_source = "saved";
          return;
        }
      }
    } catch (_) {
      // ignore saved lookup failure
    }

    if (!canGenerate) return;

    try {
      const result = await generateIgSkyOverviewText({
        story,
        dict,
        openai: {
          apiKey,
          baseUrl: env2.OPENAI_BASE_URL,
          model: env2.OPENAI_MODEL,
        },
      });

      if (result?.ok && result?.text) {
        const igOut = ensureIgOutputs(story);
        igOut.parts.sky_overview = result.text;
        story.meta = story.meta || {};
        story.meta.ig_sky_overview_ai = {
          model: result.model || env2.OPENAI_MODEL || null,
          chars: result.text.length,
          generated_at_utc: new Date().toISOString(),
        };
        story.meta.ig_sky_overview_source = "generated";
      } else {
        story.meta = story.meta || {};
        story.meta.ig_sky_overview_ai_error = result?.error || "unknown";
      }
    } catch (e) {
      story.meta = story.meta || {};
      story.meta.ig_sky_overview_ai_error = e?.message || String(e);
    }
  }

  async function maybeAttachXSoraText({ story, wantAi, forceAi }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    const meta = ensureXMeta(story);
    if (!forceAi && meta.x_ai?.morning) return;

    const apiKey = String(env2.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      meta.x_sora_ai_error = "OPENAI_API_KEY missing";
      return;
    }

    try {
      const result = await generateXSoraAiText({
        story,
        dict,
        openai: { apiKey, baseUrl: env2.OPENAI_BASE_URL, model: env2.OPENAI_MODEL },
      });

      if (result?.ok && result?.text) {
        meta.x_ai.morning = result.text;
        meta.x_sora_ai = {
          ok: true,
          source: result.fallback ? "fallback" : "ai",
          fallback: !!result.fallback,
          model: result.model || env2.OPENAI_MODEL || null,
          chars: result.len || result.text.length,
          generated_at_utc: new Date().toISOString(),
        };
        if (result.fallback && result.fallback_reason) {
          meta.x_sora_ai.fallback_reason = result.fallback_reason;
        }
      } else {
        meta.x_sora_ai_error = result?.error || "unknown";
        if (result?.reason) meta.x_sora_ai_error_reason = result.reason;
      }
    } catch (e) {
      meta.x_sora_ai_error = e?.message || String(e);
    }
  }

  async function maybeAttachXNightText({ story, wantAi, forceAi }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    const meta = ensureXMeta(story);
    if (!forceAi && meta.x_ai?.night) return;

    const picked = pickPrimaryResonanceAspect({ story, dict });
    if (picked?.raw) meta.x_source.resonance_aspect = picked.raw;

    const apiKey = String(env2.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      meta.x_night_ai_error = "OPENAI_API_KEY missing";
      return;
    }

    try {
      const result = await generateXNightAiText({
        story,
        dict,
        openai: { apiKey, baseUrl: env2.OPENAI_BASE_URL, model: env2.OPENAI_MODEL },
      });

      if (result?.ok && result?.text) {
        meta.x_ai.night = result.text;
        meta.x_night_ai = {
          ok: true,
          source: result.fallback ? "fallback" : "ai",
          fallback: !!result.fallback,
          model: result.model || env2.OPENAI_MODEL || null,
          chars: result.len || result.text.length,
          generated_at_utc: new Date().toISOString(),
        };
        if (result.fallback && result.fallback_reason) {
          meta.x_night_ai.fallback_reason = result.fallback_reason;
        }
      } else {
        meta.x_night_ai_error = result?.error || "unknown";
        if (result?.reason) meta.x_night_ai_error_reason = result.reason;
      }
    } catch (e) {
      meta.x_night_ai_error = e?.message || String(e);
    }
  }

  async function maybeAttachXResonanceText({ story, wantAi, forceAi }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    const meta = ensureXMeta(story);
    if (!forceAi && meta.x_ai?.resonance) return;

    const maxOrb = Number(SPEC?.orb?.free ?? 1.5);
    const picked = pickPrimaryResonanceAspect({ story, dict, maxOrbDeg: maxOrb });
    if (picked?.raw) meta.x_source.resonance_aspect = picked.raw;
    if (!picked) return;

    const apiKey = String(env2.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      meta.x_resonance_ai_error = "OPENAI_API_KEY missing";
      return;
    }

    try {
      const result = await generateXResonanceAiText({
        story,
        dict,
        aspect: picked,
        openai: { apiKey, baseUrl: env2.OPENAI_BASE_URL, model: env2.OPENAI_MODEL },
      });

      if (result?.ok && result?.text) {
        meta.x_ai.resonance = result.text;
        meta.x_resonance_ai = {
          ok: true,
          source: result.fallback ? "fallback" : "ai",
          fallback: !!result.fallback,
          model: result.model || env2.OPENAI_MODEL || null,
          chars: result.len || result.text.length,
          generated_at_utc: new Date().toISOString(),
        };
        if (result.fallback && result.fallback_reason) {
          meta.x_resonance_ai.fallback_reason = result.fallback_reason;
        }
      } else {
        meta.x_resonance_ai_error = result?.error || "unknown";
        if (result?.reason) meta.x_resonance_ai_error_reason = result.reason;
      }
    } catch (e) {
      meta.x_resonance_ai_error = e?.message || String(e);
    }
  }

  async function maybeAttachXMoonEventText({ story, wantAi, forceAi }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    const meta = ensureXMeta(story);
    if (!forceAi && meta.x_ai?.moon_event) return;

    const event = detectMoonEvent({ story, dict, asOfISO: story?.meta?.as_of });
    if (!event) return;
    meta.x_source.moon_event = event;

    const apiKey = String(env2.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      meta.x_moon_event_ai_error = "OPENAI_API_KEY missing";
      return;
    }

    try {
      const result = await generateXMoonEventAiText({
        story,
        dict,
        event,
        openai: { apiKey, baseUrl: env2.OPENAI_BASE_URL, model: env2.OPENAI_MODEL },
      });

      if (result?.ok && result?.text) {
        meta.x_ai.moon_event = result.text;
        meta.x_moon_event_ai = {
          model: result.model || env2.OPENAI_MODEL || null,
          chars: result.text.length,
          generated_at_utc: new Date().toISOString(),
        };
      } else {
        meta.x_moon_event_ai_error = result?.error || "unknown";
        if (result?.reason) meta.x_moon_event_ai_error_reason = result.reason;
      }
    } catch (e) {
      meta.x_moon_event_ai_error = e?.message || String(e);
    }
  }

  async function maybeAttachXMonthlyText({ story, wantAi, forceAi }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    const dateLocal = story?.meta?.date_local || story?.public?.date_local || "";
    if (!isMonthStartDateLocal(dateLocal)) return;

    const meta = ensureXMeta(story);
    if (!forceAi && meta.x_ai?.monthly) return;

    const context = buildMonthlyContext({ story, dict, asOfISO: story?.meta?.as_of });
    meta.x_source.monthly_context = context;

    const apiKey = String(env2.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      meta.x_monthly_ai_error = "OPENAI_API_KEY missing";
      return;
    }

    try {
      const result = await generateXMonthlyAiText({
        story,
        dict,
        context,
        openai: { apiKey, baseUrl: env2.OPENAI_BASE_URL, model: env2.OPENAI_MODEL },
      });

      if (result?.ok && result?.text) {
        meta.x_ai.monthly = result.text;
        meta.x_monthly_ai = {
          model: result.model || env2.OPENAI_MODEL || null,
          chars: result.text.length,
          generated_at_utc: new Date().toISOString(),
        };
      } else {
        meta.x_monthly_ai_error = result?.error || "unknown";
        if (result?.reason) meta.x_monthly_ai_error_reason = result.reason;
      }
    } catch (e) {
      meta.x_monthly_ai_error = e?.message || String(e);
    }
  }

  router.get("/", async (req, res) => {
    try {
      // ① format/channel
      const format = String(req.query.format || "json").trim().toLowerCase();
      const reqChannel = String(req.query.channel || "").trim().toLowerCase();

      const channelAlias = {
        // LINE
        sora: "line_sora",
        line_sora: "line_sora",
        distribution: "line_distribution",
        line_distribution: "line_distribution",
        natal: "line_natal",
        line_natal: "line_natal",

        // optional aliases
        x: "x",
        x_morning: "x_morning",
        x_morning_main: "x_morning_main",
        x_morning_log: "x_morning_log",
        x_night: "x_night",
        x_resonance: "x_resonance",
        x_moon_event: "x_moon_event",
        x_monthly: "x_monthly",
        x_thread: "x_thread",
        xthread: "x_thread",
        x2: "x_thread",
        ig: "ig",
        threads: "threads",
        threads_app: "threads",
        line: "line",
      };

      const ch = channelAlias[reqChannel] || reqChannel;

      const isSocial =
        format === "x" || format === "x_thread" || format === "x_thread_text" || format === "thread_text" ||
        format === "x_morning" || format === "x_morning_main" || format === "x_morning_log" || format === "x_night" ||
        format === "x_resonance" || format === "x_moon_event" || format === "x_monthly" ||
        format === "ig" || format === "threads" || format === "threads_app" ||
        ch === "x" || ch === "x_thread" || ch === "x_morning" || ch === "x_morning_main" || ch === "x_morning_log" || ch === "x_night" ||
        ch === "x_resonance" || ch === "x_moon_event" || ch === "x_monthly" || ch === "ig" || ch === "threads";

      const isSora = ch === "line_sora";
      const isDistribution = ch === "line_distribution";
      const isNatal = ch === "line_natal";

      // ② appUserId/mode
      let appUserId = pickAppUserId(req);
      let mode = resolveStoryMode(req.query.mode, appUserId);

      // ③ save 先に初期化
      let save = boolish(req.query.save);

      // ④ public固定＆保存禁止ルール（SNS / 公開系は public固定）
      if (isSocial || isSora || isDistribution || isNatal) {
        appUserId = "public";
        mode = "public";
        save = false;
      }

      // saved/doc_id
      let saved = false;
      let doc_id = null;

      // ✅ NOW デフォルト：as_of は基本 “今”
      const dateLocal = resolveDateLocal(req);
      const asOfISO = resolveAsOfISO(req);

      const orbMaxDeg = clamp(toNumberSafe(req.query.orb, 6), 0.1, 12);
      const precisionDeg = clamp(toNumberSafe(req.query.precision, 0.01), 0.001, 1);

      // final/force（保存時のみ意味がある）
      const final = boolish(req.query.final);
      const force = boolish(req.query.force);

      // outputs をレスポンスに含めるか（default true）
      const includeOutputs = req.query.outputs === undefined ? true : boolish(req.query.outputs);
      const igAiParam = String(req.query.ig_ai || "").trim().toLowerCase();
      const igAiOff = igAiParam === "0" || igAiParam === "false" || igAiParam === "off";
      const igAiOn = boolish(req.query.ig_ai);
      const wantIgAi = !igAiOff && (igAiOn || save || format === "ig" || ch === "ig" || includeOutputs);
      const wantXMorning = format === "x_morning" || format === "x_morning_main" || ch === "x_morning" || ch === "x_morning_main";
      const wantXNight = format === "x_night" || ch === "x_night";
      const wantXResonance = format === "x_resonance" || ch === "x_resonance";
      const wantXMoonEvent = format === "x_moon_event" || ch === "x_moon_event";
      const wantXMonthly = format === "x_monthly" || ch === "x_monthly";
      const xAiForce = boolish(req.query.ai_force) || boolish(req.query.x_ai_force);

      // build story
      const story = await storyService.buildStoryForUser(
        normalizeStoryArgs({
          appUserId,
          mode,       // public | auto
          dateLocal,  // 表示用
          asOfISO,    // ✅ ここが NOW
          orbMaxDeg,
          precisionDeg,
        })
      );

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
      story.meta.router_build = "routes/stories.js v2026-01-27 safe-outputs + single-render";
      story.meta.router_asof_source =
        (req.query.as_of && isValidISO(req.query.as_of)) ? "as_of" :
          (req.query.datetime_local ? "datetime_local" : "server_now");
      // AI debug flag (per-request)
      const aiDebugOn = boolish(req.query.ai_debug) || boolish(req.query.debug);
      if (aiDebugOn) story.meta.ai_debug_on = true;

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
      const renderMap = buildRenderMap({ renderers, story, natalCache });

      // format/channel -> primary output key
      const wantKey = resolvePrimaryKey({ format, channel: ch });

      const primaryText = await (renderMap[wantKey] || renderMap.line)();

      // outputs: include only if requested (and never break main response)
      await attachOutputs({ story, renderMap, primaryKey: wantKey, primaryText, includeOutputs });

      // save（※現状 doc_id が日付固定なので “今”を保存すると上書きになる）
      if (save) {
        doc_id = `${appUserId}-${dateLocal}`;
        const ref = db.collection("stories").doc(doc_id);

        const txResult = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const existing = snap.exists ? snap.data() : null;
          const isFinalized = !!existing?.meta?.finalized;

          if (final && isFinalized && !force) {
            return { didWrite: false, alreadyFinal: true };
          }

          if (!final && isFinalized && !force) {
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

          if (final) {
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
