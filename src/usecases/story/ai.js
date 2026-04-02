"use strict";

const { generateIgResonanceText } = require("../channels/instagram/ai/resonance");
const { generateIgObservationText } = require("../channels/instagram/ai/observation");
const { generateIgSkyOverviewText } = require("../channels/instagram/ai/sky_overview");
const { generateIgTsukijiStructureText } = require("../channels/instagram/ai/tsukiji_structure");
const { generateIgMoonText } = require("../channels/instagram/ai/moon");
const { generateXSoraAiText } = require("../channels/x/ai/daily");
const { generateXResonanceAiText } = require("../channels/x/ai/resonance");
const { pickPrimaryResonanceAspect } = require("../../domain/resonance");
const { generateXNightAiText } = require("../channels/x/ai/night");
const { generateXMoonEventAiText, detectMoonEvent } = require("../channels/x/ai/moon_event");
const { generateXMonthlyAiText, buildMonthlyContext } = require("../channels/x/ai/monthly");
const { SPEC } = require("../../config/sora_spec");
const { ensureIgOutputs } = require("./output_helpers");
const { ensureXMeta } = require("./meta_helpers");
const { logAiGeneration } = require("../../utils/infra/logging");

function isMonthStartDateLocal(dateLocal) {
  const parts = String(dateLocal || "").split("-");
  return parts.length === 3 && parts[2] === "01";
}

