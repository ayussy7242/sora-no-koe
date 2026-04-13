"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_RESONANCE_SPLIT,
  SORA_AI_USER_GUIDE_IG_RESONANCE_CAPTION,
} = require("../../../../content/prompts/sora/sora_core");
const { normalizeBodyKey } = require("../../../../domain/canonical");
const { resolveHouseNumber, HOUSE_BASIS } = require("../../../../domain/astro/compute");
const { aspectInfo, signJa } = require("../../../../presenters/format/format/common");
const { bodyLabelJa } = require("../../../../presenters/shared/text/tokens");
const { safeTrim } = require("../../../../utils/text/normalize");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("./utils");

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

  const aSignKey = aspect?.a_sign_key || null;
  const bSignKey = aspect?.b_sign_key || null;
  const aHouse = resolveHouseNumber({
    basis: HOUSE_BASIS.TRANSIT_PUBLIC,
    signKey: aSignKey,
    ascSignKey: ascKey,
    dict,
  });
  const bHouse = resolveHouseNumber({
    basis: HOUSE_BASIS.TRANSIT_PUBLIC,
    signKey: bSignKey,
    ascSignKey: ascKey,
    dict,
  });

  return {
    aHouse: aHouse ? `第${aHouse}ハウス` : "",
    bHouse: bHouse ? `第${bHouse}ハウス` : "",
  };
}

function resolveResonanceGuide(variant) {
  const key = String(variant || "").toLowerCase();
  if (key === "caption" || key === "cap") return SORA_AI_USER_GUIDE_IG_RESONANCE_CAPTION;
  return SORA_AI_USER_GUIDE_IG_RESONANCE_SPLIT;
}

function buildIgResonancePrompt({ story, dict, variant }) {
  const date = safeTrim(story?.meta?.date_local || story?.public?.date_local || "");
  const aspect = story?.outputs?.ig?.source?.resonance_aspect || null;
  if (!aspect) return "";
  const { aspectLine, orb, aBody, bBody, aSign, bSign } = buildAspectLine({ story, dict });
  const { aHouse, bHouse } = buildResonanceHouseLines({ story, dict, aspect });

  return [
    resolveResonanceGuide(variant),
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


async function generateIgResonanceText({ story, dict, openai, maxRetries = 1, variant }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });
  const hasAspect = !!story?.outputs?.ig?.source?.resonance_aspect;
  if (!hasAspect) return { ok: false, error: "resonance_aspect_missing" };

  const variantKey = String(variant || "").toLowerCase();
  const isCaption = variantKey === "caption" || variantKey === "cap";
  const isSplit = !isCaption;

  const result = await generateWithRetry({
    buildPrompt: () => buildIgResonancePrompt({ story, dict, variant }),
    buildRetryNote: (reason) =>
      isCaption
        ? `前回は条件外でした（${reason || "unknown"}）。「あなた」を避けて、3〜5行・余白を保って再出力。`
        : isSplit
        ? `前回は条件外でした（${reason || "unknown"}）。「あなた」を避けて、2〜3文・短めで整えて再出力。`
        : `前回は条件外でした（${reason || "unknown"}）。「あなた」を避けて、120〜180文字・3〜4文を目安に整えて再出力。`,
    validate: ({ raw }) => {
      const preset = isCaption
        ? PRESETS.ig.resonance_caption
        : PRESETS.ig.resonance_split;
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset,
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
    maxTokens: 520,
    context: { story, dict },
  });

  if (result.ok) return { ok: true, text: result.text, model, attempts: result.attempts, last_text: result.lastText };
  return {
    ok: false,
    error: result.error || "retry_exceeded",
    reason: result.reason,
    last_text: result.lastText ? String(result.lastText).trim() : "",
    attempts: result.attempts,
  };
}

module.exports = {
  buildIgResonancePrompt,
  generateIgResonanceText,
};
