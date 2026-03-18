"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../content/prompts/sora/sora_ai_prompts");
const { X_SORA_USER_GUIDE } = require("../../../content/prompts/sns/x/x_sora_prompts");
const { signJa } = require("../../../presenters/format/format/line_common");
const { generateXAiWithRetry, fallbackFactory } = require("./x_ai_common");

function safeText(x) {
  return String(x || "").trim();
}

function buildElementCount(story) {
  const counts = story?.public?.sky_strata?.element_count || story?.meta?.sky_strata?.element_count || {};
  return {
    fire: Number(counts.fire || 0),
    earth: Number(counts.earth || 0),
    air: Number(counts.air || 0),
    water: Number(counts.water || 0),
  };
}

function buildModalityCount(story) {
  const counts = story?.public?.sky_strata?.modality_count || story?.meta?.sky_strata?.modality_count || {};
  return {
    cardinal: Number(counts.cardinal || 0),
    fixed: Number(counts.fixed || 0),
    mutable: Number(counts.mutable || 0),
  };
}

function buildSunMoonLines({ story, dict }) {
  const transit = story?.public?.transit_signs || {};
  const sunKey = transit?.sun?.sign_key || "";
  const moonKey = transit?.moon?.sign_key || "";
  const sun = transit?.sun?.sign_ja || signJa(dict, sunKey || "") || "—";
  const moon = transit?.moon?.sign_ja || signJa(dict, moonKey || "") || "—";
  return { sun, moon };
}

function buildTransitSigns({ story, dict }) {
  const transit = story?.public?.transit_signs || {};
  const bodyOrder = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ];
  const out = {};
  bodyOrder.forEach((k) => {
    const signKey = transit?.[k]?.sign_key || "";
    const signLabel = transit?.[k]?.sign_ja || signJa(dict, signKey || "") || "";
    if (signLabel) out[k] = signLabel;
  });
  return out;
}

function buildXSoraPrompt({ story, dict }) {
  const { sun, moon } = buildSunMoonLines({ story, dict });
  const transitSigns = buildTransitSigns({ story, dict });
  const elementCount = buildElementCount(story);
  const modalityCount = buildModalityCount(story);

  return [
    X_SORA_USER_GUIDE,
    "",
    "INPUT:",
    `SUN_SIGN: ${safeText(sun)}`,
    `MOON_SIGN: ${safeText(moon)}`,
    `TRANSIT_SIGNS: ${JSON.stringify(transitSigns)}`,
    `SKY_STRATA.element_count: ${JSON.stringify(elementCount)}`,
    `SKY_STRATA.modality_count: ${JSON.stringify(modalityCount)}`,
  ].join("\n");
}

async function generateXSoraAiText({ story, dict, openai, maxRetries }) {
  return generateXAiWithRetry({
    channel: "x_morning",
    prompt: buildXSoraPrompt({ story, dict }),
    minChars: 90,
    maxChars: 120,
    maxTokens: 160,
    temperature: 0.4,
    maxRetries,
    openai,
    story,
    dict,
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    createChatCompletion,
    retryNoteTemplate: "前回は条件外でした（${reason}）。90〜120文字の観測文で短く再出力。",
    fallbackFactory,
  });
}

module.exports = {
  buildXSoraPrompt,
  generateXSoraAiText,
};
