"use strict";

const dictDefault = require("../content/dict");
const { swisseph } = require("../config/swisseph");
const { jdUtFromIso, calcTransitLon, findNextMoonPhase, formatDateYmdHm, absAngularDistance } = require("./astro_compute");
const { signLabelJa } = require("../presenters/render/render_tokens");
const { toDateLocalJST } = require("../utils/time_utils");

const SYNODIC_MONTH_DAYS = 29.53059;
const KM_PER_AU = 149597870.7;

function moonNameJaFromDate(date) {
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
  const v = Number(phaseDeg);
  if (!Number.isFinite(v)) return { label: "", alt: "" };
  const d = ((v % 360) + 360) % 360;
  let label = "";
  if (d < 22.5 || d >= 337.5) label = "新月";
  else if (d < 67.5) label = "三日月";
  else if (d < 112.5) label = "上弦の月";
  else if (d < 157.5) label = "十三夜";
  else if (d < 202.5) label = "満月";
  else if (d < 247.5) label = "十六夜";
  else if (d < 292.5) label = "下弦の月";
  else label = "有明月";

  const altMap = {
    新月: "朔",
    三日月: "眉月",
    "上弦の月": "上弦",
    十三夜: "十三夜",
    満月: "望月",
    十六夜: "十六夜",
    "下弦の月": "下弦",
    有明月: "有明月",
  };
  const alt = altMap[label] || "";
  return { label, alt };
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

function nearFullLabelByAge(moonAge) {
  if (!Number.isFinite(Number(moonAge))) return "";
  const age = Number(moonAge);
  if (age < 12.5) return "上弦の月";
  if (age < 13.5) return "十三夜";
  if (age < 14.5) return "小望月";
  if (age < 15.5) return "十六夜";
  if (age < 16.5) return "立待月";
  if (age < 17.5) return "居待月";
  if (age < 18.5) return "寝待月";
  if (age < 19.5) return "更待月";
  return "有明月";
}

function formatTodayMoonLines({ asOfISO, story, dict }) {
  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const lines = [];
  if (info.phase.label || info.moonSign || Number.isFinite(info.moonAge)) {
    const baseDate = asOfISO ? new Date(asOfISO) : new Date();
    const moonName = moonNameJaFromDate(baseDate);
    const isFullNow = Number.isFinite(Number(info.illumination)) && Number(info.illumination) >= 0.98;
    const isNewNow = Number.isFinite(Number(info.illumination)) && Number(info.illumination) <= 0.02;
    let phaseLabelCore = info.phase.label || "—";
    if (isFullNow) {
      phaseLabelCore = "満月";
    } else if (isNewNow) {
      phaseLabelCore = "新月";
    } else if (info.phase.label === "満月") {
      phaseLabelCore = nearFullLabelByAge(info.moonAge) || "小望月";
    }

    let phaseLabel = phaseLabelCore;
    const alt = info.phase.alt || "";
    if (phaseLabelCore === "満月" || phaseLabelCore === "新月") {
      const name = moonName || alt;
      if (name) phaseLabel = `${phaseLabelCore}（${name}）`;
    } else if (alt && alt !== phaseLabelCore) {
      phaseLabel = `${phaseLabelCore}（${alt}）`;
    }

    const moonAgeText = Number.isFinite(info.moonAge) ? info.moonAge.toFixed(1) : "—";
    const illuminationPct = Number.isFinite(info.illumination) ? Math.round(info.illumination * 100) : null;
    lines.push("🌙 本日の月");
    lines.push(`${phaseLabel}｜${info.moonSign || "—"}`);
    lines.push(illuminationPct != null ? `月齢 ${moonAgeText}｜照度 ${illuminationPct}%` : `月齢 ${moonAgeText}`);
  }
  return { lines, info };
}

function isBlackMoon(nextNew) {
  if (!(nextNew instanceof Date) || Number.isNaN(nextNew.getTime())) return false;
  const prevNew = findNextMoonPhase(new Date(nextNew.getTime() - 35 * 86400000).toISOString(), 0);
  if (!(prevNew instanceof Date)) return false;
  const nextMonth = toDateLocalJST(nextNew).slice(0, 7);
  const prevMonth = toDateLocalJST(prevNew).slice(0, 7);
  return nextMonth === prevMonth;
}

function buildNextMoonEvent(kind, date, dict) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const useDict = dict || dictDefault;
  const lon = calcTransitLon("moon", date.toISOString());
  const signJa = signLabelFromLon(useDict, lon);
  const moonName = moonNameJaFromDate(date);
  const labelCore = kind === "new" ? "🌑 次の新月" : "🌕 次の満月";

  const tags = [];
  if (kind === "full" && moonName) tags.push(moonName);

  if (kind === "new") {
    if (isBlackMoon(date)) tags.push("ブラックムーン");
    const distKm = calcMoonDistanceKm(date.toISOString());
    if (Number.isFinite(Number(distKm))) {
      if (distKm <= 360000) tags.push("スーパーニュームーン");
      if (distKm >= 405000) tags.push("ダークムーン");
    }
  }

  const label = tags.length ? `${labelCore}（${tags.join("・")}）` : labelCore;
  const line = `${label}｜${formatDateYmdHm(date)}｜${signJa}`;
  return { kind, date, signJa, label, line, tags };
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
  const lines = orderedMoonEvents(events).map((ev) => ev.line).filter(Boolean);
  return { lines, events };
}

module.exports = {
  moonNameJaFromDate,
  moonPhaseInfo,
  buildTodayMoonInfo,
  formatTodayMoonLines,
  buildNextMoonEvents,
  orderedMoonEvents,
  formatNextMoonLines,
};
