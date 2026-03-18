"use strict";

const dictDefault = require("../content/dict");
const { swisseph } = require("../config/swisseph");
const { jdUtFromIso, calcTransitLon, findNextMoonPhase, formatDateYmdHm, absAngularDistance } = require("./astro_compute");
let signLabelJa = () => "";
try {
  ({ signLabelJa } = require("../presenters/shared/text/tokens"));
} catch (_err) {
  signLabelJa = (dictObj, key) => {
    const k = String(key || "").toLowerCase();
    return dictObj?.SIGNS?.[k]?.label_ja || dictObj?.SIGNS?.[k]?.label || "";
  };
}
const { toDateLocalJST } = require("../utils/time_utils");

const SYNODIC_MONTH_DAYS = 29.53059;
const KM_PER_AU = 149597870.7;

function moonPhaseSymbolFromDeg(phaseDeg) {
  return astroPhaseFromDeg(phaseDeg).symbol;
}

function astroPhaseFromDeg(phaseDeg) {
  const v = Number(phaseDeg);
  if (!Number.isFinite(v)) return { key: "", name: "", symbol: "🌙" };
  const d = ((v % 360) + 360) % 360;
  if (d < 22.5 || d >= 337.5) return { key: "new", name: "新月", symbol: "🌑" };
  if (d < 67.5) return { key: "waxing_crescent", name: "三日月", symbol: "🌒" };
  if (d < 112.5) return { key: "first_quarter", name: "上弦", symbol: "🌓" };
  if (d < 157.5) return { key: "waxing_gibbous", name: "満ちていく月", symbol: "🌔" };
  if (d < 202.5) return { key: "full", name: "満月", symbol: "🌕" };
  if (d < 247.5) return { key: "waning_gibbous", name: "欠けていく月", symbol: "🌖" };
  if (d < 292.5) return { key: "last_quarter", name: "下弦", symbol: "🌗" };
  return { key: "waning_crescent", name: "残月", symbol: "🌘" };
}

function fullMoonNameJaFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = jst.getUTCMonth() + 1;
  const names = {
    1: "ウルフムーン",
    2: "スノームーン",
    3: "ワームムーン",
    4: "ピンクムーン",
    5: "フラワームーン",
    6: "ストロベリームーン",
    7: "バックムーン",
    8: "スタージョンムーン",
    9: "ハーベストムーン",
    10: "ハンターズムーン",
    11: "ビーバームーン",
    12: "コールドムーン",
  };
  return names[month] || "";
}

function moonPhaseInfo(phaseDeg) {
  return astroPhaseFromDeg(phaseDeg);
}

function calcMoonDistanceKm(asOfISO) {
  if (!swisseph) return null;
  const jdUt = jdUtFromIso(asOfISO);
  if (!Number.isFinite(Number(jdUt))) return null;
  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;
  const out = swisseph.swe_calc_ut(jdUt, swisseph.SE_MOON, flags);
  if (!out || out.error) return null;
  const distAu = typeof out.distance === "number" ? out.distance : out.data?.[2];
  if (!Number.isFinite(Number(distAu))) return null;
  return Number(distAu) * KM_PER_AU;
}

function signLabelFromLon(dict, lon) {
  if (!Number.isFinite(Number(lon))) return "—";
  const order = dict?.SIGNS_V2?.order || dict?.SIGNS?.order || [
    "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
  ];
  const idx = Math.floor((((Number(lon) % 360) + 360) % 360) / 30);
  const key = order[idx];
  return key ? signLabelJa(dict, key) : "—";
}

