"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_CAROUSEL_CAPTION,
  SORA_AI_USER_GUIDE_IG_CAROUSEL_OBSERVATION,
} = require("../../../../content/prompts/sora/sora_core");
const { buildTodayMoonInfo } = require("../../../../domain/moon");
const { aspectInfo, signJa } = require("../../../../presenters/format/format/common");
const { normalizeBodyKey } = require("../../../../domain/canonical");
const { pickObservationLine } = require("../../../../presenters/format/ig_caption");
const { bodyLabelJa } = require("../../../../presenters/shared/text/tokens");
const { safeTrim, normalizeInlineText } = require("../../../../utils/text/normalize");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("./utils");

function buildResonanceMeta({ story, dict }) {
  const aspect = story?.outputs?.ig?.source?.resonance_aspect || null;
  if (!aspect) return null;
  const aKey = normalizeBodyKey(aspect?.a || "");
  const bKey = normalizeBodyKey(aspect?.b || "");
  const aBody = bodyLabelJa(dict, aKey);
  const bBody = bodyLabelJa(dict, bKey);
  const info = aspectInfo(dict, aspect?.type || aspect?.aspect, aspect?.aspect_deg);
  const label = info?.label_ja || safeTrim(aspect?.type || "");
  const deg = Number.isFinite(Number(info?.deg)) ? Number(info.deg) : Number(aspect?.aspect_deg);
  const degLabel = Number.isFinite(Number(deg)) ? `${deg}°` : "";
  const aspectLabel = [label, degLabel].filter(Boolean).join(" ").trim();
  const orb = Number.isFinite(Number(aspect?.orb_deg)) ? Number(aspect.orb_deg).toFixed(2) : "";
  const aSign = aspect?.a_sign_ja || signJa(dict, aspect?.a_sign_key || "") || "";
  const bSign = aspect?.b_sign_ja || signJa(dict, aspect?.b_sign_key || "") || "";
  return { aBody, bBody, aspectLabel, orb, aSign, bSign };
}

function buildCaptionPrompt({ story, dict, asOfISO }) {
  const transit = story?.public?.transit_signs || {};
  const sunSign = safeTrim(transit?.sun?.sign_ja || signJa(dict, transit?.sun?.sign_key || ""));
  const moonSign = safeTrim(transit?.moon?.sign_ja || signJa(dict, transit?.moon?.sign_key || ""));
  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const phaseLabel = safeTrim(info?.phase?.name || "");

  return [
    SORA_AI_USER_GUIDE_IG_CAROUSEL_CAPTION,
    "",
    "INPUT:",
    `SUN_SIGN: ${sunSign}`,
    `MOON_SIGN: ${moonSign}`,
    `PHASE_LABEL: ${phaseLabel}`,
  ].join("\n");
}

function buildObservationPrompt({ story, dict }) {
  const houseFocus = story?.public?.house_focus || {};
  const transitSigns = story?.public?.transit_signs || {};
  const skyStrata = story?.public?.sky_strata || {};
  const elementCount = skyStrata?.element_count || {};
  const modalityCount = skyStrata?.modality_count || skyStrata?.mode_count || {};
  return [
    SORA_AI_USER_GUIDE_IG_CAROUSEL_OBSERVATION,
    "",
    "INPUT:",
    `HOUSE_FOCUS: ${safeTrim(JSON.stringify(houseFocus))}`,
    `TRANSIT_SIGNS: ${safeTrim(JSON.stringify(transitSigns))}`,
    `SKY_STRATA.element_count: ${safeTrim(JSON.stringify(elementCount))}`,
    `SKY_STRATA.modality_count: ${safeTrim(JSON.stringify(modalityCount))}`,
  ].join("\n");
}

