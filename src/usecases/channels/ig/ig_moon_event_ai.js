"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_MOON_EVENT,
} = require("../../../content/prompts/sora/sora_ai_prompts");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../../domain/astro_compute");

function safeText(x) {
  return String(x || "").trim();
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function safeCount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatElementCounts(elementCount = {}) {
  const fire = safeCount(elementCount.fire);
  const earth = safeCount(elementCount.earth);
  const air = safeCount(elementCount.air);
  const water = safeCount(elementCount.water);
  return `火${fire} 地${earth} 風${air} 水${water}`;
}

function formatModeCounts(modeCount = {}) {
  const cardinal = safeCount(modeCount.cardinal);
  const fixed = safeCount(modeCount.fixed);
  const mutable = safeCount(modeCount.mutable);
  return `活動${cardinal} 不動${fixed} 柔軟${mutable}`;
}

function pickAirFeel(elementCount = {}, modeCount = {}) {
  const fire = safeCount(elementCount.fire);
  const earth = safeCount(elementCount.earth);
  const air = safeCount(elementCount.air);
  const water = safeCount(elementCount.water);
  const light = fire + air;
  const heavy = earth + water;
  let temp = "";
  if (light - heavy >= 2) temp = "軽い";
  if (heavy - light >= 2) temp = "重い";

  const cardinal = safeCount(modeCount.cardinal);
  const fixed = safeCount(modeCount.fixed);
  const mutable = safeCount(modeCount.mutable);
  let motion = "流れる";
  if (cardinal >= fixed && cardinal >= mutable) motion = "動く";
  if (fixed >= cardinal && fixed >= mutable) motion = "留まる";

  if (!temp) return motion;
  return `${temp}・${motion}`;
}

function houseCoreLabel(dict, houseNo) {
  const n = Number(houseNo);
  if (!Number.isFinite(n)) return "";
  const house = dict?.HOUSES_V1?.houses?.[n];
  return house?.core || house?.sora_short || "";
}

function buildMoonEventSummaryPrompt({ story, dict, event }) {
  const transit = story?.public?.transit_signs || {};
  const skyStrata = story?.public?.sky_strata || {};
  const elementCount = skyStrata.element_count || {};
  const modeCount = skyStrata.mode_count || skyStrata.modality_count || {};

  const sunSign = transit?.sun?.sign_ja || "—";
  const moonSign = transit?.moon?.sign_ja || event?.signJa || "—";

  const ascKey = story?.public?.house_focus?.asc_sign_key || "";
  const moonKey = transit?.moon?.sign_key || "";
  const ascIndex = signIndexFromKey(dict, ascKey);
  const moonIndex = signIndexFromKey(dict, moonKey);
  const houseNo = Number.isFinite(ascIndex) && Number.isFinite(moonIndex)
    ? houseNumberForSignIndex(moonIndex, ascIndex)
    : null;
  const houseCore = houseCoreLabel(dict, houseNo);

  const relationLabel = event?.kind === "full" ? "オポジション" : "コンジャンクション";
  const eventLabel = safeText(event?.label || event?.phaseName || "");

  return [
    SORA_AI_USER_GUIDE_IG_MOON_EVENT,
    "",
    "INPUT:",
    `EVENT_LABEL: ${eventLabel}`,
    `SUN_SIGN: ${sunSign}`,
    `MOON_SIGN: ${moonSign}`,
    `MOON_HOUSE: ${houseCore || (Number.isFinite(Number(houseNo)) ? `第${houseNo}ハウス` : "—")}`,
    `ELEMENT_COUNTS: ${formatElementCounts(elementCount)}`,
    `MODE_COUNTS: ${formatModeCounts(modeCount)}`,
    `AIR_FEEL: ${pickAirFeel(elementCount, modeCount)}`,
    `RELATION_LABEL: ${relationLabel}`,
  ].join("\n");
}

function buildFallbackSummary({ event, elementCount = {}, modeCount = {} }) {
  const eventLabel = safeText(event?.phaseName || event?.label || "");
  const air = pickAirFeel(elementCount, modeCount);
  return `${eventLabel}の空は、${air}温度が残る。`;
}

function validateSummaryText(text, { eventKind }) {
  const t = normalizeText(text);
  if (!t) return { ok: false, reason: "empty" };
  if (t.includes("あなた")) return { ok: false, reason: "has_you" };
  if (eventKind === "full" && !t.includes("満月")) return { ok: false, reason: "missing_full" };
  if (eventKind === "new" && !t.includes("新月")) return { ok: false, reason: "missing_new" };
  const len = Array.from(t).length;
  if (len < 16) return { ok: false, reason: `too_short:${len}` };
  if (len > 70) return { ok: false, reason: `too_long:${len}` };
  return { ok: true, text: t, len };
}

async function generateIgMoonEventSummaryText({ story, dict, event, openai, maxRetries = 1 } = {}) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";

  const skyStrata = story?.public?.sky_strata || {};
  const elementCount = skyStrata.element_count || {};
  const modeCount = skyStrata.mode_count || skyStrata.modality_count || {};

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userPrompt = buildMoonEventSummaryPrompt({ story, dict, event }) +
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
      maxTokens: 120,
    });

    const verdict = validateSummaryText(text, { eventKind: event?.kind });
    if (verdict.ok) return { ok: true, text: verdict.text, model };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = "前回は条件外でした。短く、1文で整えて再出力。";
  }

  return {
    ok: true,
    text: buildFallbackSummary({ event, elementCount, modeCount }),
    model,
    fallback: true,
  };
}

module.exports = {
  buildMoonEventSummaryPrompt,
  generateIgMoonEventSummaryText,
};
