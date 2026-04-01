"use strict";

/**
 * channels/x.js
 * - X: morning / night / resonance / moon_event / monthly
 */

const { buildRetrogradeMap } = require("../../domain/astro/retrograde");
const { normalizeBodyKey } = require("../../domain/canonical");
const { formatDateLabel, glyphForBody, signJa, aspectInfo, formatElementModalityLines } = require("../format/format/common");
const { formatDateYmdHm, calcTransitLon, toIsoAtJstNoon } = require("../../domain/astro_compute");
const { findTransitWindowInRange } = require("../../domain/aspect_proximity");
const { toDateLocalJST, formatJstYmd } = require("../../utils/time_utils");
const { joinLines } = require("../../utils/text_format");
const { toHashtag } = require("../../utils/hashtag_utils");
const {
  CORE_PLANETS,
  EXTENDED_PLANETS,
  PERSONAL_PLANETS,
  SOCIAL_PLANETS,
  OUTER_PLANETS,
} = require("../../domain/astro/constants");
const { pickPrimaryResonanceAspect } = require("../../domain/resonance");
const { detectMoonEvent } = require("../../usecases/channels/x/generate_x_moon_event_ai");
const { buildMonthlyContext } = require("../../usecases/channels/x/generate_x_monthly_ai");
const { buildNext30DaysContext } = require("../../usecases/channels/x/generate_x_next_30_days_ai");

const SEP = "────────";

function formatRangeShort(start, end) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return "";
  if (!(end instanceof Date) || Number.isNaN(end.getTime())) return "";
  const startYmd = formatJstYmd(start);
  const endYmd = formatJstYmd(end);
  const [sy, sm, sd] = startYmd.split(".");
  const [ey, em, ed] = endYmd.split(".");
  if (sy && sm && sd && ey && em && ed && sy === ey && sm === em) {
    return `${startYmd}〜${em}.${ed}`;
  }
  return `${startYmd}〜${endYmd}`;
}

const SIGN_ORDER = [
  "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
];

function signKeyFromLonLocal(lon) {
  if (!Number.isFinite(Number(lon))) return null;
  const idx = Math.floor((((Number(lon) % 360) + 360) % 360) / 30);
  return SIGN_ORDER[idx] || null;
}

