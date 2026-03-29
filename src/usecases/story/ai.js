"use strict";

const { generateIgResonanceText } = require("../channels/ig/ig_resonance_ai");
const { generateIgObservationText } = require("../channels/ig/ig_observation_ai");
const { generateIgSkyOverviewText } = require("../channels/ig/ig_sky_overview_ai");
const { generateIgTsukijiStructureText } = require("../channels/ig/ig_tsukiji_structure_ai");
const { generateIgMoonText } = require("../channels/ig/ig_moon_ai");
const { generateXSoraAiText } = require("../channels/x/generate_x_sora_ai");
const { generateXResonanceAiText, pickPrimaryResonanceAspect } = require("../channels/x/generate_x_resonance_ai");
const { generateXNightAiText } = require("../channels/x/generate_x_night_ai");
const { generateXMoonEventAiText, detectMoonEvent } = require("../channels/x/generate_x_moon_event_ai");
const { generateXMonthlyAiText, buildMonthlyContext } = require("../channels/x/generate_x_monthly_ai");
const { SPEC } = require("../../config/sora_spec");
const { ensureIgOutputs } = require("./output_helpers");

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

function createStoriesAiHelpers({ db, env, dict }) {
  const env2 = env || {};

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

    const resonanceMode = story?.meta?.resonance_mode || null;
    const context = buildMonthlyContext({ story, dict, asOfISO: story?.meta?.as_of, resonanceMode });
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
