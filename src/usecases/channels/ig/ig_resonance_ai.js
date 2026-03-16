"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_RESONANCE,
} = require("../../../content/prompts/sora_ai_prompts");
const { normalizeBodyKey } = require("../../../domain/canonical");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../../domain/astro_compute");
const { aspectInfo, signJa } = require("../../../presenters/format/format/line_common");

function safeText(x) {
  return String(x || "").trim();
}

function bodyLabelJa(dict, key) {
  if (!key) return "";
  const k = String(key).toLowerCase();
  return (
    dict?.PLANETS_V2?.bodies?.[k]?.label_ja ||
    dict?.POINTS_V1?.points?.[k]?.label_ja ||
    k
  );
}

function buildAspectLine({ story, dict }) {
  const aspect = story?.public?.sky_top?.[0] || story?.public?.sky_all?.[0] || null;
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
  const date = safeText(story?.meta?.date_local || story?.public?.date_local || "");
  const aspect = story?.public?.sky_top?.[0] || story?.public?.sky_all?.[0] || null;
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

function countSentences(text) {
  const parts = String(text || "")
    .split(/[。！？]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length;
}

function splitSentences(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const matches = raw.match(/[^。！？]+[。！？]/g) || [];
  let rest = raw.replace(/[^。！？]+[。！？]/g, "").trim();
  const out = matches.map((s) => s.trim());
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

function sentenceCount(text) {
  return splitSentences(text).length;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function validateText(text) {
  const t = normalizeText(text);
  if (!t) return { ok: false, reason: "empty" };
  if (t.includes("あなた")) return { ok: false, reason: "has_you" };
  if (t.length < 60) return { ok: false, reason: `too_short:${t.length}` };

  return { ok: true, text: t };
}

async function generateIgResonanceText({ story, dict, openai, maxRetries = 2 }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

    const verdict = validateText(text);
    if (verdict.ok) return { ok: true, text: verdict.text, model };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = `前回は条件外でした（${lastReason}）。「あなた」を避けて、もう少し長めに整えて再出力。`;
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText };
}

module.exports = {
  buildIgResonancePrompt,
  generateIgResonanceText,
};
