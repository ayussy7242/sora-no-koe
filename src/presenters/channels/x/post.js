"use strict";

/**
 * channels/x.js
 * - X: morning / night / resonance / moon_event / monthly
 */

const { buildRetrogradeMap } = require("../../../domain/astro/retrograde");
const { normalizeBodyKey } = require("../../../domain/canonical");
const { formatDateLabel, glyphForBody, signJa, aspectInfo, formatElementModalityLines } = require("../../format/format/line_common");
const { toDateLocalJST } = require("../../../utils/time_utils");
const { pickPrimaryResonanceAspect } = require("../../../usecases/channels/x/generate_x_resonance_ai");
const { detectMoonEvent } = require("../../../usecases/channels/x/generate_x_moon_event_ai");
const { buildMonthlyContext } = require("../../../usecases/channels/x/generate_x_monthly_ai");

const SEP = "────────";

function joinLines(lines = []) {
  return lines.filter((v) => v !== undefined && v !== null).join("\n").trim();
}

function pickDominantSignLabel(story, deps = {}) {
  const dict = deps?.dict || require("../../../content/dict");
  const transitSigns = story?.public?.transit_signs || {};
  const bodyOrder = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ];

  const counts = {};
  bodyOrder.forEach((key) => {
    const signKey = transitSigns?.[key]?.sign_key || "";
    const signLabel = transitSigns?.[key]?.sign_ja || signJa(dict, signKey || "") || "";
    if (!signLabel) return;
    counts[signLabel] = (counts[signLabel] || 0) + 1;
  });

  let top = "";
  let topCount = 0;
  Object.entries(counts).forEach(([label, count]) => {
    if (count > topCount) {
      top = label;
      topCount = count;
    }
  });
  return top || "";
}

