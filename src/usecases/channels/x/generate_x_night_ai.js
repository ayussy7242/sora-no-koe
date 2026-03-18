"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../content/prompts/sora/sora_ai_prompts");
const { X_NIGHT_USER_GUIDE } = require("../../../content/prompts/sns/x/x_night_prompts");
const { signJa } = require("../../../presenters/format/format/line_common");
const { calcTransitLon, norm360 } = require("../../../domain/astro_compute");
const { validateXAiText } = require("./x_ai_common");

function safeText(x) {
  return String(x || "").trim();
}

function buildElementCount(story) {
  const counts = story?.public?.sky_strata?.element_count || story?.meta?.sky_strata?.element_count || {};
  return {
    fire: Number(counts.fire || 0),
    earth: Number(counts.earth || 0),
    air: Number(counts.air || 0),
    water: Number(counts.water || 0),
  };
}

function buildModalityCount(story) {
  const counts = story?.public?.sky_strata?.modality_count || story?.meta?.sky_strata?.modality_count || {};
  return {
    cardinal: Number(counts.cardinal || 0),
    fixed: Number(counts.fixed || 0),
    mutable: Number(counts.mutable || 0),
  };
}

function buildTransitSigns({ story, dict }) {
  const transit = story?.public?.transit_signs || {};
  const bodyOrder = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ];
  const out = {};
  bodyOrder.forEach((k) => {
    const signKey = transit?.[k]?.sign_key || "";
    const signLabel = transit?.[k]?.sign_ja || signJa(dict, signKey || "") || "";
    if (signLabel) out[k] = signLabel;
  });
  return out;
}

function signKeyFromLon(dict, lon) {
  if (!Number.isFinite(Number(lon))) return null;
  const order = dict?.SIGNS_V2?.order || dict?.SIGNS?.order || [
    "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
  ];
  const idx = Math.floor(norm360(Number(lon)) / 30);
  return order[idx] || null;
}

function moonSignAtIso({ dict, iso }) {
  const lon = calcTransitLon("moon", iso);
  const key = signKeyFromLon(dict, lon);
  const label = key ? (signJa(dict, key) || "") : "";
  return { key, label };
}

function findNextMoonSignChange({ dict, asOfISO, maxHours = 72, stepMinutes = 60 }) {
  const base = new Date(asOfISO || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  const current = moonSignAtIso({ dict, iso: base.toISOString() });
  if (!current?.key) return null;

  const maxSteps = Math.ceil((maxHours * 60) / stepMinutes);
  let prev = current;
  for (let i = 1; i <= maxSteps; i++) {
    const t = new Date(base.getTime() + i * stepMinutes * 60000).toISOString();
    const next = moonSignAtIso({ dict, iso: t });
    if (next?.key && next.key !== prev.key) {
      return { from: current, to: next, hoursAhead: i * (stepMinutes / 60) };
    }
    prev = next;
  }
  return null;
}

function buildNextTransitHints(story, dict) {
  const asOfISO = story?.meta?.as_of || new Date().toISOString();
  const current = moonSignAtIso({ dict, iso: asOfISO });
  const next = findNextMoonSignChange({ dict, asOfISO });

  if (next?.to?.label) {
    return `月はこのあと${next.to.label}へ移る`;
  }
  if (current?.label) {
    return `月はこのまま${current.label}を進む`;
  }
  return "";
}

function buildXNightPrompt({ story, dict }) {
  const transitSigns = buildTransitSigns({ story, dict });
  const elementCount = buildElementCount(story);
  const modalityCount = buildModalityCount(story);
  const sun = transitSigns.sun || "";
  const moon = transitSigns.moon || "";
  const nextHints = buildNextTransitHints(story, dict);

  return [
    X_NIGHT_USER_GUIDE,
    "",
    "INPUT:",
    `SUN_SIGN: ${safeText(sun)}`,
    `MOON_SIGN: ${safeText(moon)}`,
    `TRANSIT_SIGNS: ${JSON.stringify(transitSigns)}`,
    `SKY_STRATA.element_count: ${JSON.stringify(elementCount)}`,
    `SKY_STRATA.modality_count: ${JSON.stringify(modalityCount)}`,
    `NEXT_TRANSIT_HINTS: ${safeText(nextHints)}`,
  ].join("\n");
}

function validateText(text) {
  return validateXAiText(text);
}

async function generateXNightAiText({ story, dict, openai, maxRetries = 1 }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userPrompt = buildXNightPrompt({ story, dict }) +
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
      maxTokens: 180,
    });

    const verdict = validateText(text);
    if (verdict.ok) return { ok: true, text: verdict.text, model };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = `前回は条件外でした（${lastReason}）。助言禁止・短文で整えて再出力。`;
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText };
}

module.exports = {
  buildXNightPrompt,
  generateXNightAiText,
};