function createStoriesAiHelpers({ db, env, dict }) {
  const env2 = env || {};
  const openaiConfig = {
    apiKey: String(env2.OPENAI_API_KEY || "").trim(),
    baseUrl: env2.OPENAI_BASE_URL,
    model: env2.OPENAI_MODEL,
  };

  const savedStoryCache = new Map();
  async function loadSavedStory(appUserId, dateLocal) {
    if (!db || !appUserId || !dateLocal) return null;
    const key = `${appUserId}-${dateLocal}`;
    if (savedStoryCache.has(key)) return savedStoryCache.get(key);
    const promise = db.collection("stories").doc(key).get()
      .then((snap) => (snap.exists ? snap.data() : null))
      .catch(() => null);
    savedStoryCache.set(key, promise);
    return promise;
  }

  function ensureStoryMeta(story) {
    story.meta = story.meta || {};
    return story.meta;
  }

  function getByPath(obj, path) {
    if (!obj || !path) return undefined;
    return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
  }

  function pickFirstValue(obj, paths = []) {
    for (const path of paths) {
      const value = getByPath(obj, path);
      if (value) return value;
    }
    return null;
  }

  async function maybeAttachIgPart(config, { story, wantAi, appUserId, dateLocal }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    if (config.partKey && story.outputs?.ig?.parts?.[config.partKey]) return;

    const canGenerate = !!openaiConfig.apiKey;

    try {
      if (db && appUserId && dateLocal) {
        const saved = await loadSavedStory(appUserId, dateLocal);
        const savedIg = saved?.outputs?.ig || null;
        const savedText = config.pickSavedText ? config.pickSavedText(savedIg) : null;
        if (savedText) {
          const igOut = ensureIgOutputs(story);
          const renderedText = config.pickRenderedText ? config.pickRenderedText(savedIg) : null;
          if (typeof config.applySaved === "function") {
            config.applySaved({ igOut, story, savedIg, savedText, renderedText });
          }
          const meta = ensureStoryMeta(story);
          if (config.sourceKey) meta[config.sourceKey] = "saved";
          return;
        }
      }
    } catch (_) {
      // ignore saved lookup failure
    }

    if (!canGenerate) return;

    try {
      const result = await config.generate({ story, dict, openai: openaiConfig });
      logAiGeneration({
        channel: "instagram",
        kind: config.kind || config.partKey || "",
        ok: !!result?.ok,
        attempts: result?.attempts,
        fallback: !!result?.fallback,
        reason: result?.fallback_reason || result?.reason || result?.error || "",
        model: result?.model || null,
        lastText: result?.last_text || result?.lastText || "",
      });
      if (result?.ok && result?.text) {
        const igOut = ensureIgOutputs(story);
        if (typeof config.applyGenerated === "function") {
          config.applyGenerated({ igOut, story, result });
        }
        const meta = ensureStoryMeta(story);
        if (config.aiKey) {
          meta[config.aiKey] = {
            model: result.model || env2.OPENAI_MODEL || null,
            chars: result.text.length,
            generated_at_utc: new Date().toISOString(),
          };
        }
        if (config.sourceKey) meta[config.sourceKey] = "generated";
      } else {
        const meta = ensureStoryMeta(story);
        if (config.errorKey) meta[config.errorKey] = result?.error || "unknown";
      }
    } catch (e) {
      const meta = ensureStoryMeta(story);
      if (config.errorKey) meta[config.errorKey] = e?.message || String(e);
    }
  }

  const igAttachConfigs = {
    resonance: {
      kind: "resonance",
      partKey: "resonance",
      sourceKey: "ig_resonance_source",
      aiKey: "ig_resonance_ai",
      errorKey: "ig_resonance_ai_error",
      pickSavedText: (savedIg) => pickFirstValue(savedIg, [
        "parts.resonance",
        "rendered.carousel.slide3_text",
        "resonance_text",
        "carousel.slide3_text",
      ]),
      pickRenderedText: (savedIg) => pickFirstValue(savedIg, [
        "rendered.carousel.slide3_text",
        "carousel.slide3_text",
      ]),
      applySaved: ({ igOut, savedText, renderedText }) => {
        igOut.parts.resonance = savedText;
        igOut.rendered.carousel.slide3_text = renderedText || savedText;
      },
      applyGenerated: ({ igOut, result }) => {
        igOut.parts.resonance = result.text;
        igOut.rendered.carousel.slide3_text = result.text;
      },
      generate: ({ story, dict, openai }) => generateIgResonanceText({ story, dict, openai }),
    },
    tsukiji_structure: {
      kind: "tsukiji_structure",
      partKey: "structure_label",
      sourceKey: "ig_tsukiji_source",
      aiKey: "ig_tsukiji_ai",
      errorKey: "ig_tsukiji_ai_error",
      pickSavedText: (savedIg) => pickFirstValue(savedIg, [
        "parts.structure_label",
        "rendered.carousel.slide4_label",
        "carousel.slide4_structure",
        "tsukiji_structure_text",
      ]),
      pickRenderedText: (savedIg) => pickFirstValue(savedIg, [
        "rendered.carousel.slide4_label",
        "carousel.slide4_structure",
      ]),
      applySaved: ({ igOut, savedText, renderedText }) => {
        igOut.parts.structure_label = savedText;
        igOut.rendered.carousel.slide4_label = renderedText || savedText;
      },
      applyGenerated: ({ igOut, result }) => {
        igOut.parts.structure_label = result.text;
        igOut.rendered.carousel.slide4_label = result.text;
      },
      generate: ({ story, dict, openai }) => generateIgTsukijiStructureText({ story, dict, openai }),
    },
    moon: {
      kind: "moon",
      partKey: "moon",
      sourceKey: "ig_moon_source",
      aiKey: "ig_moon_ai",
      errorKey: "ig_moon_ai_error",
      pickSavedText: (savedIg) => pickFirstValue(savedIg, [
        "parts.moon",
        "rendered.carousel.slide2_text",
        "moon_text",
        "carousel.slide2_text",
      ]),
      pickRenderedText: (savedIg) => pickFirstValue(savedIg, [
        "rendered.carousel.slide2_text",
        "carousel.slide2_text",
      ]),
      applySaved: ({ igOut, savedText, renderedText }) => {
        igOut.parts.moon = savedText;
        igOut.rendered.carousel.slide2_text = renderedText || savedText;
      },
      applyGenerated: ({ igOut, result }) => {
        igOut.parts.moon = result.text;
        igOut.rendered.carousel.slide2_text = result.text;
      },
      generate: ({ story, dict, openai }) => generateIgMoonText({ story, dict, openai }),
    },
    observation: {
      kind: "observation",
      partKey: "observation",
      sourceKey: "ig_observation_source",
      aiKey: "ig_observation_ai",
      errorKey: "ig_observation_ai_error",
      pickSavedText: (savedIg) => pickFirstValue(savedIg, [
        "parts.observation",
        "rendered.carousel.slide1_observation",
        "carousel.slide1_observation",
        "observation_text",
      ]),
      pickRenderedText: (savedIg) => pickFirstValue(savedIg, [
        "rendered.carousel.slide1_observation",
        "carousel.slide1_observation",
      ]),
      applySaved: ({ igOut, savedText, renderedText }) => {
        igOut.parts.observation = savedText;
        igOut.rendered.carousel.slide1_observation = renderedText || savedText;
      },
      applyGenerated: ({ igOut, result }) => {
        igOut.parts.observation = result.text;
        igOut.rendered.carousel.slide1_observation = result.text;
      },
      generate: ({ story, dict, openai }) => generateIgObservationText({ story, dict, openai }),
    },
    sky_overview: {
      kind: "sky_overview",
      partKey: "sky_overview",
      sourceKey: "ig_sky_overview_source",
      aiKey: "ig_sky_overview_ai",
      errorKey: "ig_sky_overview_ai_error",
      pickSavedText: (savedIg) => pickFirstValue(savedIg, [
        "parts.sky_overview",
        "sky_overview_text",
        "caption_sky_overview",
      ]),
      applySaved: ({ igOut, savedText }) => {
        igOut.parts.sky_overview = savedText;
      },
      applyGenerated: ({ igOut, result }) => {
        igOut.parts.sky_overview = result.text;
      },
      generate: ({ story, dict, openai }) => generateIgSkyOverviewText({ story, dict, openai }),
    },
  };

  const maybeAttachIgResonanceText = (args) => maybeAttachIgPart(igAttachConfigs.resonance, args);
  const maybeAttachIgTsukijiStructure = (args) => maybeAttachIgPart(igAttachConfigs.tsukiji_structure, args);
  const maybeAttachIgMoonText = (args) => maybeAttachIgPart(igAttachConfigs.moon, args);
  const maybeAttachIgObservationText = (args) => maybeAttachIgPart(igAttachConfigs.observation, args);
  const maybeAttachIgSkyOverviewText = (args) => maybeAttachIgPart(igAttachConfigs.sky_overview, args);

  function applyXAiResult(meta, { outputKey, metaKey, result }) {
    meta.x_ai[outputKey] = result.text;
    meta[metaKey] = {
      ok: true,
      source: result.fallback ? "fallback" : "ai",
      fallback: !!result.fallback,
      model: result.model || env2.OPENAI_MODEL || null,
      chars: result.len || result.text.length,
      generated_at_utc: new Date().toISOString(),
    };
    if (result.fallback && result.fallback_reason) {
      meta[metaKey].fallback_reason = result.fallback_reason;
    }
  }

  function applyXSimpleResult(meta, { outputKey, metaKey, result }) {
    meta.x_ai[outputKey] = result.text;
    meta[metaKey] = {
      model: result.model || env2.OPENAI_MODEL || null,
      chars: result.text.length,
      generated_at_utc: new Date().toISOString(),
    };
  }

  async function maybeAttachXPart(config, { story, wantAi, forceAi }) {
    if (!wantAi) return;
    if (!story || !story.public) return;
    if (typeof config.shouldRun === "function" && !config.shouldRun({ story })) return;

    const meta = ensureXMeta(story);
    if (!forceAi && typeof config.hasOutput === "function" && config.hasOutput(meta)) return;

    const prep = typeof config.prepare === "function" ? config.prepare({ story, dict, meta }) : {};
    if (prep?.skip) return;

    if (!openaiConfig.apiKey) {
      meta[config.errorKey] = "OPENAI_API_KEY missing";
      return;
    }

    try {
      const result = await config.generate({
        story,
        dict,
        openai: openaiConfig,
        ...(prep?.args || {}),
      });
      logAiGeneration({
        channel: "x",
        kind: config.kind || config.outputKey || "",
        ok: !!result?.ok,
        attempts: result?.attempts,
        fallback: !!result?.fallback,
        reason: result?.fallback_reason || result?.reason || result?.error || "",
        model: result?.model || null,
        lastText: result?.last_text || result?.lastText || "",
      });
      if (result?.ok && result?.text) {
        config.applySuccess({ meta, result, story });
      } else {
        meta[config.errorKey] = result?.error || "unknown";
        if (config.reasonKey && result?.reason) meta[config.reasonKey] = result.reason;
      }
    } catch (e) {
      meta[config.errorKey] = e?.message || String(e);
    }
  }

  const xAttachConfigs = {
    sora: {
      kind: "daily",
      outputKey: "morning",
      metaKey: "x_sora_ai",
      errorKey: "x_sora_ai_error",
      reasonKey: "x_sora_ai_error_reason",
      hasOutput: (meta) => !!meta.x_ai?.morning,
      generate: ({ story, dict, openai }) => generateXSoraAiText({ story, dict, openai }),
      applySuccess: ({ meta, result }) => applyXAiResult(meta, { outputKey: "morning", metaKey: "x_sora_ai", result }),
    },
    night: {
      kind: "night",
      outputKey: "night",
      metaKey: "x_night_ai",
      errorKey: "x_night_ai_error",
      reasonKey: "x_night_ai_error_reason",
      hasOutput: (meta) => !!meta.x_ai?.night,
      prepare: ({ story, dict, meta }) => {
        const picked = pickPrimaryResonanceAspect({ story, dict });
        if (picked?.raw) meta.x_source.resonance_aspect = picked.raw;
        return {};
      },
      generate: ({ story, dict, openai }) => generateXNightAiText({ story, dict, openai }),
      applySuccess: ({ meta, result }) => applyXAiResult(meta, { outputKey: "night", metaKey: "x_night_ai", result }),
    },
    resonance: {
      kind: "resonance",
      outputKey: "resonance",
      metaKey: "x_resonance_ai",
      errorKey: "x_resonance_ai_error",
      reasonKey: "x_resonance_ai_error_reason",
      hasOutput: (meta) => !!meta.x_ai?.resonance,
      prepare: ({ story, dict, meta }) => {
        const maxOrb = Number(SPEC?.orb?.free ?? 1.5);
        const picked = pickPrimaryResonanceAspect({ story, dict, maxOrbDeg: maxOrb });
        if (picked?.raw) meta.x_source.resonance_aspect = picked.raw;
        if (!picked) return { skip: true };
        return { args: { aspect: picked } };
      },
      generate: ({ story, dict, openai, aspect }) => generateXResonanceAiText({ story, dict, aspect, openai }),
      applySuccess: ({ meta, result }) => applyXAiResult(meta, { outputKey: "resonance", metaKey: "x_resonance_ai", result }),
    },
    moon_event: {
      kind: "moon_event",
      outputKey: "moon_event",
      metaKey: "x_moon_event_ai",
      errorKey: "x_moon_event_ai_error",
      reasonKey: "x_moon_event_ai_error_reason",
      hasOutput: (meta) => !!meta.x_ai?.moon_event,
      prepare: ({ story, dict, meta }) => {
        const event = detectMoonEvent({ story, dict, asOfISO: story?.meta?.as_of });
        if (!event) return { skip: true };
        meta.x_source.moon_event = event;
        return { args: { event } };
      },
      generate: ({ story, dict, openai, event }) => generateXMoonEventAiText({ story, dict, event, openai }),
      applySuccess: ({ meta, result }) => applyXSimpleResult(meta, { outputKey: "moon_event", metaKey: "x_moon_event_ai", result }),
    },
    monthly: {
      kind: "monthly",
      outputKey: "monthly",
      metaKey: "x_monthly_ai",
      errorKey: "x_monthly_ai_error",
      reasonKey: "x_monthly_ai_error_reason",
      shouldRun: ({ story }) => {
        const dateLocal = story?.meta?.date_local || story?.public?.date_local || "";
        return isMonthStartDateLocal(dateLocal);
      },
      hasOutput: (meta) => !!meta.x_ai?.monthly,
      prepare: ({ story, dict, meta }) => {
        const resonanceMode = story?.meta?.resonance_mode || null;
        const context = buildMonthlyContext({ story, dict, asOfISO: story?.meta?.as_of, resonanceMode });
        meta.x_source.monthly_context = context;
        return { args: { context } };
      },
      generate: ({ story, dict, openai, context }) => generateXMonthlyAiText({ story, dict, context, openai }),
      applySuccess: ({ meta, result }) => applyXSimpleResult(meta, { outputKey: "monthly", metaKey: "x_monthly_ai", result }),
    },
  };

  const maybeAttachXSoraText = (args) => maybeAttachXPart(xAttachConfigs.sora, args);
  const maybeAttachXNightText = (args) => maybeAttachXPart(xAttachConfigs.night, args);
  const maybeAttachXResonanceText = (args) => maybeAttachXPart(xAttachConfigs.resonance, args);
  const maybeAttachXMoonEventText = (args) => maybeAttachXPart(xAttachConfigs.moon_event, args);
  const maybeAttachXMonthlyText = (args) => maybeAttachXPart(xAttachConfigs.monthly, args);

  return {
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
  };
}

module.exports = { createStoriesAiHelpers };
