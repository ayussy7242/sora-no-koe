"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_SKY_OVERVIEW,
} = require("../../../content/prompts/sora/sora_ai_prompts");
const { signJa } = require("../../../presenters/format/format/common");

function safeText(x) {
  return String(x || "").trim();
}

function countChars(text) {
  return Array.from(String(text || "")).length;
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

function buildSignCountsLine({ story, dict }) {
  const transit = story?.public?.transit_signs || {};
  const counts = {};
  Object.values(transit).forEach((item) => {
    const signKey = item?.sign_key;
    const label = item?.sign_ja || signJa(dict, signKey || "");
    if (!label) return;
    counts[label] = (counts[label] || 0) + 1;
  });
  const entries = Object.entries(counts)
    .map(([sign, count]) => `${sign}=${count}`)
    .sort();
  return entries.length ? entries.join(", ") : "none";
}

function buildElementCountsLine(story) {
  const counts = story?.public?.sky_strata?.element_count || {};
  const labels = { fire: "火", earth: "地", air: "風", water: "水", mixed: "混合" };
  const entries = Object.entries(counts)
    .map(([key, count]) => `${labels[key] || key}=${Number(count || 0)}`)
    .sort();
  return entries.length ? entries.join(", ") : "none";
}

function buildHouseFocusLine(story) {
  const focus = story?.public?.house_focus || {};
  const top = focus?.top?.[0];
  if (!top) return "none";
  const total = Number(focus?.total || 0);
  const count = Number(top?.count || 0);
  return `第${top.house_no}ハウス（${count}/${total}）`;
}

function buildIgSkyOverviewPrompt({ story, dict }) {
  const date = safeText(story?.meta?.date_local || story?.public?.date_local || "");
  const signCounts = buildSignCountsLine({ story, dict });
  const elementCounts = buildElementCountsLine(story);
  const houseFocus = buildHouseFocusLine(story);

  return [
    SORA_AI_USER_GUIDE_IG_SKY_OVERVIEW,
    "",
    "INPUT:",
    `DATE: ${date}`,
    `TRANSIT_SIGNS: ${signCounts}`,
    `SKY_STRATA.element_count: ${elementCounts}`,
    `HOUSE_FOCUS.top: ${houseFocus}`,
  ].join("\n");
}

function validateSkyOverview(text) {
  const t = normalizeText(text);
  if (!t) return { ok: false, reason: "empty" };
  if (t.includes("あなた")) return { ok: false, reason: "has_you" };
  const len = countChars(t);
  if (len < 80) return { ok: false, reason: `too_short:${len}` };
  return { ok: true, text: t, len };
}

async function generateIgSkyOverviewText({ story, dict, openai, maxRetries = 2 }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userPrompt = buildIgSkyOverviewPrompt({ story, dict }) +
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
      temperature: 0.45,
      maxTokens: 320,
    });

    const verdict = validateSkyOverview(text);
    if (verdict.ok) return { ok: true, text: verdict.text, model };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = "前回は条件外でした。「あなた」を避けて、もう少し長めに整えて再出力。";
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText };
}

module.exports = {
  buildIgSkyOverviewPrompt,
  generateIgSkyOverviewText,
};