function formatJstTimeLabel(asOfISO) {
  if (!asOfISO) return "-";
  const base = new Date(asOfISO);
  if (Number.isNaN(base.getTime())) return "-";
  const jst = new Date(base.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatPeakTimeLabel(iso) {
  if (!iso) return "";
  const t = formatJstTimeLabel(iso);
  return t && t !== "-" ? t : "";
}

function buildMainLogLines(story, deps = {}) {
  const dict = deps?.dict || require("../../../content/dict");
  const includeHeader = deps?.includeHeader !== false;
  const includePoints = deps?.includePoints !== false;
  const skipGlyphFor = Array.isArray(deps?.skipGlyphFor) ? deps.skipGlyphFor : [];
  const skipGlyphSet = new Set(skipGlyphFor.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean));
  const dateLabel = formatDateLabel(story?.meta?.date_local);
  const asOfISO = story?.meta?.as_of || null;

  const pub = story?.public || {};
  const transitSigns = pub.transit_signs || {};

  const bodyOrder = includePoints
    ? [
      "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","lilith","chiron",
    ]
    : [
      "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
    ];

  const retroMap = buildRetrogradeMap(asOfISO, bodyOrder);

  const renderBodyLine = (k) => {
    let signKey = transitSigns?.[k]?.sign_key || "";
    let signLabel = transitSigns?.[k]?.sign_ja || "";
    if (!signLabel && signKey) signLabel = signJa(dict, signKey || "");
    signLabel = String(signLabel || "").trim();
    if (!signLabel) return "";

    const glyph = skipGlyphSet.has(String(k || "").toLowerCase()) ? "" : glyphForBody(k);
    const bodyJa = (dict?.PLANETS_V2?.bodies?.[k]?.label_ja || dict?.POINTS_V1?.points?.[k]?.label_ja || k).toString();
    const retro = retroMap[k] ? "(R)" : "";
    const bodyText = `${bodyJa}${retro}`;
    const prefix = glyph ? `${glyph} ` : "";
    return `${prefix}${bodyText}｜${signLabel}`;
  };

  const bodyLines = bodyOrder.map(renderBodyLine).filter(Boolean);
  const distLines = formatElementModalityLines(pub.sky_strata || story?.meta?.sky_strata || null);

  const lines = [];
  if (includeHeader) lines.push(`🌌 きょうのそら｜${dateLabel}`, "");
  lines.push(...bodyLines);
  if (distLines.length) lines.push("", ...distLines);

  return lines;
}

function resolveResonanceRaw(story, dict, opts = {}) {
  const raw = story?.meta?.x_source?.resonance_aspect || null;
  if (raw) return raw;
  if (opts?.fallback === false) return null;
  const picked = pickPrimaryResonanceAspect({ story, dict });
  return picked?.raw || null;
}

function buildResonanceDisplay(story, deps = {}) {
  const dict = deps?.dict || require("../../../content/dict");
  const raw = resolveResonanceRaw(story, dict, { fallback: false });
  if (!raw) return null;

  const aKey = normalizeBodyKey(raw?.a || "");
  const bKey = normalizeBodyKey(raw?.b || "");
  const aLabel = dict?.PLANETS_V2?.bodies?.[aKey]?.label_ja || dict?.POINTS_V1?.points?.[aKey]?.label_ja || aKey;
  const bLabel = dict?.PLANETS_V2?.bodies?.[bKey]?.label_ja || dict?.POINTS_V1?.points?.[bKey]?.label_ja || bKey;
  const aSign = raw?.a_sign_ja || signJa(dict, raw?.a_sign_key || "");
  const bSign = raw?.b_sign_ja || signJa(dict, raw?.b_sign_key || "");
  const aGlyph = glyphForBody(aKey);
  const bGlyph = glyphForBody(bKey);
  const aSignText = aSign ? `（${aSign}）` : "";
  const bSignText = bSign ? `（${bSign}）` : "";

  const aspect = aspectInfo(dict, raw?.type || raw?.aspT || raw?.aspect, raw?.aspect_deg);
  const aspectLabel = aspect?.label_ja || "";
  const aspectDeg = Number.isFinite(Number(raw?.aspect_deg))
    ? Number(raw.aspect_deg)
    : Number.isFinite(Number(aspect?.deg))
      ? Number(aspect.deg)
      : null;
  const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
  const orb = Number.isFinite(Number(raw?.orb_deg)) ? Number(raw.orb_deg) : null;
  const orbText = orb != null ? `${orb.toFixed(1)}` : "";
  const peakText = formatPeakTimeLabel(raw?.peak_at || raw?.peak_at_iso || raw?.peak_at_utc || "");

  const infoParts = [];
  if (aspectLabel) infoParts.push(aspectLabel);
  if (degText) infoParts.push(degText);
  if (orbText) infoParts.push(`orb ${orbText}°`);
  const infoLine = infoParts.join("｜");

  const lines = [
    `${aGlyph ? `${aGlyph} ` : ""}${aLabel}${aSignText}`,
    "×",
    `${bGlyph ? `${bGlyph} ` : ""}${bLabel}${bSignText}`,
  ];
  if (infoLine) lines.push(infoLine);
  if (peakText) {
    lines.push(`ピーク｜${peakText}`);
  }
  return lines;
}

function renderX(story, deps = {}) {
  const lines = buildMainLogLines(story, { ...deps, includeHeader: true });
  return joinLines(lines);
}

function renderXMorning(story, deps = {}) {
  return renderXMorningMain(story, deps);
}

function renderXMorningMain(story, deps = {}) {
  const { formatXAiText } = require("../../../usecases/channels/x/x_ai_common");
  const rawAi = String(story?.meta?.x_ai?.morning || "").trim();
  const ai = rawAi ? formatXAiText(rawAi) : "";
  const asOfISO = story?.meta?.as_of || null;
  const dateLocal = story?.meta?.date_local || story?.public?.date_local ||
    (asOfISO ? toDateLocalJST(new Date(asOfISO)) : "");
  const dateLabel = formatDateLabel(dateLocal);
  const timeLabel = formatJstTimeLabel(asOfISO);
  const header = `🌌 今日の空｜${[dateLabel, timeLabel].filter(Boolean).join(" ")}`.trim();

  const baseLines = [header];
  if (ai) baseLines.push("", ai);
  return joinLines(baseLines);
}

function renderXMorningLog(story, deps = {}) {
  const dict = deps?.dict || require("../../../content/dict");
  const logLines = buildMainLogLines(story, {
    ...deps,
    includeHeader: false,
    includePoints: true,
    skipGlyphFor: ["lilith", "chiron"],
  });

  const baseLines = ["🌌 星の配置", "", joinLines(logLines)];
  return joinLines(baseLines);
}

function renderXNight(story, deps = {}) {
  const { formatXAiText } = require("../../../usecases/channels/x/x_ai_common");
  const rawAi = String(story?.meta?.x_ai?.night || "").trim();
  const ai = rawAi ? formatXAiText(rawAi) : "";
  const asOfISO = story?.meta?.as_of || null;
  const dateLocal = story?.meta?.date_local || story?.public?.date_local ||
    (asOfISO ? toDateLocalJST(new Date(asOfISO)) : "");
  const dateLabel = formatDateLabel(dateLocal);
  const timeLabel = formatJstTimeLabel(asOfISO);
  const header = `🌙 ${[dateLabel, timeLabel].filter(Boolean).join(" ")}｜夜の空`.trim();

  const lines = [header];
  if (ai) lines.push("", ai);
  return joinLines(lines);
}

function renderXResonance(story, deps = {}) {
  const { formatXAiText } = require("../../../usecases/channels/x/x_ai_common");
  const rawAi = String(story?.meta?.x_ai?.resonance || "").trim();
  const ai = rawAi ? formatXAiText(rawAi) : "";
  const dict = deps?.dict || require("../../../content/dict");
  const raw = resolveResonanceRaw(story, dict, { fallback: false });
  const display = buildResonanceDisplay(story, { ...deps, dict });
  if (!display) return "";

  const lines = ["🌌 共鳴の空"];
  if (ai) lines.push("", ai);
  lines.push("", SEP, "", ...display);
  return joinLines(lines);
}

function resolveMoonEventDisplay(story, dict) {
  const stored = story?.meta?.x_source?.moon_event || null;
  if (stored) return stored;
  const detected = detectMoonEvent({ story, dict, asOfISO: story?.meta?.as_of });
  if (detected) return detected;
  return null;
}

function renderXMoonEvent(story, deps = {}) {
  const dict = deps?.dict || require("../../../content/dict");
  const event = resolveMoonEventDisplay(story, dict);
  if (!event) return "";
  const ai = String(story?.meta?.x_ai?.moon_event || "").trim();
  const lines = [event.line1, event.line2].filter(Boolean);
  if (ai) lines.push("", ai);
  return joinLines(lines);
}

function renderXMonthly(story, deps = {}) {
  const dict = deps?.dict || require("../../../content/dict");
  const dateLocal = story?.meta?.date_local || story?.public?.date_local || "";
  if (!String(dateLocal || "").endsWith("-01")) return "";
  const ctx = story?.meta?.x_source?.monthly_context || buildMonthlyContext({ story, dict, asOfISO: story?.meta?.as_of });
  if (!ctx?.monthLabel) return "";

  const ai = String(story?.meta?.x_ai?.monthly || "").trim();
  const points = Array.isArray(ctx.points) ? ctx.points.slice(0, 3) : [];
  const pointLines = points.map((p) => `・${p}`);
  const newLine = ctx.newEvent?.label ? `新月｜${ctx.newEvent.label} ${ctx.newEvent.dateLabel || ""}`.trim() : "";
  const fullLine = ctx.fullEvent?.label ? `満月｜${ctx.fullEvent.label} ${ctx.fullEvent.dateLabel || ""}`.trim() : "";

  const lines = [
    `🌌 ${ctx.monthLabel}の空模様`,
    "",
    ai,
    "",
    SEP,
    "",
    "注目の流れ",
    ...pointLines,
    "",
    newLine,
    fullLine,
    "",
    "今月の空を、毎日置いていきます 🌌",
  ];
  return joinLines(lines);
}

module.exports = {
  renderX,
  renderXMorning,
  renderXMorningMain,
  renderXMorningLog,
  renderXNight,
  renderXResonance,
  renderXMoonEvent,
  renderXMonthly,
};
