"use strict";

const { createChatCompletion } = require("../../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_COMMON,
  SORA_AI_USER_GUIDE_IG_MOON_EVENT_CAPTION,
  SORA_AI_USER_GUIDE_IG_MOON_EVENT_PLACEMENT,
  SORA_AI_USER_GUIDE_IG_MOON_EVENT_SUN_MOON,
  SORA_AI_USER_GUIDE_IG_MOON_EVENT_RESONANCE,
  SORA_AI_USER_GUIDE_IG_MOON_EVENT_AIR,
} = require("../../../../content/prompts/sora/sora_core");
const { formatDateYmdHm } = require("../../../../domain/astro/compute");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../../../domain/astro/compute");
const { moonSignAtIso } = require("../../../../domain/moon/sign");
const { runAiTextPipeline } = require("../../../ai_text");
const { PRESETS } = require("../../../ai_text/presets");
const { resolveMaxRetries } = require("./utils");

const BODY_LABELS = {
  sun: "太陽",
  moon: "月",
  mercury: "水星",
  venus: "金星",
  mars: "火星",
  jupiter: "木星",
  saturn: "土星",
  uranus: "天王星",
  neptune: "海王星",
  pluto: "冥王星",
  chiron: "キロン",
  lilith: "リリス",
  north_node: "北ノード",
  south_node: "南ノード",
};

const ASPECT_LABEL_MAP = {
  conjunction: "コンジャンクション",
  conj: "コンジャンクション",
  opposition: "オポジション",
  opp: "オポジション",
  square: "スクエア",
  trine: "トライン",
  sextile: "セクスタイル",
  quincunx: "クインカンクス",
  inconjunct: "クインカンクス",
  quintile: "クインタイル",
  biquintile: "バイ・クインタイル",
  novile: "ノヴィル",
  septile: "セプタイル",
  semisextile: "セミセクスタイル",
  semisquare: "セミスクエア",
  sesquisquare: "セスキスクエア",
};

function houseCoreLabel(dict, houseNo) {
  const n = Number(houseNo);
  if (!Number.isFinite(n)) return "";
  const house = dict?.HOUSES_V1?.houses?.[n];
  return house?.core || house?.sora_short || "";
}

function bodyLabel(key) {
  const k = String(key || "").toLowerCase();
  return BODY_LABELS[k] || key || "—";
}

function signLabelEnFromKey(key) {
  if (!key) return "";
  const map = {
    aries: "Aries",
    taurus: "Taurus",
    gemini: "Gemini",
    cancer: "Cancer",
    leo: "Leo",
    virgo: "Virgo",
    libra: "Libra",
    scorpio: "Scorpio",
    sagittarius: "Sagittarius",
    capricorn: "Capricorn",
    aquarius: "Aquarius",
    pisces: "Pisces",
  };
  return map[String(key).toLowerCase()] || "";
}

function bodyHouseLabel({ dict, story, bodyKey }) {
  const transit = story?.public?.transit_signs || {};
  const ascKey = story?.public?.house_focus?.asc_sign_key || "";
  const signKey = transit?.[bodyKey]?.sign_key || "";
  const ascIndex = signIndexFromKey(dict, ascKey);
  const signIndex = signIndexFromKey(dict, signKey);
  const houseNo = Number.isFinite(ascIndex) && Number.isFinite(signIndex)
    ? houseNumberForSignIndex(signIndex, ascIndex)
    : null;
  return Number.isFinite(Number(houseNo)) ? `第${houseNo}ハウス` : "—";
}

function buildMoonEventPlacementPrompt({ story, dict, event }) {
  const transit = story?.public?.transit_signs || {};
  const moonSign = transit?.moon?.sign_ja || event?.signJa || "—";

  const moonHouse = (() => {
    const ascKey = story?.public?.house_focus?.asc_sign_key || "";
    const moonKey = transit?.moon?.sign_key || "";
    const ascIndex = signIndexFromKey(dict, ascKey);
    const moonIndex = signIndexFromKey(dict, moonKey);
    const houseNo = Number.isFinite(ascIndex) && Number.isFinite(moonIndex)
      ? houseNumberForSignIndex(moonIndex, ascIndex)
      : null;
    const core = houseCoreLabel(dict, houseNo);
    return core || (Number.isFinite(Number(houseNo)) ? `第${houseNo}ハウス` : "—");
  })();

  const eventIso = event?.date instanceof Date ? event.date.toISOString() : story?.meta?.as_of || "";
  const moonPos = eventIso ? moonSignAtIso({ dict, iso: eventIso }) : null;
  const moonDeg = Number.isFinite(Number(moonPos?.degInSign))
    ? `${Number(moonPos.degInSign).toFixed(1)}°`
    : "—";

  return [
    SORA_AI_USER_GUIDE_IG_MOON_EVENT_PLACEMENT,
    "",
    "INPUT:",
    `MOON_SIGN: ${moonSign}`,
    `MOON_HOUSE: ${moonHouse}`,
    `MOON_DEG: ${moonDeg}`,
  ].join("\n");
}

