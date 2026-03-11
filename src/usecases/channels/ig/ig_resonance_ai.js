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
  const orb = Number.isFinite(Number(aspect?.orb_deg)) ? Number(aspect.orb_deg).toFixed(1) : "";

  const aspectLine = `${aName}（${aSign}） × ${bName}（${bSign}）`;
  const aspectLabelLine = `${aspectLabel} ${degLabel}`.trim();

  return { aspectLine, aspectLabel: aspectLabelLine, orb };
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
  const { aspectLine, aspectLabel, orb } = buildAspectLine({ story, dict });
  const { aHouse, bHouse } = buildResonanceHouseLines({ story, dict, aspect });

  return [
    SORA_AI_USER_GUIDE_IG_RESONANCE,
    "",
    "INPUT:",
    `DATE: ${date}`,
    `ASPECT: ${aspectLine}`,
    `ASPECT_LABEL: ${aspectLabel}`,
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

function countParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function normalizeParagraphs(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  // collapse 3+ newlines to 2
  const collapsed = raw.replace(/\n{3,}/g, "\n\n");
  // preserve paragraph break, remove single line breaks inside paragraphs
  const placeholder = "__PARA_BREAK__";
  const withPlaceholder = collapsed.replace(/\n{2,}/g, placeholder);
  const singleRemoved = withPlaceholder.replace(/\n/g, " ");
  return singleRemoved.replace(new RegExp(placeholder, "g"), "\n\n").trim();
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

function enforceTwoParagraphs(text) {
  let t = normalizeParagraphs(text);
  if (!t) return "";

  const paras = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length === 2) return t;

  const sentences = splitSentences(t);
  if (sentences.length >= 4) {
    const p1 = sentences.slice(0, 2).join("");
    const p2 = sentences.slice(2).join("");
    return `${p1}\n\n${p2}`.trim();
  }

  if (paras.length > 2) {
    const p1 = paras[0];
    const p2 = paras.slice(1).join(" ");
    return `${p1}\n\n${p2}`.trim();
  }

  return t;
}

function validateText(text) {
  const t = enforceTwoParagraphs(text);
  if (!t) return { ok: false, reason: "empty" };
  if (t.includes("あなた")) return { ok: false, reason: "has_you" };
  if (t.length > 150) return { ok: false, reason: `too_long:${t.length}` };
  if (t.length < 120) return { ok: false, reason: `too_short:${t.length}` };
  const sentences = sentenceCount(t);
  if (sentences !== 4) return { ok: false, reason: `bad_sentences:${sentences}` };
  const paragraphs = countParagraphs(t);
  if (paragraphs !== 2) return { ok: false, reason: `bad_paragraphs:${paragraphs}` };

  const parts = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const p1 = sentenceCount(parts[0] || "");
  const p2 = sentenceCount(parts[1] || "");
  if (p1 !== 2) return { ok: false, reason: `bad_para1_sentences:${p1}` };
  if (p2 !== 2) return { ok: false, reason: `bad_para2_sentences:${p2}` };

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
    retryNote = `前回は条件外でした（${lastReason}）。4文固定・2段落固定（1段落目2文＋2段落目2文）・120〜140字目安・150字以内・改行は段落間のみ・「あなた」禁止で再出力。`;
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText };
}

module.exports = {
  buildIgResonancePrompt,
  generateIgResonanceText,
};
