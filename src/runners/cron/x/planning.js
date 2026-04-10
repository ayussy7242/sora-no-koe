"use strict";

const { countChars } = require("../../../utils/text/hashtag");
const { generateXSoraAiText } = require("../../../usecases/channels/x/ai/daily");
const { generateXNightAiText } = require("../../../usecases/channels/x/ai/night");
const { generateXResonanceAiText } = require("../../../usecases/channels/x/ai/resonance");
const {
  pickPrimaryResonanceAspect,
  listResonanceCandidates,
  buildResonanceKey,
  pickResonanceForX,
} = require("../../../domain/resonance");
const { isApplying } = require("../../../domain/aspect/proximity");
const { ensureXMeta } = require("./utils");

async function buildMorningPosts({
  story,
  dict,
  renderers,
  openai,
  useAi,
  maxOrbDeg,
  maxMainChars,
  includeResonance = false,
  aiMaxRetries,
}) {
  const meta = ensureXMeta(story);
  const errors = [];
  const debug = {};
  let mainAiMax = null;

  let mainAiMin = null;
  if (useAi && Number.isFinite(Number(maxMainChars))) {
    const prev = meta.x_ai.morning;
    meta.x_ai.morning = "";
    const headerText = await renderers.renderXMorningMain(story);
    meta.x_ai.morning = prev;
    const headerLen = countChars(headerText);
    const budget = Math.max(0, Number(maxMainChars) - headerLen - 2);
    if (budget > 0) {
      mainAiMax = budget;
      mainAiMin = Math.min(90, budget);
    }
  }

  if (useAi) {
    const res = await generateXSoraAiText({
      story,
      dict,
      openai,
      maxChars: mainAiMax ?? undefined,
      minChars: mainAiMin ?? undefined,
      maxRetries: aiMaxRetries,
    });
    if (res?.ok && res.text) {
      meta.x_ai.morning = res.text;
    } else {
      errors.push({ slot: "morning", error: res?.error || "unknown", reason: res?.reason || "" });
    }
  }

  let picked = null;
  if (includeResonance) {
    picked = pickPrimaryResonanceAspect({ story, dict, maxOrbDeg });
    if (picked?.raw) meta.x_source.resonance_aspect = picked.raw;

    if (useAi && picked) {
      const res = await generateXResonanceAiText({ story, dict, openai, aspect: picked });
      if (res?.ok && res.text) {
        meta.x_ai.resonance = res.text;
      } else {
        errors.push({ slot: "resonance", error: res?.error || "unknown", reason: res?.reason || "" });
      }
    }
  }

  if (errors.length && useAi) {
    return { posts: [], hasResonance: !!picked, errors };
  }

  const morningText = await renderers.renderXMorningMain(story);
  const logText = await renderers.renderXMorningLog(story);
  const resonanceText = includeResonance ? await renderers.renderXResonance(story) : "";

  const posts = [
    { text: morningText, slot: "main" },
    { text: logText, slot: "log" },
    includeResonance ? { text: resonanceText, slot: "resonance" } : null,
  ]
    .filter(Boolean)
    .map((it) => ({ ...it, text: String(it.text || "").trim() }))
    .filter((it) => it.text);

  return {
    posts,
    hasResonance: !!(includeResonance && resonanceText && String(resonanceText).trim()),
    errors,
  };
}