function buildMoonEventSunMoonPrompt({ story, dict, event }) {
  const transit = story?.public?.transit_signs || {};
  const sunSign = transit?.sun?.sign_ja || "—";
  const moonSign = transit?.moon?.sign_ja || event?.signJa || "—";
  const relationLabel = event?.kind === "full" ? "オポジション" : "コンジャンクション";
  const relationDeg = event?.kind === "full" ? "180" : "0";
  const sunHouse = (() => {
    const ascKey = story?.public?.house_focus?.asc_sign_key || "";
    const sunKey = transit?.sun?.sign_key || "";
    const ascIndex = signIndexFromKey(dict, ascKey);
    const sunIndex = signIndexFromKey(dict, sunKey);
    const houseNo = Number.isFinite(ascIndex) && Number.isFinite(sunIndex)
      ? houseNumberForSignIndex(sunIndex, ascIndex)
      : null;
    const core = houseCoreLabel(dict, houseNo);
    return core || (Number.isFinite(Number(houseNo)) ? `第${houseNo}ハウス` : "—");
  })();
  const moonHouse = (() => {
    const ascKey = story?.public?.house_focus?.asc_sign_key || "";
    const moonKey = transit?.moon?.sign_key || "";
    const ascIndex = signIndexFromKey(dict, ascKey);
    const moonIndex = signIndexFromKey(dict, moonKey);
    const houseNo = Number.isFinite(ascIndex) && Number.isFinite(moonIndex)
      ? houseNumberForSignIndex(moonIndex, ascIndex)
      : null;
    const core = houseCoreLabel(dict, houseNo);
    return core || (Number.isFinite(Number(houseNo)) ? `第${houseNo}ハウス` : "—");
  })();
  const sunMoonAspect = `${relationLabel} ${relationDeg}°`;

  return [
    SORA_AI_USER_GUIDE_IG_MOON_EVENT_SUN_MOON,
    "",
    "INPUT:",
    `MOON_SIGN: ${moonSign}`,
    `SUN_SIGN: ${sunSign}`,
    `SUN_MOON_ASPECT: ${sunMoonAspect}`,
    `MOON_HOUSE: ${moonHouse}`,
    `SUN_HOUSE: ${sunHouse}`,
  ].join("\n");
}

function buildMoonEventResonancePrompt({ story, dict, aspect }) {
  const transit = story?.public?.transit_signs || {};
  const aKey = String(aspect?.a || "").toLowerCase();
  const bKey = String(aspect?.b || "").toLowerCase();
  const isMoonA = aKey === "moon";
  const moonKey = isMoonA ? aKey : bKey;
  const otherKey = isMoonA ? bKey : aKey;
  const moonSign = transit?.[moonKey]?.sign_ja || "—";
  const moonHouse = bodyHouseLabel({ dict, story, bodyKey: moonKey });
  const resonanceBody = bodyLabel(otherKey);
  const resonanceSign = transit?.[otherKey]?.sign_ja || "—";
  const resonanceHouse = bodyHouseLabel({ dict, story, bodyKey: otherKey });
  const aspectKey = String(aspect?.type || aspect?.aspect || "").toLowerCase();
  const aspectLabel = ASPECT_LABEL_MAP[aspectKey] || String(aspect?.type || aspect?.aspect || "").toUpperCase();
  const aspectDeg = Number.isFinite(Number(aspect?.aspect_deg)) ? Number(aspect.aspect_deg) : null;
  const aspectLabelFull = aspectDeg != null ? `${aspectLabel} ${aspectDeg}°` : aspectLabel;
  const orb = Number.isFinite(Number(aspect?.orb_deg)) ? `${Number(aspect.orb_deg).toFixed(2)}°` : "—";

  return [
    SORA_AI_USER_GUIDE_IG_MOON_EVENT_RESONANCE,
    "",
    "INPUT:",
    `MOON_SIGN: ${moonSign}`,
    `MOON_HOUSE: ${moonHouse}`,
    `RESONANCE_BODY: ${resonanceBody}`,
    `RESONANCE_SIGN: ${resonanceSign}`,
    `RESONANCE_HOUSE: ${resonanceHouse}`,
    `RESONANCE_ASPECT: ${aspectLabelFull}`,
    `RESONANCE_ORB: ${orb}`,
  ].join("\n");
}

