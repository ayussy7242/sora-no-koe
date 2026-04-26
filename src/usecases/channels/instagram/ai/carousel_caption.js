"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_CAROUSEL_CAPTION,
  SORA_AI_USER_GUIDE_IG_CAROUSEL_OBSERVATION,
} = require("../../../../content/prompts/sora/sora_core");
const { buildTodayMoonInfo } = require("../../../../domain/moon");
const { signJa } = require("../../../../presenters/format/format/common");
const { pickObservationLine } = require("../../../../presenters/format/ig_caption");
const { buildMorningEventNotice } = require("../../../../presenters/shared/text/morning_event_notice");
const { pickLeadingHouseFocus } = require("../../../../presenters/shared/house_focus");
const { safeTrim, normalizeInlineText } = require("../../../../utils/text/normalize");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("./utils");
const { buildMorningHighlightAspect } = require("../../../story/morning_highlight_aspect");

function buildCaptionPrompt({ story, dict, asOfISO }) {
  const transit = story?.public?.transit_signs || {};
  const sunSign = safeTrim(transit?.sun?.sign_ja || signJa(dict, transit?.sun?.sign_key || ""));
  const moonSign = safeTrim(transit?.moon?.sign_ja || signJa(dict, transit?.moon?.sign_key || ""));
  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const phaseLabel = safeTrim(info?.phase?.name || "");
  const houseFocus = safeTrim(JSON.stringify(pickLeadingHouseFocus(story?.public?.house_focus)));
  const skyStrata = story?.public?.sky_strata || {};
  const elementCount = safeTrim(JSON.stringify(skyStrata?.element_count || {}));
  const modalityCount = safeTrim(JSON.stringify(skyStrata?.modality_count || skyStrata?.mode_count || {}));
  const transitSigns = safeTrim(JSON.stringify(transit));
  const nextEvent = buildMorningEventNotice(story, { dict, asOfISO }).slice(0, 1).join(" ");
  const highlightAspect = buildMorningHighlightAspect({ story, dict });

  return [
    SORA_AI_USER_GUIDE_IG_CAROUSEL_CAPTION,
    "",
    "INPUT:",
    `SUN_SIGN: ${sunSign}`,
    `MOON_SIGN: ${moonSign}`,
    `PHASE_LABEL: ${phaseLabel}`,
    `TRANSIT_SIGNS: ${transitSigns}`,
    `HOUSE_FOCUS: ${houseFocus}`,
    `MORNING_HIGHLIGHT_ASPECT: ${safeTrim(highlightAspect?.text || "")}`,
    `SKY_STRATA.element_count: ${elementCount}`,
    `SKY_STRATA.modality_count: ${modalityCount}`,
    `NEXT_EVENT: ${safeTrim(nextEvent)}`,
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
  const highlightAspect = buildMorningHighlightAspect({ story, dict });
  const line1 = `${sunSign || "—"}の太陽と、${moonSign || "—"}の月。`;
  const line2 = `配置の重心は静かに残り、観測の起点が見えています。`;
  const line3 = highlightAspect?.text
    ? `${highlightAspect.text}が近く、空の張りも前景化しています。`
    : "空全体は、動きながら輪郭を整える流れです。";
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
