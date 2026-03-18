"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../content/prompts/sora/sora_ai_prompts");
const { X_RESONANCE_USER_GUIDE } = require("../../../content/prompts/sns/x/x_resonance_prompts");
const { normalizeBodyKey } = require("../../../domain/canonical");
const { listWithOrb } = require("../../../domain/aspect_selection");
const { aspectInfo, signJa } = require("../../../presenters/format/format/line_common");
const { validateXAiText } = require("./x_ai_common");

function bodyLabelJa(dict, key) {
  if (!key) return "";
  const k = String(key).toLowerCase();
  return (
    dict?.PLANETS_V2?.bodies?.[k]?.label_ja ||
    dict?.POINTS_V1?.points?.[k]?.label_ja ||
    k
  );
}

function pickPrimaryResonanceAspect({ story, dict, maxOrbDeg }) {
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const allowed = new Set([
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ]);
  const picked = listWithOrb(skyAll)
    .filter((row) => {
      const aKey = normalizeBodyKey(row?.a || "");
      const bKey = normalizeBodyKey(row?.b || "");
      return allowed.has(aKey) && allowed.has(bKey);
    })
    .filter((row) => {
      if (!Number.isFinite(Number(maxOrbDeg))) return true;
      const orb = Number(row?.orb_deg);
      return Number.isFinite(orb) && orb <= Number(maxOrbDeg);
    })
    .sort((a, b) => Number(a?.orb_deg) - Number(b?.orb_deg))[0];

  if (!picked) return null;

  const aKey = normalizeBodyKey(picked?.a || "");
  const bKey = normalizeBodyKey(picked?.b || "");
  const aLabel = bodyLabelJa(dict, aKey);
  const bLabel = bodyLabelJa(dict, bKey);
  const aSign = picked?.a_sign_ja || signJa(dict, picked?.a_sign_key || "");
  const bSign = picked?.b_sign_ja || signJa(dict, picked?.b_sign_key || "");
  const aspect = aspectInfo(dict, picked?.type || picked?.aspect || picked?.aspT, picked?.aspect_deg);
  const aspectLabel = aspect?.label_ja || String(picked?.type || picked?.aspect || "");
  const deg = Number.isFinite(Number(picked?.aspect_deg))
    ? Number(picked.aspect_deg)
    : Number.isFinite(Number(aspect?.deg))
      ? Number(aspect.deg)
      : null;
  const orb = Number.isFinite(Number(picked?.orb_deg)) ? Number(picked.orb_deg) : null;

  return {
    raw: picked,
    aKey,
    bKey,
    aLabel,
    bLabel,
    aSign,
    bSign,
    aspectLabel,
    aspectDeg: deg,
    orb,
  };
}

function buildXResonancePrompt({ story, dict, aspect }) {
  if (!aspect) return "";
  const date = String(story?.meta?.date_local || story?.public?.date_local || "").trim();
  const degText = Number.isFinite(Number(aspect.aspectDeg)) ? `${Math.round(Number(aspect.aspectDeg))}°` : "";
  const orbText = Number.isFinite(Number(aspect.orb)) ? `${Number(aspect.orb).toFixed(2)}°` : "";

  return [
    X_RESONANCE_USER_GUIDE,
    "",
    "INPUT:",
    `DATE: ${date}`,
    `A_BODY: ${aspect.aLabel}`,
    `B_BODY: ${aspect.bLabel}`,
    `A_SIGN: ${aspect.aSign || "—"}`,
    `B_SIGN: ${aspect.bSign || "—"}`,
    `ASPECT: ${aspect.aspectLabel} ${degText}`.trim(),
    `ORB: ${orbText}`,
  ].join("\n");
}

function validateText(text) {
  return validateXAiText(text);
}

async function generateXResonanceAiText({ story, dict, openai, maxRetries = 1, aspect }) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const picked = aspect || pickPrimaryResonanceAspect({ story, dict });
  if (!picked) return { ok: false, error: "resonance_aspect_missing" };

  let retryNote = "";
  let lastReason = "";
  let lastText = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const userPrompt = buildXResonancePrompt({ story, dict, aspect: picked }) +
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
      maxTokens: 140,
    });

    const verdict = validateText(text);
    if (verdict.ok) return { ok: true, text: verdict.text, model, aspect: picked };

    lastReason = verdict.reason || "";
    lastText = String(text || "").trim();
    retryNote = `前回は条件外でした（${lastReason}）。2〜4行で短く整えて再出力。`;
  }

  return { ok: false, error: "retry_exceeded", reason: lastReason, last_text: lastText, aspect: picked };
}

module.exports = {
  pickPrimaryResonanceAspect,
  buildXResonancePrompt,
  generateXResonanceAiText,
};
