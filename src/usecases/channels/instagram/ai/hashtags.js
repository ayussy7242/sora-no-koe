"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_HASHTAGS,
} = require("../../../../content/prompts/sora/sora_core");
const { safeTrim } = require("../../../../utils/text/normalize");
const { toHashtag } = require("../../../../utils/text/hashtag");
const { aspectInfo, signJa } = require("../../../../presenters/format/format/common");
const { normalizeBodyKey } = require("../../../../domain/canonical");
const { bodyLabelJa } = require("../../../../presenters/shared/text/tokens");
const { buildMoonStatus } = require("../../../../domain/moon");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("./utils");

function buildAspectLabel({ dict, aspect }) {
  if (!aspect) return "";
  const info = aspectInfo(dict, aspect?.type || aspect?.aspect, aspect?.aspect_deg);
  const label = info?.label_ja || "";
  const deg = Number.isFinite(Number(info?.deg)) ? `${Number(info.deg)}°` : "";
  return [label, deg].filter(Boolean).join(" ").trim();
}

function buildAspectLine({ dict, aspect, transitSigns }) {
  if (!aspect) return "";
  const aKey = normalizeBodyKey(aspect?.a || "");
  const bKey = normalizeBodyKey(aspect?.b || "");
  const aName = bodyLabelJa(dict, aKey);
  const bName = bodyLabelJa(dict, bKey);
  const aSign = aspect?.a_sign_ja || signJa(dict, aspect?.a_sign_key || "") || transitSigns?.[aKey]?.sign_ja || "";
  const bSign = aspect?.b_sign_ja || signJa(dict, aspect?.b_sign_key || "") || transitSigns?.[bKey]?.sign_ja || "";
  const aspectLabel = buildAspectLabel({ dict, aspect });
  return [aName && `${aName}（${aSign || "—"}）`, "×", bName && `${bName}（${bSign || "—"}）`, aspectLabel].filter(Boolean).join(" ");
}

function normalizeHashtagList(raw) {
  const text = String(raw || "");
  const found = text.match(/[#＃][^\s#＃]+/g) || [];
  const cleaned = found
    .map((tag) => toHashtag(tag))
    .filter(Boolean);
  const unique = [];
  cleaned.forEach((tag) => {
    if (!unique.includes(tag)) unique.push(tag);
  });
  return unique;
}

function fallbackTags(slot) {
  const key = String(slot || "").toLowerCase();
  if (key === "resonance") return ["#占星術", "#アスペクト", "#星読み", "#西洋占星術", "#astrology"];
  if (key === "night") return ["#占星術", "#月", "#月相", "#星読み", "#astrology"];
  return ["#占星術", "#ホロスコープ", "#星読み", "#西洋占星術", "#astrology"];
}

function buildIgHashtagsPrompt({ story, dict, slot }) {
  const date = safeTrim(story?.meta?.date_local || story?.public?.date_local || "");
  const transit = story?.public?.transit_signs || {};
  const sunSign = transit?.sun?.sign_ja || signJa(dict, transit?.sun?.sign_key || "");
  const moonSign = transit?.moon?.sign_ja || signJa(dict, transit?.moon?.sign_key || "");
  const asOfISO = date ? `${date}T12:00:00+09:00` : "";
  const moonStatus = asOfISO ? buildMoonStatus({ asOfISO, story, dict }) : null;
  const moonPhase = safeTrim(moonStatus?.phaseLabel || "");
  const resonanceAspect = story?.outputs?.ig?.source?.resonance_aspect || null;
  const resonanceLine = buildAspectLine({ dict, aspect: resonanceAspect, transitSigns: transit });

  return [
    SORA_AI_USER_GUIDE_IG_HASHTAGS,
    "",
    "INPUT:",
    `SLOT: ${slot || "morning"}`,
    `DATE: ${date}`,
    `SUN_SIGN: ${sunSign || "—"}`,
    `MOON_SIGN: ${moonSign || "—"}`,
    `MOON_PHASE: ${moonPhase || "—"}`,
    `RESONANCE: ${resonanceLine || "—"}`,
  ].join("\n");
}

async function generateIgHashtags({ story, dict, openai, slot = "morning", maxRetries = 1 }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  const result = await generateWithRetry({
    buildPrompt: () => buildIgHashtagsPrompt({ story, dict, slot }),
    buildRetryNote: (reason) =>
      `前回は条件外でした（${reason || "unknown"}）。#から始まるハッシュタグを5つだけ出力して再出力。`,
    validate: ({ raw }) => {
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset: PRESETS.ig.hashtags,
      });
      if (!verdict.ok) return { ok: false, reason: verdict.reason || "" };

      const tags = normalizeHashtagList(verdict.text);
      if (tags.length < 5) return { ok: false, reason: "need_five_tags" };
      return { ok: true, text: tags.slice(0, 5).join(" ") };
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

  const fallback = fallbackTags(slot).join(" ");
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
  generateIgHashtags,
};
