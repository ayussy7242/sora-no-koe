"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../../content/prompts/sora/sora_core");
const { X_SORA_USER_GUIDE } = require("../../../../content/prompts/sns/x/daily");
const { signJa } = require("../../../../presenters/format/format/common");
const { generateXAiWithRetry, fallbackFactory, buildElementCount, buildModalityCount, buildTransitSigns } = require("./common");
const { safeTrim } = require("../../../../utils/text/normalize");
const { buildMorningEventNotice } = require("../../../../presenters/shared/text/morning_event_notice");
const { pickLeadingHouseFocus } = require("../../../../presenters/shared/house_focus");
const { buildMorningHighlightAspect } = require("../../../story/morning_highlight_aspect");

function buildSunMoonLines({ story, dict }) {
  const transit = story?.public?.transit_signs || {};
  const sunKey = transit?.sun?.sign_key || "";
  const moonKey = transit?.moon?.sign_key || "";
  const sun = transit?.sun?.sign_ja || signJa(dict, sunKey || "") || "—";
  const moon = transit?.moon?.sign_ja || signJa(dict, moonKey || "") || "—";
  return { sun, moon };
}

function buildXSoraPrompt({ story, dict }) {
  const { sun, moon } = buildSunMoonLines({ story, dict });
  const transitSigns = buildTransitSigns({ story, dict });
  const elementCount = buildElementCount(story);
  const modalityCount = buildModalityCount(story);
  const houseFocus = pickLeadingHouseFocus(story?.public?.house_focus);
  const nextEvent = buildMorningEventNotice(story, { dict }).slice(0, 1).join(" ");
  const highlightAspect = buildMorningHighlightAspect({ story, dict });

  return [
    X_SORA_USER_GUIDE,
    "",
    "INPUT:",
    `SUN_SIGN: ${safeTrim(sun)}`,
    `MOON_SIGN: ${safeTrim(moon)}`,
    `TRANSIT_SIGNS: ${JSON.stringify(transitSigns)}`,
    `HOUSE_FOCUS: ${JSON.stringify(houseFocus)}`,
    `MORNING_HIGHLIGHT_ASPECT: ${safeTrim(highlightAspect?.text || "")}`,
    `NEXT_EVENT: ${safeTrim(nextEvent)}`,
    `SKY_STRATA.element_count: ${JSON.stringify(elementCount)}`,
    `SKY_STRATA.modality_count: ${JSON.stringify(modalityCount)}`,
  ].join("\n");
}

async function generateXSoraAiText({ story, dict, openai, maxRetries, maxChars, minChars }) {
  const resolvedMaxChars = Number.isFinite(Number(maxChars)) ? Number(maxChars) : 220;
  const resolvedMinChars = Number.isFinite(Number(minChars))
    ? Number(minChars)
    : Math.min(140, resolvedMaxChars);
  return generateXAiWithRetry({
    channel: "x_morning",
    prompt: buildXSoraPrompt({ story, dict }),
    minChars: resolvedMinChars,
    maxChars: resolvedMaxChars,
    maxTokens: 160,
    temperature: 0.4,
    allowFallback: false,
    maxRetries,
    openai,
    story,
    dict,
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    createChatCompletion,
    retryNoteTemplate: "前回は条件外でした（${reason}）。配置→力学→補助の順で、140〜220文字を目安に再出力。",
    fallbackFactory,
  });
}

module.exports = {
  buildXSoraPrompt,
  generateXSoraAiText,
};