async function buildResonancePost({
  story,
  dict,
  renderers,
  openai,
  useAi,
  maxOrbDeg,
  triggerOrbMax,
  excludeKeys,
  maxTotalChars,
  aiMaxRetries,
}) {
  const meta = ensureXMeta(story);
  const errors = [];
  const debug = {};

  const candidates = listResonanceCandidates({ story, maxOrbDeg, resonanceMode: story?.meta?.resonance_mode });
  if (!candidates.length) {
    return { post: null, hasResonance: false, errors, skipReason: "no_resonance" };
  }

  const excluded = Array.isArray(excludeKeys) ? new Set(excludeKeys.filter(Boolean)) : new Set();
  const usable = candidates.filter((row) => !excluded.has(buildResonanceKey(row)));
  if (!usable.length) {
    return { post: null, hasResonance: false, errors, skipReason: "all_excluded" };
  }

  const triggerLimit = Number.isFinite(Number(triggerOrbMax)) ? Number(triggerOrbMax) : null;
  const withinTrigger = triggerLimit != null
    ? usable.filter((row) => Number(row?.orb_deg) <= triggerLimit)
    : usable;
  if (!withinTrigger.length) {
    const closest = usable[0];
    return {
      post: null,
      hasResonance: false,
      errors,
      skipReason: "orb_too_wide",
      skipMeta: {
        orb: Number(closest?.orb_deg),
        threshold: triggerLimit,
        candidate_key: buildResonanceKey(closest),
      },
    };
  }

  const asOfISO = String(story?.meta?.as_of || story?.meta?.asOfISO || "").trim() || new Date().toISOString();
  const applying = withinTrigger.filter((row) => isApplying({
    kind: "transit-transit",
    aKey: row?.a,
    bKey: row?.b,
    aspectDeg: row?.aspect_deg,
    asOfISO,
    nowOrb: row?.orb_deg,
  }) === true);
  const pool = applying.length ? applying : withinTrigger;
  const { item: pickedItem, list: importantList } = pickResonanceForX({
    story,
    dict,
    candidates: pool,
    skyTop: story?.public?.sky_top,
    asOfISO,
  });
  const isApplyingItem = (item) => {
    const candidate = item?.candidate || {};
    return isApplying({
      kind: "transit-transit",
      aKey: candidate?.a,
      bKey: candidate?.b,
      aspectDeg: candidate?.aspect_deg,
      asOfISO,
      nowOrb: candidate?.orb_deg,
    }) === true;
  };
  if (Array.isArray(importantList) && importantList.length) {
    debug.important = importantList.slice(0, 5).map((item) => ({
      key: item?.key || "",
      types: item?.types || [],
      score: item?.score ?? null,
      reasons: item?.reasons || [],
      channel_bias: item?.channel_bias || null,
      applying: isApplyingItem(item),
      orb: item?.flags?.orb ?? null,
      a: item?.candidate?.a || null,
      b: item?.candidate?.b || null,
      aspect_deg: item?.candidate?.aspect_deg ?? null,
      a_sign_key: item?.candidate?.a_sign_key || null,
      b_sign_key: item?.candidate?.b_sign_key || null,
    }));
  }
  const pickedRaw = pickedItem?.candidate || pool[0];
  if (pickedItem) {
    debug.picked = {
      key: pickedItem?.key || buildResonanceKey(pickedRaw),
      types: pickedItem?.types || [],
      score: pickedItem?.score ?? null,
      reasons: pickedItem?.reasons || [],
      channel_bias: pickedItem?.channel_bias || null,
      applying: isApplyingItem(pickedItem),
      orb: pickedItem?.flags?.orb ?? null,
    };
  }
  const picked = pickPrimaryResonanceAspect({
    story: { ...story, public: { ...story?.public, sky_all: [pickedRaw] } },
    dict,
    maxOrbDeg,
  });

  if (picked?.raw) meta.x_source.resonance_aspect = picked.raw;

  if (useAi && picked) {
    let minChars = 90;
    let maxChars = 145;
    if (Number.isFinite(Number(maxTotalChars)) && renderers?.renderXResonance) {
      const prev = meta.x_ai.resonance;
      meta.x_ai.resonance = "";
      const baseText = await renderers.renderXResonance(story);
      meta.x_ai.resonance = prev;
      const baseLen = countChars(baseText || "");
      const gap = 2; // blank line before AI text
      const budget = Math.max(0, Number(maxTotalChars) - baseLen - gap);
      if (Number.isFinite(budget)) {
        minChars = Math.min(minChars, budget);
        maxChars = Math.min(maxChars, budget);
      }
    }

    const res = await generateXResonanceAiText({
      story,
      dict,
      openai,
      aspect: picked,
      minChars,
      maxChars,
      maxTokens: 180,
      maxRetries: aiMaxRetries,
    });
    if (res?.ok && res.text) {
      meta.x_ai.resonance = res.text;
    } else {
      errors.push({ slot: "resonance", error: res?.error || "unknown", reason: res?.reason || "" });
    }
  }

  if (errors.length && useAi) {
    return { post: null, hasResonance: !!picked, errors, debug };
  }

  const resonanceText = await renderers.renderXResonance(story);
  const post = resonanceText ? { text: String(resonanceText || "").trim(), slot: "resonance" } : null;

  return {
    post,
    hasResonance: !!(post && post.text),
    errors,
    skipReason: post ? null : "no_resonance",
    picked,
    pickedKey: picked?.raw ? buildResonanceKey(picked.raw) : "",
    debug,
  };
}

async function buildNightPosts({ story, dict, renderers, openai, useAi }) {
  const meta = ensureXMeta(story);

  if (useAi) {
    const res = await generateXNightAiText({ story, dict, openai });
    if (res?.ok && res.text) meta.x_ai.night = res.text;
  }

  const text = await renderers.renderXNight(story);
  return { posts: [String(text || "").trim()].filter(Boolean) };
}

module.exports = {
  buildMorningPosts,
  buildResonancePost,
  buildNightPosts,
};
