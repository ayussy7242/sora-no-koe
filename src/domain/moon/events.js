"use strict";

const dictDefault = require("../../content/dict");
const { calcTransitLon, findNextMoonPhase, formatDateYmdHm } = require("../astro/compute");
const { toDateLocalJST } = require("../../utils/time");
const { signLabelFromLon } = require("./labels");

const FULL_MOON_NAMES = {
  1: { ja: "ウルフムーン", en: "Wolf Moon" },
  2: { ja: "スノームーン", en: "Snow Moon" },
  3: { ja: "ワームムーン", en: "Worm Moon" },
  4: { ja: "ピンクムーン", en: "Pink Moon" },
  5: { ja: "フラワームーン", en: "Flower Moon" },
  6: { ja: "ストロベリームーン", en: "Strawberry Moon" },
  7: { ja: "バックムーン", en: "Buck Moon" },
  8: { ja: "スタージョンムーン", en: "Sturgeon Moon" },
  9: { ja: "ハーベストムーン", en: "Harvest Moon" },
  10: { ja: "ハンターズムーン", en: "Hunter's Moon" },
  11: { ja: "ビーバームーン", en: "Beaver Moon" },
  12: { ja: "コールドムーン", en: "Cold Moon" },
};

function fullMoonNameFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return { ja: "", en: "" };
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = jst.getUTCMonth() + 1;
  const entry = FULL_MOON_NAMES[month] || {};
  return {
    ja: entry.ja || "",
    en: entry.en || "",
  };
}

function fullMoonNameJaFromDate(date) {
  return fullMoonNameFromDate(date).ja || "";
}

function fullMoonNameEnFromDate(date) {
  return fullMoonNameFromDate(date).en || "";
}

function moonEventNameInfo({ kind, date } = {}) {
  const k = String(kind || "").toLowerCase();
  const empty = {
    moonNameJa: "",
    moonNameEn: "",
    specialNameJa: "",
    specialNameEn: "",
    displayNameJa: "",
    displayNameEn: "",
  };
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return empty;

  if (k === "full") {
    const names = fullMoonNameFromDate(date);
    const blueMoon = isBlueMoon(date);
    const specialNameJa = blueMoon ? "ブルームーン" : "";
    const specialNameEn = blueMoon ? "Blue Moon" : "";
    return {
      moonNameJa: names.ja || "",
      moonNameEn: names.en || "",
      specialNameJa,
      specialNameEn,
      displayNameJa: specialNameJa || names.ja || "",
      displayNameEn: specialNameEn || names.en || "",
    };
  }

  if (k === "new") {
    const blackMoon = isBlackMoon(date);
    const specialNameJa = blackMoon ? "ブラックムーン" : "";
    const specialNameEn = blackMoon ? "Black Moon" : "";
    return {
      moonNameJa: "",
      moonNameEn: "",
      specialNameJa,
      specialNameEn,
      displayNameJa: specialNameJa || "",
      displayNameEn: specialNameEn || "",
    };
  }

  return empty;
}

function moonEventKindLabelJa(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "new") return "新月";
  if (k === "full") return "満月";
  return "";
}

function moonEventKindLabelEn(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "new") return "New Moon";
  if (k === "full") return "Full Moon";
  return "";
}

function moonEventKindSymbol(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "new") return "🌑";
  if (k === "full") return "🌕";
  return "🌙";
}

function moonEventFlags(input) {
  const kind = typeof input === "string" ? input : input?.kind;
  const k = String(kind || "").toLowerCase();
  return {
    kind: k || "",
    isFull: k === "full",
    isNew: k === "new",
  };
}

function moonEventIlluminationDefaults(input) {
  const flags = moonEventFlags(input);
  return {
    illumination: flags.isFull ? 1 : 0.03,
    waxing: !flags.isFull,
  };
}