function monthBoundsFromKey(monthKey) {
  if (!monthKey) return null;
  const [yRaw, mRaw] = String(monthKey).split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  const start = new Date(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  const nextMonth = m >= 12 ? 1 : m + 1;
  const nextYear = m >= 12 ? y + 1 : y;
  const end = new Date(`${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+09:00`);
  return { start, end };
}

function findRetrogradeRangeInMonth(bodyKey, monthKey) {
  const { isRetrograde } = require("../../domain/astro/retrograde");
  const { toIsoAtJstNoon } = require("../../domain/astro_compute");
  const bounds = monthBoundsFromKey(monthKey);
  if (!bounds) return null;
  const { start, end } = bounds;
  let cur = new Date(start.getTime());
  let first = null;
  let last = null;
  while (cur.getTime() < end.getTime()) {
    const iso = toIsoAtJstNoon(cur);
    if (iso && isRetrograde(bodyKey, iso)) {
      if (!first) first = new Date(cur.getTime());
      last = new Date(cur.getTime());
    }
    cur = new Date(cur.getTime() + 86400000);
  }
  if (!first) return null;
  return { start: first, end: last || first };
}

function buildResonanceSummaryLines(story, dict) {
  const aspectWeights = new Map([
    [0, 1.0],
    [180, 0.95],
    [90, 0.93],
    [120, 0.90],
    [60, 0.82],
    [45, 0.72],
    [135, 0.72],
  ]);
  const aspectList = Array.from(aspectWeights.keys());
  const orbLimit = 3;

  const personal = new Set(PERSONAL_PLANETS);
  const social = new Set(SOCIAL_PLANETS);
  const outer = new Set(OUTER_PLANETS);

  const classOf = (k) => {
    if (outer.has(k)) return "outer";
    if (social.has(k)) return "social";
    if (personal.has(k)) return "personal";
    return "personal";
  };

  const planetClassBonus = (a, b) => {
    const ca = classOf(a);
    const cb = classOf(b);
    if (ca === "outer" && cb === "outer") return 0.20;
    if ((ca === "outer" && cb === "social") || (ca === "social" && cb === "outer")) return 0.14;
    if (ca === "social" && cb === "social") return 0.10;
    if ((ca === "personal" && cb === "social") || (ca === "social" && cb === "personal")) return 0.08;
    return 0.0;
  };

  const durationBonus = (days) => {
    if (days >= 21) return 0.25;
    if (days >= 14) return 0.18;
    if (days >= 7) return 0.10;
    return 0;
  };

  const monthKey = story?.meta?.date_local?.slice(0, 7) || story?.public?.date_local?.slice(0, 7) || "";
  const bounds = monthBoundsFromKey(monthKey);
  if (!bounds) return [];

  const bodyList = CORE_PLANETS;

  const scanWindow = (aKey, bKey, aspectDeg) => findTransitWindowInRange({
    kind: "transit-transit",
    aKey,
    bKey,
    aspectDeg,
    start: bounds.start,
    end: bounds.end,
    orbLimit,
    stepDays: 1,
  });

  const candidates = [];
  for (let i = 0; i < bodyList.length; i++) {
    for (let j = i + 1; j < bodyList.length; j++) {
      const aKey = bodyList[i];
      const bKey = bodyList[j];
      if ((aKey === "sun" && bKey === "moon") || (aKey === "moon" && bKey === "sun")) continue;
      for (const deg of aspectList) {
        const window = scanWindow(aKey, bKey, deg);
        if (!window) continue;
        const aspectWeight = aspectWeights.get(deg) || 0;
        const orbBonus = (orbLimit - window.bestOrb) / orbLimit;
        const score = aspectWeight + orbBonus + durationBonus(window.days) + planetClassBonus(aKey, bKey);
        candidates.push({ aKey, bKey, aspectDeg: deg, score, ...window });
      }
    }
  }

  if (!candidates.length) return [];
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.bestOrb !== b.bestOrb) return a.bestOrb - b.bestOrb;
    const ta = a.peak?.getTime() || 0;
    const tb = b.peak?.getTime() || 0;
    return ta - tb;
  });
  const top = candidates[0];
  if (!top) return [];

  const aLabel = dict?.PLANETS_V2?.bodies?.[top.aKey]?.label_ja || dict?.POINTS_V1?.points?.[top.aKey]?.label_ja || top.aKey;
  const bLabel = dict?.PLANETS_V2?.bodies?.[top.bKey]?.label_ja || dict?.POINTS_V1?.points?.[top.bKey]?.label_ja || top.bKey;
  const peakIso = top.peak ? toIsoAtJstNoon(top.peak) : null;
  const lonA = peakIso ? calcTransitLon(top.aKey, peakIso) : null;
  const lonB = peakIso ? calcTransitLon(top.bKey, peakIso) : null;
  const aSignKey = signKeyFromLonLocal(lonA);
  const bSignKey = signKeyFromLonLocal(lonB);
  const aSign = aSignKey ? signJa(dict, aSignKey) : "";
  const bSign = bSignKey ? signJa(dict, bSignKey) : "";

  const aspect = aspectInfo(dict, null, top.aspectDeg);
  const aspectLabel = aspect?.label_ja || "";
  const degText = `${Math.round(top.aspectDeg)}°`;
  const orbText = Number.isFinite(Number(top.bestOrb)) ? `${top.bestOrb.toFixed(1)}°` : "";
  const peakLabel = top.peak ? formatDateYmdHm(top.peak) : "";

  const aSignText = aSign ? `（${aSign}）` : "";
  const bSignText = bSign ? `（${bSign}）` : "";
  const lines = [
    "🪐共鳴",
    `${aLabel}${aSignText}× ${bLabel}${bSignText}`.trim(),
    `${aspectLabel} ${degText}｜${orbText}${peakLabel ? `（${peakLabel}）` : ""}`.trim(),
  ];
  return lines;
}