function buildTodayMoonInfo({ asOfISO, story, dict }) {
  const useDict = dict || dictDefault;
  const sunLon = calcTransitLon("sun", asOfISO);
  const moonLon = calcTransitLon("moon", asOfISO);
  const phaseDeg = Number.isFinite(Number(sunLon)) && Number.isFinite(Number(moonLon))
    ? ((Number(moonLon) - Number(sunLon) + 360) % 360)
    : null;
  const phase = moonPhaseInfo(phaseDeg);
  const phaseAngle = Number.isFinite(Number(sunLon)) && Number.isFinite(Number(moonLon))
    ? absAngularDistance(moonLon, sunLon)
    : null;
  const illumination = Number.isFinite(Number(phaseAngle))
    ? (1 - Math.cos((Number(phaseAngle) * Math.PI) / 180)) / 2
    : null;
  const moonAge = Number.isFinite(Number(phaseDeg)) ? (Number(phaseDeg) / 360) * SYNODIC_MONTH_DAYS : null;
  const moonSign = story?.public?.moon?.sign_ja || signLabelJa(useDict, story?.public?.moon?.sign_key);
  return { phaseDeg, phase, moonAge, moonSign, illumination };
}

function getFullMoonForDate(asOfISO) {
  const base = asOfISO ? new Date(asOfISO) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  const dateLocal = toDateLocalJST(base);
  if (!dateLocal) return null;

  // JST day window: 00:00:00 - 23:59:59
  const start = new Date(`${dateLocal}T00:00:00+09:00`);
  const end = new Date(`${dateLocal}T23:59:59+09:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const nextFull = findNextMoonPhase(start.toISOString(), 180);
  if (nextFull && nextFull.getTime() <= end.getTime()) return nextFull;
  return null;
}

function lastFullMoonDate(asOfISO) {
  if (!asOfISO) return null;
  const base = new Date(asOfISO);
  if (Number.isNaN(base.getTime())) return null;
  const start1 = new Date(base.getTime() - 25 * 86400000).toISOString();
  let full = findNextMoonPhase(start1, 180);
  if (full && full.getTime() > base.getTime()) {
    const start2 = new Date(base.getTime() - 55 * 86400000).toISOString();
    full = findNextMoonPhase(start2, 180);
    if (full && full.getTime() > base.getTime()) return null;
  }
  return full;
}

function lastNewMoonDate(asOfISO) {
  if (!asOfISO) return null;
  const base = new Date(asOfISO);
  if (Number.isNaN(base.getTime())) return null;
  const start1 = new Date(base.getTime() - 25 * 86400000).toISOString();
  let next = findNextMoonPhase(start1, 0);
  if (next && next.getTime() > base.getTime()) {
    const start2 = new Date(base.getTime() - 55 * 86400000).toISOString();
    next = findNextMoonPhase(start2, 0);
    if (next && next.getTime() > base.getTime()) return null;
  }
  return next;
}

function lastMajorMoonEvent(asOfISO) {
  const lastNew = lastNewMoonDate(asOfISO);
  const lastFull = lastFullMoonDate(asOfISO);
  const newTime = lastNew instanceof Date ? lastNew.getTime() : null;
  const fullTime = lastFull instanceof Date ? lastFull.getTime() : null;

  if (newTime == null && fullTime == null) return null;
  if (newTime != null && (fullTime == null || newTime >= fullTime)) {
    return { kind: "new", date: lastNew };
  }
  return { kind: "full", date: lastFull };
}

function nextMajorMoonEvent(asOfISO) {
  if (!asOfISO) return null;
  const base = new Date(asOfISO);
  if (Number.isNaN(base.getTime())) return null;
  const events = buildNextMoonEvents(asOfISO, dictDefault);
  const candidates = [events?.new, events?.full]
    .filter((ev) => ev?.date instanceof Date)
    .filter((ev) => ev.date.getTime() > base.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return candidates[0] || null;
}

function daysDiffJst(a, b) {
  if (!(a instanceof Date) || !(b instanceof Date)) return null;
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const aStr = toDateLocalJST(a);
  const bStr = toDateLocalJST(b);
  if (!aStr || !bStr) return null;
  const aStart = new Date(`${aStr}T00:00:00+09:00`);
  const bStart = new Date(`${bStr}T00:00:00+09:00`);
  if (Number.isNaN(aStart.getTime()) || Number.isNaN(bStart.getTime())) return null;
  return Math.round((aStart.getTime() - bStart.getTime()) / 86400000);
}

function formatTodayMoonLines({ asOfISO, story, dict }) {
  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const lines = [];
  const display = buildMoonStatus({ asOfISO, story, dict, info });
  if (display?.line1) lines.push(display.line1);
  if (display?.line2) lines.push(display.line2);
  return { lines, info: display?.info || info, display };
}

function isBlackMoon(nextNew) {
  return isSecondMoonInMonth(nextNew, 0);
}

function buildNextMoonEvent(kind, date, dict) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const useDict = dict || dictDefault;
  const lon = calcTransitLon("moon", date.toISOString());
  const signJa = signLabelFromLon(useDict, lon);
  const display = formatMoonEventDisplay({ kind, date, dict: useDict, signJa });
  return {
    kind,
    date,
    signJa,
    ...display,
  };
}

function buildNextMoonEvents(asOfISO, dict) {
  const baseISO = asOfISO || new Date().toISOString();
  let nextNew = findNextMoonPhase(baseISO, 0);
  let nextFull = findNextMoonPhase(baseISO, 180);

  if (nextNew && nextFull && Math.abs(nextNew.getTime() - nextFull.getTime()) < 6 * 3600 * 1000) {
    const earlier = nextNew.getTime() <= nextFull.getTime() ? "new" : "full";
    const shiftISO = new Date(Math.min(nextNew.getTime(), nextFull.getTime()) + 60 * 60 * 1000).toISOString();
    if (earlier === "new") {
      nextFull = findNextMoonPhase(shiftISO, 180) || nextFull;
    } else {
      nextNew = findNextMoonPhase(shiftISO, 0) || nextNew;
    }
  }

  return {
    new: buildNextMoonEvent("new", nextNew, dict),
    full: buildNextMoonEvent("full", nextFull, dict),
  };
}

function orderedMoonEvents(events) {
  return [events?.new, events?.full]
    .filter((ev) => ev?.date instanceof Date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function formatNextMoonLines({ asOfISO, dict }) {
  const events = buildNextMoonEvents(asOfISO, dict);
  const ordered = orderedMoonEvents(events);
  const items = ordered
    .map((ev) => formatMoonEventDisplay(ev))
    .filter((ev) => ev?.lines?.length);
  const lines = items.flatMap((item) => item.lines);
  return { lines, items, events };
}

function waNameFromMoonAge(moonAge) {
  if (!Number.isFinite(Number(moonAge))) return "";
  const ageRaw = Number(moonAge);
  const age = Math.max(0, Math.min(29, Math.floor(ageRaw + 1e-6)));
  const map = {
    0: "新月",
    1: "二日月",
    2: "三日月",
    3: "三日月",
    4: "四日月",
    5: "五日月",
    6: "六日月",
    7: "上弦",
    8: "九夜月",
    9: "十日夜",
    10: "十日余月",
    11: "宵月",
    12: "十三夜",
    13: "小望月",
    14: "満月",
    15: "十六夜",
    16: "立待月",
    17: "居待月",
    18: "寝待月",
    19: "更待月",
    20: "二十日余月",
    21: "有明月",
    22: "有明月",
    23: "有明月",
    24: "有明月",
    25: "有明月",
    26: "有明月",
    27: "残月",
    28: "残月",
    29: "晦",
  };
  return map[age] || "";
}

function formatMoonPhaseLabel({ phaseName, waName }) {
  const core = String(phaseName || "").trim() || "—";
  const wa = String(waName || "").trim();
  if (wa && wa !== core) return `${core}（${wa}）`;
  return core;
}

function buildMoonStatus({ asOfISO, story, dict, info }) {
  const useDict = dict || dictDefault;
  const moonInfo = info || buildTodayMoonInfo({ asOfISO, story, dict: useDict });
  if (!moonInfo) return null;

  const phase = moonInfo.phase || astroPhaseFromDeg(moonInfo.phaseDeg);
  let phaseName = phase?.name || "—";
  let phaseSymbol = phase?.symbol || moonPhaseSymbolFromDeg(moonInfo.phaseDeg);
  const waNameRaw = waNameFromMoonAge(moonInfo.moonAge);
  let waName = waNameRaw && waNameRaw !== phaseName ? waNameRaw : "";

  // 新月・満月のときは月相名を優先して表示する
  if (phaseName === "新月" || phaseName === "満月") {
    waName = "";
  }

  const signJa = moonInfo.moonSign || "—";
  const moonAge = Number.isFinite(Number(moonInfo.moonAge)) ? Number(moonInfo.moonAge) : null;
  const illumination = Number.isFinite(Number(moonInfo.illumination)) ? Number(moonInfo.illumination) : null;

  const phaseLabel = formatMoonPhaseLabel({ phaseName, waName });
  const line1 = `${phaseSymbol} ${phaseLabel}｜${signJa}`.trim();
  const moonAgeText = Number.isFinite(moonAge) ? moonAge.toFixed(1) : "—";
  const illuminationPct = Number.isFinite(illumination) ? Math.round(illumination * 100) : null;
  const line2 = illuminationPct != null
    ? `月齢 ${moonAgeText}｜照度 ${illuminationPct}%`
    : `月齢 ${moonAgeText}`;

  return {
    info: moonInfo,
    phaseSymbol,
    phaseName,
    waName,
    signJa,
    moonAge,
    illumination,
    phaseLabel,
    line1,
    line2,
  };
}

function isSecondMoonInMonth(date, phaseDeg) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const prevStart = new Date(date.getTime() - 40 * 86400000).toISOString();
  const prev = findNextMoonPhase(prevStart, phaseDeg);
  if (!(prev instanceof Date)) return false;
  if (prev.getTime() >= date.getTime()) return false;
  const prevMonth = toDateLocalJST(prev).slice(0, 7);
  const curMonth = toDateLocalJST(date).slice(0, 7);
  return prevMonth === curMonth;
}

function isBlueMoon(fullDate) {
  return isSecondMoonInMonth(fullDate, 180);
}

function formatMoonEventDisplay(ev = {}) {
  const kind = ev?.kind || "";
  const date = ev?.date instanceof Date ? ev.date : null;
  const dict = ev?.dict || dictDefault;
  if (!date || (kind !== "new" && kind !== "full")) return null;

  const phaseSymbol = kind === "new" ? "🌑" : "🌕";
  const phaseName = kind === "new" ? "新月" : "満月";
  const signJa = ev?.signJa || signLabelFromLon(dict, calcTransitLon("moon", date.toISOString()));
  const moonName = fullMoonNameJaFromDate(date);
  const specialName = kind === "new"
    ? (isBlackMoon(date) ? "ブラックムーン" : "")
    : (isBlueMoon(date) ? "ブルームーン" : "");

  const core = signJa && signJa !== "—" ? `${signJa}${phaseName}` : phaseName;
  let label = core;
  if (specialName) {
    label = `${specialName}｜${core}`;
  } else if (kind === "full" && moonName) {
    label = `${moonName}｜${core}`;
  }

  const line1 = `${phaseSymbol} ${label}`.trim();
  const dateLabel = formatDateYmdHm(date);
  const line2 = dateLabel || "";
  const line = [line1, line2].filter(Boolean).join(" ");
  const lines = [line1, line2].filter(Boolean);

  return {
    kind,
    date,
    phaseSymbol,
    phaseName,
    specialName,
    signJa,
    moonName,
    label,
    line1,
    line2,
    line,
    lines,
    dateLabel,
  };
}

module.exports = {
  fullMoonNameJaFromDate,
  moonPhaseSymbolFromDeg,
  astroPhaseFromDeg,
  moonPhaseInfo,
  buildTodayMoonInfo,
  formatTodayMoonLines,
  buildMoonStatus,
  buildNextMoonEvents,
  orderedMoonEvents,
  formatNextMoonLines,
  lastNewMoonDate,
  lastFullMoonDate,
  lastMajorMoonEvent,
  nextMajorMoonEvent,
  formatMoonEventDisplay,
  formatMoonPhaseLabel,
  waNameFromMoonAge,
  isBlackMoon,
  isBlueMoon,
  isSecondMoonInMonth,
};
