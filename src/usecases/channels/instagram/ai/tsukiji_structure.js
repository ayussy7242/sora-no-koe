"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_TSUKIJI_STRUCTURE,
} = require("../../../../content/prompts/sora/sora_core");
const { normalizeBodyKey, normalizeAspectKey } = require("../../../../domain/canonical");
const { buildTsukijiRowsPublic, buildKinjitsuRowsPublic } = require("../../../../domain/tsukiji/public");
const { signJa, aspectInfo } = require("../../../../presenters/format/format/common");
const { bodyLabelJa } = require("../../../../presenters/shared/text/tokens");
const { runAiTextPipeline, generateWithRetry } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("./utils");
const { safeTrim } = require("../../../../utils/text/normalize");

function formatSpanDays(row) {
  if (!row) return "";
  if (Number.isFinite(Number(row?.durationDays))) return String(Math.round(Number(row.durationDays)));
  if (row?.start instanceof Date && row?.end instanceof Date) {
    const days = Math.round((row.end.getTime() - row.start.getTime()) / 86400000);
    return Number.isFinite(days) ? String(days) : "";
  }
  return "";
}

function formatDateYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function pickTsukijiRow({ story }) {
  const resonance = story?.public?.sky_top?.[0] || story?.public?.sky_all?.[0] || null;
  const resKey = resonance ? [resonance.a, resonance.b].filter(Boolean).sort().join(":") : "";

  const longRows = buildTsukijiRowsPublic(story, story?.meta?.as_of || new Date().toISOString());
  const longPick = longRows.find((row) => {
    const rowKey = [row?.aKey, row?.bKey].filter(Boolean).sort().join(":");
    return !(resKey && rowKey && rowKey === resKey);
  });
  if (longPick) return { row: longPick, source: "tsukiji" };

  const kinRows = buildKinjitsuRowsPublic(story);
  const kinPick = kinRows.find((row) => {
    const rowKey = [row?.aKey, row?.bKey].filter(Boolean).sort().join(":");
    return !(resKey && rowKey && rowKey === resKey);
  });
  if (kinPick) return { row: kinPick, source: "kinjitsu" };

  return null;
}

function buildPrompt({ story, dict, pick }) {
  const row = pick?.row;
  const aKey = normalizeBodyKey(row?.aKey || "");
  const bKey = normalizeBodyKey(row?.bKey || "");
  const aBody = bodyLabelJa(dict, aKey);
  const bBody = bodyLabelJa(dict, bKey);
  const aSign = row?.aSignJa || signJa(dict, row?.aSignKey || "") || "";
  const bSign = row?.bSignJa || signJa(dict, row?.bSignKey || "") || "";
  const aspectInfoRow = aspectInfo(dict, row?.aspect, row?.aspectDeg);
  const aspectLabel = aspectInfoRow?.label_ja || safeTrim(row?.aspect || "");
  const orb = Number.isFinite(Number(row?.orb)) ? `${Number(row.orb).toFixed(2)}°` : "";
  const spanDays = formatSpanDays(row);
  const start = formatDateYmd(row?.start);
  const peak = formatDateYmd(row?.peak);
  const end = formatDateYmd(row?.end);

  return [
    SORA_AI_USER_GUIDE_IG_TSUKIJI_STRUCTURE,
    "",
    "INPUT:",
    `MODE: tsukiji_structure_line`,
    `A_BODY: ${aBody}`,
    `B_BODY: ${bBody}`,
    `A_SIGN: ${aSign}`,
    `B_SIGN: ${bSign}`,
    `ASPECT: ${aspectLabel}`,
    `ORB: ${orb}`,
    `START: ${start}`,
    `PEAK: ${peak}`,
    `END: ${end}`,
    `SPAN_DAYS: ${spanDays}`,
  ].join("\n");
}

async function generateIgTsukijiStructureText({ story, dict, openai, maxRetries = 2 }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const pick = pickTsukijiRow({ story });
  if (!pick?.row) return { ok: false, error: "tsukiji_not_found" };

  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  const result = await generateWithRetry({
    buildPrompt: () => buildPrompt({ story, dict, pick }),
    buildRetryNote: () => "条件外でした。1文のみ・『構造：』で開始・10〜24文字・今日/本日/今/あなた禁止・説明/羅列なしで再出力。",
    validate: ({ raw }) => {
      const verdict = runAiTextPipeline({
        rawText: raw,
        preset: PRESETS.ig.tsukiji_structure,
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
    maxTokens: 160,
    context: { story, dict, pick },
  });

  if (result.ok) return { ok: true, text: result.text, model, pick, attempts: result.attempts, last_text: result.lastText };
  return {
    ok: false,
    error: result.error || "retry_exceeded",
    reason: result.reason,
    last_text: result.lastText ? String(result.lastText).trim() : "",
    attempts: result.attempts,
  };
}

module.exports = {
  generateIgTsukijiStructureText,
  buildTsukijiPrompt: buildPrompt,
};