function buildMoonEventTags({ kind, signJa, specialName, moonName }) {
  const kindLabel = kind === "new" ? "新月" : "満月";
  const tags = [];
  tags.push(toHashtag(kindLabel));
  if (signJa) tags.push(toHashtag(`${signJa}${kindLabel}`));
  const extra = specialName || (kind === "full" ? moonName : "") || "";
  if (extra) tags.push(toHashtag(extra));
  const uniq = [];
  const seen = new Set();
  for (const tag of tags) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    uniq.push(tag);
  }
  return uniq.slice(0, 3);
}

function pickDominantSignLabel(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const transitSigns = story?.public?.transit_signs || {};
  const bodyOrder = CORE_PLANETS;

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
  const dict = deps?.dict || require("../../content/dict");
  const includeHeader = deps?.includeHeader !== false;
  const includePoints = deps?.includePoints !== false;
  const skipGlyphFor = Array.isArray(deps?.skipGlyphFor) ? deps.skipGlyphFor : [];
  const skipGlyphSet = new Set(skipGlyphFor.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean));
  const dateLabel = formatDateLabel(story?.meta?.date_local);
  const asOfISO = story?.meta?.as_of || null;

  const pub = story?.public || {};
  const transitSigns = pub.transit_signs || {};

  const bodyOrder = includePoints ? EXTENDED_PLANETS : CORE_PLANETS;

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
  const picked = pickPrimaryResonanceAspect({ story, dict, resonanceMode: story?.meta?.resonance_mode });
  return picked?.raw || null;
}

function buildResonanceDisplay(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
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
  const { formatXAiText } = require("../../usecases/channels/x/x_ai_common");
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
  const dict = deps?.dict || require("../../content/dict");
  const logLines = buildMainLogLines(story, {
    ...deps,
    includeHeader: false,
    includePoints: true,
    skipGlyphFor: ["lilith", "chiron"],
  });

  const tags = "#星の配置 #天体観測 #占星術";
  const baseLines = ["🌌 星の配置", "", joinLines(logLines), "", tags];
  return joinLines(baseLines);
}