function moonEventRelationInfo(input) {
  const flags = moonEventFlags(input);
  if (flags.isFull) {
    return {
      aspectKey: "opposition",
      labelJa: "オポジション",
      deg: 180,
      structureJa: "太陽と月が向かい合い、配置が二極で立ち上がる。",
    };
  }
  if (flags.isNew) {
    return {
      aspectKey: "conjunction",
      labelJa: "コンジャンクション",
      deg: 0,
      structureJa: "太陽と月が重なり、配置の核が一点に集まる。",
    };
  }
  return {
    aspectKey: "",
    labelJa: "",
    deg: null,
    structureJa: "",
  };
}

function moonEventAxisWordsJa(input) {
  const flags = moonEventFlags(input);
  if (flags.isNew) return "重なり / 収束 / 密度";
  if (flags.isFull) return "向かい合い / 張力 / 対向";
  return "";
}

function moonEventNameLineEn({ kind, signEn, specialNameEn, moonNameEn } = {}) {
  const flags = moonEventFlags(kind);
  if (flags.isFull) {
    return String(specialNameEn || moonNameEn || "").trim();
  }
  if (flags.isNew) {
    const sign = String(signEn || "").trim();
    return sign ? `New Moon in ${sign}` : "New Moon";
  }
  return "";
}

function moonEventSpaceConfig(input) {
  const flags = moonEventFlags(input);
  if (flags.isFull) {
    return {
      starDensityScale: 0.38,
      milkyIntensityScale: 0.6,
      milkyThicknessScale: 0.75,
      milkyDustScale: 0.6,
      whiteMix: 0.45,
      moonEventKind: "full",
      moonEventStyle: "halo",
      moonEventCenter: "center",
      moonEventIntensity: 1.35,
    };
  }
  if (flags.isNew) {
    return {
      starDensityScale: 2.1,
      milkyIntensityScale: 1.55,
      milkyThicknessScale: 1.25,
      milkyDustScale: 1.6,
      whiteMix: 0.45,
      moonEventKind: "new",
      moonEventStyle: "eclipse",
      moonEventCenter: "center",
      moonEventIntensity: 1.15,
    };
  }
  return null;
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

  const phaseSymbol = moonEventKindSymbol(kind);
  const phaseName = moonEventKindLabelJa(kind);
  const signJa = ev?.signJa || signLabelFromLon(dict, calcTransitLon("moon", date.toISOString()));
  const nameInfo = moonEventNameInfo({ kind, date });
  const moonName = nameInfo.moonNameJa || "";
  const moonNameEn = nameInfo.moonNameEn || "";
  const specialName = nameInfo.specialNameJa || "";
  const specialNameEn = nameInfo.specialNameEn || "";

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

function detectMoonEventLocal({ dateLocal, asOfISO, dict, forceNext = false, eventKind = "" }) {
  const events = buildNextMoonEvents(asOfISO, dict);
  const candidates = [events?.new, events?.full].filter((ev) => ev?.date instanceof Date);
  const normalizedKind = String(eventKind || "").toLowerCase();

  if (normalizedKind === "new" || normalizedKind === "full") {
    const picked = events?.[normalizedKind];
    if (!picked?.date) return null;
    if (forceNext) return formatMoonEventDisplay(picked);
    if (!dateLocal) return null;
    return toDateLocalJST(picked.date) === dateLocal ? formatMoonEventDisplay(picked) : null;
  }

  if (dateLocal) {
    for (const ev of candidates) {
      const evDateLocal = toDateLocalJST(ev.date);
      if (evDateLocal === dateLocal) {
        return formatMoonEventDisplay(ev);
      }
    }
  }

  if (forceNext) {
    const ordered = orderedMoonEvents(events);
    if (ordered.length) return formatMoonEventDisplay(ordered[0]);
  }

  return null;
}

module.exports = {
  fullMoonNameJaFromDate,
  fullMoonNameEnFromDate,
  moonEventNameInfo,
  moonEventKindLabelJa,
  moonEventKindLabelEn,
  moonEventKindSymbol,
  moonEventFlags,
  moonEventIlluminationDefaults,
  moonEventRelationInfo,
  moonEventAxisWordsJa,
  moonEventNameLineEn,
  moonEventSpaceConfig,
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
  detectMoonEventLocal,
  isSecondMoonInMonth,
  isBlackMoon,
  isBlueMoon,
};
