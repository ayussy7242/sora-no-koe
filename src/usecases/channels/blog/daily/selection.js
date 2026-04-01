"use strict";

const dict = require("../../../../content/dict");
const { findNextMoonPhase } = require("../../../../domain/astro/compute");
const { formatTodayMoonLines } = require("../../../../domain/moon");
const { toDateLocalJST } = require("../../../../utils/time");

function findMoonPhaseInJstDate(dateLocal, phaseDeg) {
  if (!dateLocal) return null;
  const start = new Date(`${dateLocal}T00:00:00+09:00`);
  const end = new Date(`${dateLocal}T23:59:59+09:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const next = findNextMoonPhase(start.toISOString(), phaseDeg);
  if (next && next.getTime() <= end.getTime()) return next;
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

function diffDaysJst(dateLocal, date) {
  if (!dateLocal || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const fullLocal = toDateLocalJST(date);
  if (!fullLocal) return null;
  const a = new Date(`${dateLocal}T00:00:00+09:00`);
  const b = new Date(`${fullLocal}T00:00:00+09:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function moonPhaseTitleLabel({ dateLocal, asOfISO }) {
  if (!dateLocal) return "";
  const newMoonAt = findMoonPhaseInJstDate(dateLocal, 0);
  if (newMoonAt instanceof Date) return "新月";
  const firstQuarterAt = findMoonPhaseInJstDate(dateLocal, 90);
  if (firstQuarterAt instanceof Date) return "上弦";
  const fullMoonAt = findMoonPhaseInJstDate(dateLocal, 180);
  if (fullMoonAt instanceof Date) return "満月";
  const lastQuarterAt = findMoonPhaseInJstDate(dateLocal, 270);
  if (lastQuarterAt instanceof Date) return "下弦";

  const lastFull = lastFullMoonDate(asOfISO);
  const diff = diffDaysJst(dateLocal, lastFull);
  if (!Number.isFinite(diff)) return "";
  if (diff === 1) return "十六夜";
  if (diff === 2) return "立待月";
  if (diff === 3) return "居待月";
  if (diff === 4) return "寝待月";
  if (diff === 5) return "更待月";
  return "";
}

function isMoonEventPhaseLabel(label) {
  return label === "新月" || label === "満月";
}

function getMoonEventPhaseLabel({ dateLocal, asOfISO }) {
  const label = moonPhaseTitleLabel({ dateLocal, asOfISO });
  return isMoonEventPhaseLabel(label) ? label : "";
}

function extractMoonPhaseLabel({ asOfISO, story }) {
  const todayMoon = formatTodayMoonLines({ asOfISO, story, dict });
  const phaseLine = todayMoon?.lines?.[1] || "";
  if (!phaseLine) return "";
  const main = phaseLine.split("｜")[0] || "";
  const label = main.split("（")[0].trim();
  return label;
}

function dominantLabel(strata) {
  const elemCount = strata?.element_count || {};
  const modCount = strata?.modality_count || {};

  const pickTop = (obj) => {
    const entries = Object.entries(obj).filter(([k]) => k !== "unknown");
    if (!entries.length) return { key: "", top: 0, second: 0 };
    entries.sort((a, b) => b[1] - a[1]);
    return { key: entries[0][0], top: entries[0][1], second: entries[1]?.[1] ?? 0 };
  };

  const e = pickTop(elemCount);
  const m = pickTop(modCount);
  const clear =
    (e.top >= 5 || (e.top - e.second) >= 2) &&
    (m.top >= 5 || (m.top - m.second) >= 2);

  if (!clear) return "";

  const elemJa = dict?.ELEMENTS_V1?.elements?.[e.key]?.label_ja || "";
  const modJa = dict?.MODALITIES_V1?.modalities?.[m.key]?.label_ja || "";
  return [elemJa, modJa].filter(Boolean).join("×");
}

module.exports = {
  findMoonPhaseInJstDate,
  lastFullMoonDate,
  diffDaysJst,
  moonPhaseTitleLabel,
  isMoonEventPhaseLabel,
  getMoonEventPhaseLabel,
  extractMoonPhaseLabel,
  dominantLabel,
};