function renderXNight(story, deps = {}) {
  const { formatXAiText } = require("../../usecases/channels/x/x_ai_common");
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
  const { formatXAiText } = require("../../usecases/channels/x/x_ai_common");
  const rawAi = String(story?.meta?.x_ai?.resonance || "").trim();
  const ai = rawAi ? formatXAiText(rawAi) : "";
  const dict = deps?.dict || require("../../content/dict");
  const raw = resolveResonanceRaw(story, dict, { fallback: false });
  if (!raw) return "";

  const dateLabel = formatDateLabel(story?.meta?.date_local || story?.public?.date_local || "");
  const aKey = normalizeBodyKey(raw?.a || "");
  const bKey = normalizeBodyKey(raw?.b || "");
  const aLabel = dict?.PLANETS_V2?.bodies?.[aKey]?.label_ja || dict?.POINTS_V1?.points?.[aKey]?.label_ja || aKey;
  const bLabel = dict?.PLANETS_V2?.bodies?.[bKey]?.label_ja || dict?.POINTS_V1?.points?.[bKey]?.label_ja || bKey;
  const aSign = raw?.a_sign_ja || signJa(dict, raw?.a_sign_key || "");
  const bSign = raw?.b_sign_ja || signJa(dict, raw?.b_sign_key || "");
  const aGlyph = glyphForBody(aKey);
  const bGlyph = glyphForBody(bKey);

  const aspect = aspectInfo(dict, raw?.type || raw?.aspT || raw?.aspect, raw?.aspect_deg);
  const aspectLabel = aspect?.label_ja || "";
  const aspectDeg = Number.isFinite(Number(raw?.aspect_deg))
    ? Number(raw.aspect_deg)
    : Number.isFinite(Number(aspect?.deg))
      ? Number(aspect.deg)
      : null;
  const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
  const orb = Number.isFinite(Number(raw?.orb_deg)) ? Number(raw.orb_deg) : null;
  const orbText = orb != null ? `${orb.toFixed(1)}°` : "";
  const infoParts = [];
  if (aspectLabel) infoParts.push(aspectLabel);
  if (degText) infoParts.push(degText);
  if (orbText) infoParts.push(`orb ${orbText}`);
  const infoLine = infoParts.join("｜");

  const lines = [
    `🌌 星の配置｜${dateLabel}`,
    "",
    `${aGlyph ? `${aGlyph} ` : ""}${aLabel}${aSign ? `（${aSign}）` : ""}`,
    "×",
    `${bGlyph ? `${bGlyph} ` : ""}${bLabel}${bSign ? `（${bSign}）` : ""}`,
  ];
  if (infoLine) lines.push("", infoLine);
  if (ai) lines.push("", ai);
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
  const { formatXAiText } = require("../../usecases/channels/x/x_ai_common");
  const dict = deps?.dict || require("../../content/dict");
  const event = resolveMoonEventDisplay(story, dict);
  if (!event) return "";
  const rawAi = String(story?.meta?.x_ai?.moon_event || "").trim();
  const ai = rawAi ? formatXAiText(rawAi) : "";
  const phaseName = event.phaseName || (event.kind === "new" ? "新月" : "満月");
  const signJa = event.signJa && event.signJa !== "—" ? event.signJa : "";
  const core = signJa ? `${signJa}${phaseName}` : phaseName;
  const suffixName = event.specialName || (event.kind === "full" ? event.moonName : "") || "";
  const line1 = `${event.phaseSymbol || "🌙"} ${core}${suffixName ? `｜${suffixName}` : ""}`.trim();
  const dateTextRaw = event.date instanceof Date ? formatDateYmdHm(event.date) : (event.dateLabel || "");
  const line2 = dateTextRaw ? `${dateTextRaw} JST` : "";
  const lines = [line1, line2].filter(Boolean);
  if (ai) lines.push("", ai);
  return joinLines(lines);
}

function renderXMonthly(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const dateLocal = story?.meta?.date_local || story?.public?.date_local || "";
  if (!String(dateLocal || "").endsWith("-01")) return "";
  const resonanceMode = deps?.resonanceMode || story?.meta?.resonance_mode || "core";
  const ctx = story?.meta?.x_source?.monthly_context ||
    buildMonthlyContext({ story, dict, asOfISO: story?.meta?.as_of, resonanceMode });
  if (!ctx?.monthLabel) return "";

  const { formatXAiText } = require("../../usecases/channels/x/x_ai_common");
  const rawAi = String(story?.meta?.x_ai?.monthly || "").trim();
  const ai = rawAi ? formatXAiText(rawAi) : "";
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

function renderXNext30Days(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const resonanceMode = deps?.resonanceMode || story?.meta?.resonance_mode || "core";
  const ctx = story?.meta?.x_source?.next_30_days_context ||
    buildNext30DaysContext({ story, dict, asOfISO: story?.meta?.as_of, resonanceMode });
  if (!ctx) return "";

  const { formatXAiText } = require("../../usecases/channels/x/x_ai_common");
  const rawAi = String(story?.meta?.x_ai?.next_30_days || "").trim();
  const ai = rawAi ? formatXAiText(rawAi) : "";
  const events = [
    ctx.newEvent?.date instanceof Date ? {
      kind: "新月",
      date: ctx.newEvent.date,
      line: `新月｜${ctx.newEvent.label} ${ctx.newEvent.dateLabel || ""}`.trim(),
    } : null,
    ctx.fullEvent?.date instanceof Date ? {
      kind: "満月",
      date: ctx.fullEvent.date,
      line: `満月｜${ctx.fullEvent.label} ${ctx.fullEvent.dateLabel || ""}`.trim(),
    } : null,
  ].filter(Boolean);
  const eventLines = events
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => e.line);

  const lines = [
    "🌌 今月の空模様",
    "",
    ai,
  ];
  return joinLines(lines);
}