function buildMoonEventAirPrompt({ story, dict, event, resonanceAspect }) {
  const transit = story?.public?.transit_signs || {};

  const moonSign = transit?.moon?.sign_ja || event?.signJa || "—";
  const moonKey = transit?.moon?.sign_key || "";
  const phaseName = event?.phaseName || (event?.kind === "new" ? "新月" : "満月");
  const moonName = event?.specialName || event?.moonName || "";
  const moonNameEn = event?.specialNameEn || event?.moonNameEn || "";
  const signEn = signLabelEnFromKey(moonKey);
  const eventName = event?.kind === "new"
    ? (signEn ? `New Moon in ${signEn}` : "New Moon")
    : (moonName || moonNameEn || "");

  return [
    SORA_AI_USER_GUIDE_IG_MOON_EVENT_AIR,
    "",
    "INPUT:",
    `PHASE_NAME: ${phaseName}`,
    `MOON_SIGN: ${moonSign}`,
    `EVENT_NAME: ${eventName || "—"}`,
  ].join("\n");
}

function buildMoonEventCaptionPrompt({ story, dict, event, resonanceAspect }) {
  const transit = story?.public?.transit_signs || {};
  const moonSign = transit?.moon?.sign_ja || event?.signJa || "—";
  const sunSign = transit?.sun?.sign_ja || "—";
  const phaseName = event?.phaseName || (event?.kind === "new" ? "新月" : "満月");
  const eventTime = event?.date instanceof Date ? formatDateYmdHm(event.date) : "";
  const eventName = [
    event?.label || event?.specialName || event?.moonName || phaseName || "—",
    event?.dateLabel || eventTime,
  ].filter(Boolean).join(" ");
  const relationLabel = event?.kind === "full" ? "オポジション" : "コンジャンクション";
  const relationDeg = event?.kind === "full" ? "180" : "0";
  const sunMoonAspect = `${relationLabel} ${relationDeg}°`;

  const sunHouse = (() => {
    const ascKey = story?.public?.house_focus?.asc_sign_key || "";
    const sunKey = transit?.sun?.sign_key || "";
    const ascIndex = signIndexFromKey(dict, ascKey);
    const sunIndex = signIndexFromKey(dict, sunKey);
    const houseNo = Number.isFinite(ascIndex) && Number.isFinite(sunIndex)
      ? houseNumberForSignIndex(sunIndex, ascIndex)
      : null;
    const core = houseCoreLabel(dict, houseNo);
    return core || (Number.isFinite(Number(houseNo)) ? `第${houseNo}ハウス` : "—");
  })();

  const moonHouse = (() => {
    const ascKey = story?.public?.house_focus?.asc_sign_key || "";
    const moonKey = transit?.moon?.sign_key || "";
    const ascIndex = signIndexFromKey(dict, ascKey);
    const moonIndex = signIndexFromKey(dict, moonKey);
    const houseNo = Number.isFinite(ascIndex) && Number.isFinite(moonIndex)
      ? houseNumberForSignIndex(moonIndex, ascIndex)
      : null;
    const core = houseCoreLabel(dict, houseNo);
    return core || (Number.isFinite(Number(houseNo)) ? `第${houseNo}ハウス` : "—");
  })();

  const aspect = resonanceAspect || null;
  const aKey = String(aspect?.a || "").toLowerCase();
  const bKey = String(aspect?.b || "").toLowerCase();
  const isMoonA = aKey === "moon";
  const otherKey = isMoonA ? bKey : aKey;
  const resonanceBody = aspect ? bodyLabel(otherKey) : "—";
  const resonanceSign = aspect ? (transit?.[otherKey]?.sign_ja || "—") : "—";
  const resonanceHouse = aspect ? bodyHouseLabel({ dict, story, bodyKey: otherKey }) : "—";
  const aspectKey = String(aspect?.type || aspect?.aspect || "").toLowerCase();
  const aspectLabel = ASPECT_LABEL_MAP[aspectKey] || (aspect ? String(aspect?.type || aspect?.aspect || "").toUpperCase() : "—");
  const aspectDeg = Number.isFinite(Number(aspect?.aspect_deg)) ? Number(aspect.aspect_deg) : null;
  const resonanceAspectLabel = aspect ? (aspectDeg != null ? `${aspectLabel} ${aspectDeg}°` : aspectLabel) : "—";
  const resonanceOrb = Number.isFinite(Number(aspect?.orb_deg)) ? `${Number(aspect.orb_deg).toFixed(2)}°` : "—";

  return [
    SORA_AI_USER_GUIDE_IG_MOON_EVENT_CAPTION,
    "",
    "INPUT:",
    `MOON_SIGN: ${moonSign}`,
    `SUN_SIGN: ${sunSign}`,
    `SUN_MOON_ASPECT: ${sunMoonAspect}`,
    `MOON_HOUSE: ${moonHouse}`,
    `SUN_HOUSE: ${sunHouse}`,
    `RESONANCE_BODY: ${resonanceBody}`,
    `RESONANCE_SIGN: ${resonanceSign}`,
    `RESONANCE_HOUSE: ${resonanceHouse}`,
    `RESONANCE_ASPECT: ${resonanceAspectLabel}`,
    `RESONANCE_ORB: ${resonanceOrb}`,
    `PHASE_NAME: ${phaseName}`,
    `EVENT_NAME: ${eventName}`,
  ].join("\n");
}

