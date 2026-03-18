"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../content/prompts/sora/sora_ai_prompts");
const { X_SORA_USER_GUIDE } = require("../../../content/prompts/sns/x/x_sora_prompts");
const { signJa } = require("../../../presenters/format/format/line_common");
const { validateXAiText } = require("./x_ai_common");

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

function validateText(text) {
  return validateXAiText(text, { minChars: 90, maxChars: 120 });
}

async function generateXSoraAiText({ story, dict, openai, maxRetries = 7 }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userPrompt = buildXSoraPrompt({ story, dict }) +
      (retryNote ? `\n\nRETRY_NOTE: ${retryNote}` : "") +
      (lastText ? `\n\nPREV_OUTPUT:\n${lastText}\n\n上の出力を条件に合わせて整えて再出力。` : "");

    const text = await createChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        { role: "system", content: SORA_AI_SYSTEM_PROMPT_COMMON },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 160,
    });

    const verdict = validateText(text);
    if (verdict.ok) return { ok: true, text: verdict.text, model };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = `前回は条件外でした（${lastReason}）。90〜120文字の観測文で短く再出力。`;
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText };
}

module.exports = {
  buildXSoraPrompt,
  generateXSoraAiText,
};