function renderXNext30DaysFlow(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const resonanceMode = deps?.resonanceMode || story?.meta?.resonance_mode || "core";
  const ctx = story?.meta?.x_source?.next_30_days_context ||
    buildNext30DaysContext({ story, dict, asOfISO: story?.meta?.as_of, resonanceMode });
  if (!ctx) return "";

  const resonanceLines = buildResonanceSummaryLines(story, dict);
  const events = [
    ctx.newEvent?.date instanceof Date ? {
      kind: "new",
      signJa: ctx.newEvent.signJa,
      specialName: ctx.newEvent.specialName,
      moonName: ctx.newEvent.moonName,
      date: ctx.newEvent.date,
      line: `新月｜${ctx.newEvent.label} ${ctx.newEvent.dateLabel || ""}`.trim(),
    } : null,
    ctx.fullEvent?.date instanceof Date ? {
      kind: "full",
      signJa: ctx.fullEvent.signJa,
      specialName: ctx.fullEvent.specialName,
      moonName: ctx.fullEvent.moonName,
      date: ctx.fullEvent.date,
      line: `満月｜${ctx.fullEvent.label} ${ctx.fullEvent.dateLabel || ""}`.trim(),
    } : null,
  ].filter(Boolean);
  const eventLines = events
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => {
      const prefix = e.kind === "full" ? "🌕" : "🌑";
      const kindLabel = e.kind === "full" ? "満月" : "新月";
      const sign = e.signJa ? String(e.signJa).trim() : "";
      const base = sign ? `${sign}${kindLabel}` : kindLabel;
      const extra = e.specialName || (e.kind === "full" ? e.moonName : "") || "";
      const dateLabel = e.date instanceof Date ? formatDateYmdHm(e.date) : (e.dateLabel || "");
      const parts = [prefix, base, extra, dateLabel].filter(Boolean);
      return parts.join(" ");
    });
  const eventTags = events
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => {
      const sign = e.signJa ? String(e.signJa).trim() : "";
      const kindLabel = e.kind === "new" ? "新月" : "満月";
      return sign ? toHashtag(`${sign}${kindLabel}`) : "";
    })
    .filter(Boolean);
  const eventTagsLine = eventTags.length ? eventTags.join(" ") : "";
  if (!eventLines.length) return "";

  const retro = findRetrogradeRangeInMonth("mercury", ctx.monthKey);
  const retroBodies = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
  const retroItems = retroBodies
    .map((key) => {
      const win = findRetrogradeRangeInMonth(key, ctx.monthKey);
      if (!win) return null;
      const label = dict?.PLANETS_V2?.bodies?.[key]?.label_ja || dict?.POINTS_V1?.points?.[key]?.label_ja || key;
      const endLabel = formatJstYmd(win.end);
      return endLabel ? `${label} ${endLabel}まで` : null;
    })
    .filter(Boolean);
  const retroLine = retroItems.length ? `逆行｜${retroItems.join(" / ")}` : "逆行：なし";

  const lines = [
    "────────",
    "",
    "🌌注目の流れ",
    "",
    ...resonanceLines,
    resonanceLines.length ? "" : null,
    ...eventLines,
    "",
    `💫${retroLine}`,
    "",
    "これからの空を、毎日置いていきます✨️",
    eventTagsLine ? "" : null,
    eventTagsLine || null,
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
  renderXNext30Days,
  renderXNext30DaysFlow,
};
