"use strict";

const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../content/prompts/sora/sora_ai_prompts");
const { X_RESONANCE_USER_GUIDE } = require("../../../content/prompts/sns/x/x_resonance_prompts");
const { normalizeBodyKey } = require("../../../domain/canonical");
const { listWithOrb } = require("../../../domain/aspect_selection");
const { aspectInfo, signJa } = require("../../../presenters/format/format/line_common");
const { generateXAiWithRetry, fallbackFactory } = require("./x_ai_common");

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

async function generateXResonanceAiText({ story, dict, openai, maxRetries, aspect }) {
  const picked = aspect || pickPrimaryResonanceAspect({ story, dict });
  if (!picked) return { ok: false, error: "resonance_aspect_missing" };

  return generateXAiWithRetry({
    channel: "x_resonance",
    prompt: buildXResonancePrompt({ story, dict, aspect: picked }),
    minChars: 60,
    maxChars: 80,
    maxTokens: 140,
    temperature: 0.5,
    maxRetries,
    openai,
    story,
    dict,
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    createChatCompletion,
    retryNoteTemplate: "前回は条件外でした（${reason}）。2〜4行で短く整えて再出力。",
    fallbackFactory,
    fallbackContext: { aspect: picked },
  }).then((res) => ({ ...res, aspect: picked }));
}

module.exports = {
  pickPrimaryResonanceAspect,
  buildXResonancePrompt,
  generateXResonanceAiText,
};
