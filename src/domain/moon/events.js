"use strict";

const dictDefault = require("../../content/dict");
const { calcTransitLon, findNextMoonPhase, formatDateYmdHm } = require("../astro/compute");
const { toDateLocalJST } = require("../../utils/time");
const { signLabelFromLon } = require("./labels");

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

function fullMoonNameEnFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = jst.getUTCMonth() + 1;
  const names = {
    1: "Wolf Moon",
    2: "Snow Moon",
    3: "Worm Moon",
    4: "Pink Moon",
    5: "Flower Moon",
    6: "Strawberry Moon",
    7: "Buck Moon",
    8: "Sturgeon Moon",
    9: "Harvest Moon",
    10: "Hunter's Moon",
    11: "Beaver Moon",
    12: "Cold Moon",
  };
  return names[month] || "";
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

function isBlackMoon(nextNew) {
  return isSecondMoonInMonth(nextNew, 0);
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
  const moonNameEn = fullMoonNameEnFromDate(date);
  const specialName = kind === "new"
    ? (isBlackMoon(date) ? "ブラックムーン" : "")
    : (isBlueMoon(date) ? "ブルームーン" : "");
  const specialNameEn = kind === "new"
    ? (isBlackMoon(date) ? "Black Moon" : "")
    : (isBlueMoon(date) ? "Blue Moon" : "");

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
    specialNameEn,
    signJa,
    moonName,
    moonNameEn,
    label,
    line1,
    line2,
    line,
    lines,
    dateLabel,
  };
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

module.exports = {
  fullMoonNameJaFromDate,
  getFullMoonForDate,
  lastFullMoonDate,
  lastNewMoonDate,
  lastMajorMoonEvent,
  nextMajorMoonEvent,
  buildNextMoonEvent,
  buildNextMoonEvents,
  orderedMoonEvents,
  formatNextMoonLines,
  formatMoonEventDisplay,
  isSecondMoonInMonth,
  isBlackMoon,
  isBlueMoon,
};