function validateWithPreset(preset) {
  return (text) => runAiTextPipeline({ rawText: text, preset });
}

async function generateWithPrompt({
  userPrompt,
  openai,
  maxRetries = 1,
  maxTokens = 160,
  temperature = 0.4,
  validate,
  fallbackText,
  returnLastTextOnFail = false,
} = {}) {
  const apiKey = openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY missing" };

  const baseUrl = openai?.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = openai?.model || process.env.OPENAI_MODEL || "gpt-4o";
  const resolvedMaxRetries = resolveMaxRetries({ maxRetries, openaiMaxRetries: openai?.maxRetries });

  let retryNote = "";
  let lastText = "";

  for (let attempt = 0; attempt <= resolvedMaxRetries; attempt++) {
    const prompt = userPrompt +
      (retryNote ? `\n\nRETRY_NOTE: ${retryNote}` : "") +
      (lastText ? `\n\nPREV_OUTPUT:\n${lastText}\n\n上の出力を条件に合わせて整えて再出力。` : "");

    const text = await createChatCompletion({
      apiKey,
      baseUrl,
      model,
      messages: [
        { role: "system", content: SORA_AI_SYSTEM_PROMPT_COMMON },
        { role: "user", content: prompt },
      ],
      temperature,
      maxTokens,
    });

    const verdict = validate(text);
    if (verdict.ok) return { ok: true, text: verdict.text, model };

    lastText = String(text || "").trim();
    retryNote = "前回は条件外でした。条件に合わせて整えて再出力。";
  }

  if (returnLastTextOnFail && lastText) {
    return { ok: true, text: lastText, model: openai?.model || process.env.OPENAI_MODEL || "gpt-4o", fallback: false };
  }
  return { ok: true, text: fallbackText || "", model: openai?.model || process.env.OPENAI_MODEL || "gpt-4o", fallback: true };
}

async function generateIgMoonEventPlacementText({ story, dict, event, openai, maxRetries = 1 } = {}) {
  const userPrompt = buildMoonEventPlacementPrompt({ story, dict, event });
  const fallbackText = "月のサインと度数が示す位置に月が置かれ、ハウスの輪郭が静かに浮かぶ。そこに照らされやすい領域が定まり、月の位置がどこに重心を置くかが見えてくる。視線はその方向へ向かいやすく、節目の重さが淡く残る。解釈ではなく、位置そのものの輪郭だけを静かに置く。";
  return generateWithPrompt({
    userPrompt,
    openai,
    maxRetries,
    maxTokens: 240,
    validate: validateWithPreset(PRESETS.ig.moon_event_placement),
    fallbackText,
  });
}

async function generateIgMoonEventSunMoonText({ story, dict, event, openai, maxRetries = 1 } = {}) {
  const userPrompt = buildMoonEventSunMoonPrompt({ story, dict, event });
  const fallbackText = "月と太陽が向き合う配置が、空の骨格として一本の軸を引く。サインの対比は張力になり、関係の距離が静かに立ち上がる。ハウスの位置がその軸を支え、配置の芯がどこに置かれるかが見えてくる。節目としての輪郭だけが残り、関係の骨格が空全体に広がる。";
  return generateWithPrompt({
    userPrompt,
    openai,
    maxRetries,
    maxTokens: 240,
    validate: validateWithPreset(PRESETS.ig.moon_event_sun_moon),
    fallbackText,
  });
}

