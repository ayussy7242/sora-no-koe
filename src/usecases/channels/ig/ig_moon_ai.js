"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_MOON,
} = require("../../../content/prompts/sora_ai_prompts");
const { buildTodayMoonInfo } = require("../../../domain/moon_info");

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

function buildIgMoonPrompt({ story, dict, asOfISO }) {
  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const moonSign = safeText(info?.moonSign || "");
  const phaseLabel = safeText(info?.phase?.name || "");

  return [
    SORA_AI_USER_GUIDE_IG_MOON,
    "",
    "INPUT:",
    `MOON_SIGN: ${moonSign}`,
    `PHASE_LABEL: ${phaseLabel}`,
  ].join("\n");
}

function validateMoonText(text, { allowNewFull } = {}) {
  const t = normalizeText(text);
  if (!t) return { ok: false, reason: "empty" };
  if (t.includes("あなた")) return { ok: false, reason: "has_you" };
  if (!allowNewFull && /(新月|満月)/.test(t)) return { ok: false, reason: "has_newfull" };
  const sentences = countSentences(t);
  if (sentences !== 2) return { ok: false, reason: `sentences:${sentences}` };
  const len = Array.from(t).length;
  if (len < 70) return { ok: false, reason: `too_short:${len}` };
  if (len > 120) return { ok: false, reason: `too_long:${len}` };
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
    retryNote = "前回は条件外でした。「あなた」を避け、2文・70〜120文字を目安に整えて再出力。";
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText };
}

module.exports = {
  buildIgMoonPrompt,
  generateIgMoonText,
};
