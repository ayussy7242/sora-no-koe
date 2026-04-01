"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_RESONANCE,
} = require("../../../content/prompts/sora/sora_ai_prompts");
const { normalizeBodyKey } = require("../../../domain/canonical");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../../domain/astro_compute");
const { aspectInfo, signJa } = require("../../../presenters/format/format/common");
const { bodyLabelJa } = require("../../../presenters/shared/text/tokens");
const { safeTrim } = require("../../../utils/text_normalize");
const { runAiTextPipeline } = require("../../ai_text");
const { PRESETS } = require("../../ai_text/presets");
const { resolveMaxRetries } = require("./ai_utils");

function buildAspectLine({ story, dict }) {
  const aspect = story?.outputs?.ig?.source?.resonance_aspect || null;
  if (!aspect) return { aspectLine: "", aspectLabel: "", orb: "" };

  const aKey = normalizeBodyKey(aspect?.a || "");
  const bKey = normalizeBodyKey(aspect?.b || "");
  const aName = bodyLabelJa(dict, aKey);
  const bName = bodyLabelJa(dict, bKey);

  const aSign = aspect?.a_sign_ja || signJa(dict, aspect?.a_sign_key || "") || "";
  const bSign = aspect?.b_sign_ja || signJa(dict, aspect?.b_sign_key || "") || "";

  const info = aspectInfo(dict, aspect?.type || aspect?.aspect, aspect?.aspect_deg);
  const aspectLabel = info?.label_ja || String(aspect?.type || "").toUpperCase();
  const deg = Number.isFinite(Number(info?.deg)) ? Number(info.deg) : Number(aspect?.aspect_deg || 0);
  const degLabel = Number.isFinite(deg) ? `${deg}°` : "";
  const orb = Number.isFinite(Number(aspect?.orb_deg)) ? Number(aspect.orb_deg).toFixed(2) : "";

  const aspectLine = `${aName}（${aSign}） × ${bName}（${bSign}）`;
  const aspectLabelLine = `${aspectLabel} ${degLabel}`.trim();

  return {
    aspectLine,
    aspectLabel: aspectLabelLine,
    orb,
    aBody: aName,
    bBody: bName,
    aSign,
    bSign,
  };
}

function buildResonanceHouseLines({ story, dict, aspect }) {
  const focus = story?.public?.house_focus || {};
  const ascKey = focus?.asc_sign_key || null;
  if (!ascKey || !aspect) return { aHouse: "", bHouse: "" };

  const ascIndex = signIndexFromKey(dict, ascKey);
  const aSignKey = aspect?.a_sign_key || null;
  const bSignKey = aspect?.b_sign_key || null;
  const aIndex = aSignKey ? signIndexFromKey(dict, aSignKey) : -1;
  const bIndex = bSignKey ? signIndexFromKey(dict, bSignKey) : -1;
  const aHouse = Number.isFinite(aIndex) && aIndex >= 0 ? houseNumberForSignIndex(aIndex, ascIndex) : null;
  const bHouse = Number.isFinite(bIndex) && bIndex >= 0 ? houseNumberForSignIndex(bIndex, ascIndex) : null;

  return {
    aHouse: aHouse ? `第${aHouse}ハウス` : "",
    bHouse: bHouse ? `第${bHouse}ハウス` : "",
  };
}

function buildIgResonancePrompt({ story, dict }) {
  const date = safeTrim(story?.meta?.date_local || story?.public?.date_local || "");
  const aspect = story?.outputs?.ig?.source?.resonance_aspect || null;
  if (!aspect) return "";
  const { aspectLine, orb, aBody, bBody, aSign, bSign } = buildAspectLine({ story, dict });
  const { aHouse, bHouse } = buildResonanceHouseLines({ story, dict, aspect });

  return [
    SORA_AI_USER_GUIDE_IG_RESONANCE,
    "",
    "INPUT:",
    `DATE: ${date}`,
    `ASPECT: ${aspectLine}`,
    `A_BODY: ${aBody || "—"}`,
    `B_BODY: ${bBody || "—"}`,
    `A_SIGN: ${aSign || "—"}`,
    `B_SIGN: ${bSign || "—"}`,
    `ORB: ${orb}°`,
    `A_HOUSE: ${aHouse || "—"}`,
    `B_HOUSE: ${bHouse || "—"}`,
  ].join("\n");
}


async function generateIgResonanceText({ story, dict, openai, maxRetries = 1 }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });
  const hasAspect = !!story?.outputs?.ig?.source?.resonance_aspect;
  if (!hasAspect) return { ok: false, error: "resonance_aspect_missing" };

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= resolvedMaxRetries; attempt++) {
    const userPrompt = buildIgResonancePrompt({ story, dict }) +
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
      temperature: 0.5,
      maxTokens: 520,
    });

    const verdict = runAiTextPipeline({
      rawText: text,
      preset: PRESETS.ig.resonance,
    });
    if (verdict.ok) return { ok: true, text: verdict.text, model };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = `前回は条件外でした（${lastReason}）。「あなた」を避けて、120〜180文字・3〜4文を目安に整えて再出力。`;
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText };
}

module.exports = {
  buildIgResonancePrompt,
  generateIgResonanceText,
};
