"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_TSUKIJI_STRUCTURE,
} = require("../../../../content/prompts/sora/sora_core");
const { normalizeBodyKey, normalizeAspectKey } = require("../../../../domain/canonical");
const { buildTsukijiRowsPublic, buildKinjitsuRowsPublic } = require("../../../../domain/tsukiji_public");
const { signJa, aspectInfo } = require("../../../../presenters/format/format/common");
const { bodyLabelJa } = require("../../../../presenters/shared/text/tokens");
const { runAiTextPipeline } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("./utils");
const { safeTrim } = require("../../../../utils/text_normalize");

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

  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= resolvedMaxRetries; attempt++) {
    const userPrompt = buildPrompt({ story, dict, pick }) +
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
      maxTokens: 160,
    });

    const verdict = runAiTextPipeline({
      rawText: text,
      preset: PRESETS.ig.tsukiji_structure,
    });
    if (verdict.ok) return { ok: true, text: verdict.text, model, pick };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = "条件外でした。1文のみ・『構造：』で開始・10〜24文字・今日/本日/今/あなた禁止・説明/羅列なしで再出力。";
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText };
}

module.exports = {
  generateIgTsukijiStructureText,
  buildTsukijiPrompt: buildPrompt,
};
