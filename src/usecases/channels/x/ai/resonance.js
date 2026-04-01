"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../../content/prompts/sora/sora_core");
const { X_RESONANCE_USER_GUIDE } = require("../../../../content/prompts/sns/x/resonance");
const { pickPrimaryResonanceAspect } = require("../../../../domain/resonance");
const { generateXAiWithRetry, fallbackFactory } = require("./common");

function buildXResonancePrompt({ story, dict, aspect }) {
  if (!aspect) return "";
  const date = String(story?.meta?.date_local || story?.public?.date_local || "").trim();
  const degText = Number.isFinite(Number(aspect.aspectDeg)) ? `${Math.round(Number(aspect.aspectDeg))}°` : "";
  const orbText = Number.isFinite(Number(aspect.orb)) ? `${Number(aspect.orb).toFixed(2)}°` : "";

  return [
    X_RESONANCE_USER_GUIDE,
    "",
    "INPUT:",
    `DATE: ${date}`,
    `A_BODY: ${aspect.aLabel}`,
    `B_BODY: ${aspect.bLabel}`,
    `A_SIGN: ${aspect.aSign || "—"}`,
    `B_SIGN: ${aspect.bSign || "—"}`,
    `ASPECT: ${aspect.aspectLabel} ${degText}`.trim(),
    `ORB: ${orbText}`,
  ].join("\n");
}

async function generateXResonanceAiText({ story, dict, openai, maxRetries, aspect, resonanceMode }) {
  const picked = aspect || pickPrimaryResonanceAspect({ story, dict, resonanceMode });
  if (!picked) return { ok: false, error: "resonance_aspect_missing" };

  return generateXAiWithRetry({
    channel: "x_resonance",
    prompt: buildXResonancePrompt({ story, dict, aspect: picked }),
    minChars: 0,
    maxChars: 180,
    maxTokens: 130,
    temperature: 0.5,
    maxRetries,
    openai,
    story,
    dict,
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    createChatCompletion,
    retryNoteTemplate: "前回は条件外でした（${reason}）。90〜130文字で短く整えて再出力。",
    fallbackFactory,
    fallbackContext: { aspect: picked },
  }).then((res) => ({ ...res, aspect: picked }));
}

module.exports = {
  pickPrimaryResonanceAspect,
  buildXResonancePrompt,
  generateXResonanceAiText,
};
