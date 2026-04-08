"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const { SORA_AI_SYSTEM_PROMPT_COMMON } = require("../../../../content/prompts/sora/sora_core");
const { X_RESONANCE_USER_GUIDE } = require("../../../../content/prompts/sns/x/resonance");
const { pickPrimaryResonanceAspect } = require("../../../../domain/resonance");
const { refinePeakTime, calcOrbAt } = require("../../../../domain/aspect/proximity");
const { formatJstTimeLabel, toDateLocalJST, toDateTimeLocalJST } = require("../../../../utils/time");
const { generateXAiWithRetry, fallbackFactory } = require("./common");

function buildTimingMeta({ story, aspect }) {
  if (!aspect?.aKey || !aspect?.bKey || !Number.isFinite(Number(aspect?.aspectDeg))) return null;
  const asOfISO = String(story?.meta?.as_of || story?.meta?.asOfISO || "").trim() || new Date().toISOString();
  const dateLocal = String(story?.meta?.date_local || story?.public?.date_local || "").trim();
  const seedISO =
    aspect?.raw?.peak_at ||
    aspect?.raw?.peak_at_iso ||
    aspect?.raw?.peak_at_utc ||
    null;
  const peak = refinePeakTime({
    kind: "transit-transit",
    aKey: aspect.aKey,
    bKey: aspect.bKey,
    aspectDeg: Number(aspect.aspectDeg),
    seedISO,
    fallbackISO: asOfISO,
    windowMs: 24 * 3600 * 1000,
    stepMs: 60 * 1000,
  });
  if (!peak) return null;
  const peakIso = peak instanceof Date ? peak.toISOString() : null;
  const orb = peakIso
    ? calcOrbAt({
        kind: "transit-transit",
        aKey: aspect.aKey,
        bKey: aspect.bKey,
        aspectDeg: Number(aspect.aspectDeg),
        iso: peakIso,
      })
    : null;
  const exactAt = peak instanceof Date ? toDateTimeLocalJST(peak) : "";
  const exactAtJst = peak instanceof Date
    ? `${toDateLocalJST(peak)} ${formatJstTimeLabel(peak)} JST`.trim()
    : "";
  const exactDateLocal = peak instanceof Date ? toDateLocalJST(peak) : "";
  const minutesToExact = peak instanceof Date
    ? Math.round((peak.getTime() - new Date(asOfISO).getTime()) / 60000)
    : null;

  const peakOrb = Number.isFinite(Number(orb)) ? Number(orb) : null;
  const exactWindowMin = Number.isFinite(Number(process.env.X_RESONANCE_EXACT_WINDOW_MIN))
    ? Number(process.env.X_RESONANCE_EXACT_WINDOW_MIN)
    : 5;
  const exactOrbEps = Number.isFinite(Number(process.env.X_RESONANCE_EXACT_ORB_EPS))
    ? Number(process.env.X_RESONANCE_EXACT_ORB_EPS)
    : 0.01;
  const isExact = peakOrb != null && peakOrb <= exactOrbEps &&
    Number.isFinite(Number(minutesToExact)) && Math.abs(Number(minutesToExact)) <= exactWindowMin;

  const phase = isExact
    ? "exact"
    : (Number.isFinite(Number(minutesToExact)) && Number(minutesToExact) > 0 ? "approaching" : "separating");

  return {
    exactAt: exactAt || "",
    exactAtJst: exactAtJst || "",
    isExactToday: !!(dateLocal && exactDateLocal && dateLocal === exactDateLocal),
    minutesToExact: Number.isFinite(Number(minutesToExact)) ? Number(minutesToExact) : null,
    phase,
    peakOrb,
  };
}

function buildXResonancePrompt({ story, dict, aspect }) {
  if (!aspect) return "";
  const date = String(story?.meta?.date_local || story?.public?.date_local || "").trim();
  const degText = Number.isFinite(Number(aspect.aspectDeg)) ? `${Math.round(Number(aspect.aspectDeg))}°` : "";
  const orbText = Number.isFinite(Number(aspect.orb)) ? `${Number(aspect.orb).toFixed(2)}°` : "";
  const timing = buildTimingMeta({ story, aspect });

  const lines = [
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
  ];

  if (timing?.exactAt) lines.push(`EXACT_AT: ${timing.exactAt}`);
  if (timing?.exactAtJst) lines.push(`EXACT_AT_JST: ${timing.exactAtJst}`);
  if (typeof timing?.isExactToday === "boolean") lines.push(`IS_EXACT_TODAY: ${timing.isExactToday}`);
  if (Number.isFinite(Number(timing?.minutesToExact))) lines.push(`MINUTES_TO_EXACT: ${Number(timing.minutesToExact)}`);
  if (timing?.phase) lines.push(`PHASE: ${timing.phase}`);
  if (Number.isFinite(Number(timing?.peakOrb))) lines.push(`EXACT_ORB: ${Number(timing.peakOrb).toFixed(2)}°`);

  return lines.join("\n");
}

async function generateXResonanceAiText({
  story,
  dict,
  openai,
  maxRetries,
  aspect,
  resonanceMode,
  minChars,
  maxChars,
  maxTokens,
} = {}) {
  const picked = aspect || pickPrimaryResonanceAspect({ story, dict, resonanceMode });
  if (!picked) return { ok: false, error: "resonance_aspect_missing" };

  const minLen = Number.isFinite(Number(minChars)) ? Number(minChars) : 90;
  const maxLen = Number.isFinite(Number(maxChars)) ? Number(maxChars) : 145;
  const maxTk = Number.isFinite(Number(maxTokens)) ? Number(maxTokens) : 180;

  return generateXAiWithRetry({
    channel: "x_resonance",
    prompt: buildXResonancePrompt({ story, dict, aspect: picked }),
    minChars: minLen,
    maxChars: maxLen,
    maxTokens: maxTk,
    temperature: 0.5,
    allowFallback: false,
    maxRetries,
    openai,
    story,
    dict,
    systemPrompt: SORA_AI_SYSTEM_PROMPT_COMMON,
    createChatCompletion,
    retryNoteTemplate: "前回は条件外でした（${reason}）。90〜130文字で短く整えて再出力。",
    fallbackFactory,
    fallbackContext: { aspect: picked },
  }).then((res) => ({ ...res, aspect: picked }));
}

module.exports = {
  pickPrimaryResonanceAspect,
  buildXResonancePrompt,
  generateXResonanceAiText,
};