function buildCaptionFallback({ story, dict, asOfISO }) {
  const transit = story?.public?.transit_signs || {};
  const sunSign = safeTrim(transit?.sun?.sign_ja || signJa(dict, transit?.sun?.sign_key || ""));
  const moonSign = safeTrim(transit?.moon?.sign_ja || signJa(dict, transit?.moon?.sign_key || ""));
  const resonance = buildResonanceMeta({ story, dict }) || {};
  const line1 = `${sunSign || "—"}の太陽と、${moonSign || "—"}の月。`;
  const line2 = `空の基調は静かに重なり、余白の層が残ります。`;
  const line3 = resonance.aBody && resonance.bBody && resonance.aspectLabel
    ? `${resonance.aBody}と${resonance.bBody}の角度が${resonance.aspectLabel}として残ります。`
    : "空の接続は、内側に細い流れを置きます。";
  return normalizeInlineText([line1, line2, line3].join(" "));
}

function buildObservationFallback({ story, dict }) {
  const line1 = pickObservationLine({
    dict,
    transitSigns: story?.public?.transit_signs || {},
    skyStrata: story?.public?.sky_strata || {},
    houseFocus: story?.public?.house_focus || {},
  });
  const line2 = "空の重心が静かに残る配置。";
  return [line1, line2].filter(Boolean).join("\n");
}

async function generateIgCarouselCaptionText({ story, dict, openai, maxRetries = 1, asOfISO }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  const result = await generateWithRetry({
    buildPrompt: () => buildCaptionPrompt({ story, dict, asOfISO }),
    buildRetryNote: () => "条件外でした。長さと禁止事項を守り、自然な観測文で再出力してください。",
    validate: ({ raw }) => {
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset: PRESETS.ig.carousel_caption,
      });
      if (verdict.ok) return { ok: true, text: verdict.text };
      return { ok: false, reason: verdict.reason || "" };
    },
    createChatCompletion,
    openai: {
      apiKey,
      baseUrl: openai?.baseUrl,
      model,
      maxRetries: openai?.maxRetries,
    },
    maxRetries: resolvedMaxRetries,
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    temperature: 0.5,
    maxTokens: 240,
    context: { story, dict, asOfISO },
  });

  if (result.ok) return { ok: true, text: result.text, model, attempts: result.attempts, last_text: result.lastText };

  if (String(result.error || "").includes("missing") || String(result.error || "").startsWith("openai_error:")) {
    return { ok: false, error: result.error || "retry_exceeded", reason: result.reason, attempts: result.attempts, last_text: result.lastText };
  }

  const fallback = buildCaptionFallback({ story, dict, asOfISO });
  return {
    ok: true,
    text: fallback,
    model,
    fallback: true,
    reason: result.reason || "",
    fallback_reason: result.reason || result.error || "",
    attempts: result.attempts,
    last_text: result.lastText,
  };
}

async function generateIgCarouselObservationText({ story, dict, openai, maxRetries = 1 }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  const result = await generateWithRetry({
    buildPrompt: () => buildObservationPrompt({ story, dict }),
    buildRetryNote: () => "条件外でした。短く、観測文として自然に整えて再出力してください。",
    validate: ({ raw }) => {
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset: PRESETS.ig.carousel_observation,
      });
      if (verdict.ok) return { ok: true, text: verdict.text };
      return { ok: false, reason: verdict.reason || "" };
    },
    createChatCompletion,
    openai: {
      apiKey,
      baseUrl: openai?.baseUrl,
      model,
      maxRetries: openai?.maxRetries,
    },
    maxRetries: resolvedMaxRetries,
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    temperature: 0.4,
    maxTokens: 120,
    context: { story, dict },
  });

  if (result.ok) return { ok: true, text: result.text, model, attempts: result.attempts, last_text: result.lastText };

  if (String(result.error || "").includes("missing") || String(result.error || "").startsWith("openai_error:")) {
    return { ok: false, error: result.error || "retry_exceeded", reason: result.reason, attempts: result.attempts, last_text: result.lastText };
  }

  const fallback = buildObservationFallback({ story, dict });
  return {
    ok: true,
    text: fallback,
    model,
    fallback: true,
    fallback_reason: result.reason || result.error || "",
    attempts: result.attempts,
    last_text: result.lastText,
  };
}

module.exports = {
  generateIgCarouselCaptionText,
  generateIgCarouselObservationText,
};