async function generateIgMoonEventResonanceText({ story, dict, aspect, openai, maxRetries = 1 } = {}) {
  if (!aspect) return { ok: false, error: "aspect missing" };
  const userPrompt = buildMoonEventResonancePrompt({ story, dict, aspect });
  const fallbackText = "月と別の天体が角度でつながり、もう一本の線が空に伸びる。重なりや張りがその領域ににじみ、共鳴としての輪郭が見えてくる。交差の質感が空の奥に残り、配置のもう一面が立ち上がる。説明ではなく、交差の質感だけを静かに置く。";
  return generateWithPrompt({
    userPrompt,
    openai,
    maxRetries,
    maxTokens: 240,
    validate: validateWithPreset(PRESETS.ig.moon_event_resonance),
    fallbackText,
  });
}

async function generateIgMoonEventAirText({ story, dict, event, resonanceAspect, openai, maxRetries = 1 } = {}) {
  const userPrompt = buildMoonEventAirPrompt({ story, dict, event, resonanceAspect });
  return generateWithPrompt({
    userPrompt,
    openai,
    maxRetries,
    maxTokens: 420,
    validate: validateWithPreset(PRESETS.ig.moon_event_air),
    fallbackText: "",
    returnLastTextOnFail: true,
  });
}

async function generateIgMoonEventCaptionText({ story, dict, event, resonanceAspect, openai, maxRetries = 1 } = {}) {
  const userPrompt = buildMoonEventCaptionPrompt({ story, dict, event, resonanceAspect });
  return generateWithPrompt({
    userPrompt,
    openai,
    maxRetries,
    maxTokens: 320,
    validate: validateWithPreset(PRESETS.ig.moon_event_caption),
    fallbackText: "",
    returnLastTextOnFail: true,
  });
}

async function generateIgMoonEventAiOutputs({
  story,
  dict,
  event,
  resonanceAspect,
  openai,
  useAi = true,
  baseCaption = "",
} = {}) {
  const result = {
    summaryText: "",
    moonPlacementText: "",
    sunMoonText: "",
    moonResonanceText: "",
    caption: baseCaption || "",
  };

  if (!useAi) return result;

  const apiKey = String(openai?.apiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return result;

  const openaiClient = {
    apiKey,
    baseUrl: openai?.baseUrl,
    model: openai?.model,
    maxRetries: openai?.maxRetries,
  };

  try {
    const placementRes = await generateIgMoonEventPlacementText({
      story,
      dict,
      event,
      openai: openaiClient,
    });
    if (placementRes?.ok && placementRes.text) result.moonPlacementText = placementRes.text;

    const sunMoonRes = await generateIgMoonEventSunMoonText({
      story,
      dict,
      event,
      openai: openaiClient,
    });
    if (sunMoonRes?.ok && sunMoonRes.text) result.sunMoonText = sunMoonRes.text;

    if (resonanceAspect) {
      const resonanceRes = await generateIgMoonEventResonanceText({
        story,
        dict,
        aspect: resonanceAspect,
        openai: openaiClient,
      });
      if (resonanceRes?.ok && resonanceRes.text) result.moonResonanceText = resonanceRes.text;
    }

    const airRes = await generateIgMoonEventAirText({
      story,
      dict,
      event,
      resonanceAspect,
      openai: openaiClient,
    });
    if (airRes?.ok && airRes.text) result.summaryText = airRes.text;

    const captionRes = await generateIgMoonEventCaptionText({
      story,
      dict,
      event,
      resonanceAspect,
      openai: openaiClient,
    });
    if (captionRes?.ok && captionRes.text) result.caption = captionRes.text;
  } catch (_err) {
    result.summaryText = "";
  }

  return result;
}

module.exports = {
  buildMoonEventPlacementPrompt,
  buildMoonEventSunMoonPrompt,
  buildMoonEventResonancePrompt,
  buildMoonEventAirPrompt,
  buildMoonEventCaptionPrompt,
  generateIgMoonEventPlacementText,
  generateIgMoonEventSunMoonText,
  generateIgMoonEventResonanceText,
  generateIgMoonEventAirText,
  generateIgMoonEventCaptionText,
  generateIgMoonEventSummaryText: generateIgMoonEventAirText,
  generateIgMoonEventAiOutputs,
};
