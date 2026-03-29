"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_MOON,
} = require("../../../content/prompts/sora/sora_ai_prompts");
const { buildTodayMoonInfo, buildMoonSignChangeState } = require("../../../domain/moon_info");
const { formatDateYmdHm } = require("../../../domain/astro_compute");

function safeText(x) {
  return String(x || "").trim();
}

function countSentences(text) {
  return String(text || "")
    .split(/[。！？]/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMoonFallback({ moonSign, phaseLabel } = {}) {
  const sign = safeText(moonSign) || "—";
  const phase = safeText(phaseLabel) || "静かな月相";
  return `${sign}の月が空にあり、${phase}の輪郭が静かに残ります。月は余白として、景色に溶け込むように置かれます。`;
}

function buildMoonChangeHint(change) {
  if (!change || !change.changeType) return "";
  if (change.changeType === "just_ingressed" && change?.sign?.label) {
    return `${change.sign.label}に入ったばかり`;
  }
  if (change.changeType === "imminent" && change?.next?.to?.label) {
    return `まもなく${change.next.to.label}へ移る`;
  }
  return "";
}

function buildIgMoonPrompt({ story, dict, asOfISO }) {
  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const change = buildMoonSignChangeState({ asOfISO, dict });
  const moonSign = safeText(info?.moonSign || "");
  const phaseLabel = safeText(info?.phase?.name || "");
  const moonChangeHint = safeText(buildMoonChangeHint(change));
  const nextChange = change?.next || null;
  const nextChangeText = nextChange?.date
    ? `${formatDateYmdHm(nextChange.date)}（${nextChange.to?.label || ""}へ）`
    : "";
  const nextChangeHours = Number.isFinite(Number(nextChange?.hoursAhead))
    ? Number(nextChange.hoursAhead).toFixed(1)
    : "";

  return [
    SORA_AI_USER_GUIDE_IG_MOON,
    "",
    "INPUT:",
    `MOON_SIGN: ${moonSign}`,
    `PHASE_LABEL: ${phaseLabel}`,
    `MOON_CHANGE_HINT: ${moonChangeHint}`,
    `NEXT_MOON_SIGN_CHANGE: ${safeText(nextChangeText)}`,
    `NEXT_MOON_SIGN_CHANGE_HOURS_AHEAD: ${safeText(nextChangeHours)}`,
  ].join("\n");
}

function validateMoonText(text, { allowNewFull } = {}) {
  const t = normalizeText(text);
  if (!t) return { ok: false, reason: "empty" };
  if (t.includes("あなた")) return { ok: false, reason: "has_you" };
  if (!allowNewFull && /(新月|満月)/.test(t)) return { ok: false, reason: "has_newfull" };
  const len = Array.from(t).length;
  if (len < 40) return { ok: false, reason: `too_short:${len}` };
  if (len > 220) return { ok: false, reason: `too_long:${len}` };
  return { ok: true, text: t, len };
}

async function generateIgMoonText({ story, dict, openai, maxRetries = 1, asOfISO }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const illumination = Number(info?.illumination || 0);
  const isNewNow = Number.isFinite(illumination) && illumination <= 0.02;
  const isFullNow = Number.isFinite(illumination) && illumination >= 0.98;
  const allowNewFull = isNewNow || isFullNow;
  const moonSign = safeText(info?.moonSign || "");
  const phaseLabel = safeText(info?.phase?.name || "");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userPrompt = buildIgMoonPrompt({ story, dict, asOfISO }) +
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

    const verdict = validateMoonText(text, { allowNewFull });
    if (verdict.ok) return { ok: true, text: verdict.text, model };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = "前回は条件外でした。「あなた」を避け、短すぎず長すぎない範囲で整えて再出力。";
  }

  const fallback = buildMoonFallback({ moonSign, phaseLabel });
  return { ok: true, text: fallback, model, fallback: true };
}

module.exports = {
  buildIgMoonPrompt,
  generateIgMoonText,
};
