"use strict";

const { findNextMoonPhase } = require("../astro/compute");
const { toDateLocalJST } = require("../../utils/time");
const { buildNextMoonEvent } = require("./events");
const { findNextMoonSignChangeDetailed } = require("./sign");

function monthRangeFromDateLocal(dateLocal) {
  const parts = String(dateLocal || "").split("-");
  if (parts.length < 2) return { monthKey: "", monthLabel: "", start: null, end: null };
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return { monthKey: "", monthLabel: "", start: null, end: null };
  }
  const monthKey = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
  const monthLabel = `${y}年${m}月`;
  const start = new Date(`${monthKey}-01T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return { monthKey, monthLabel, start: null, end: null };
  const end = new Date(start.getTime());
  end.setMonth(end.getMonth() + 1);
  return { monthKey, monthLabel, start, end };
}

function resolveMonthlyDateLocal({ dateLocal, asOfISO } = {}) {
  if (dateLocal) return String(dateLocal);
  if (asOfISO) {
    const d = new Date(asOfISO);
    if (!Number.isNaN(d.getTime())) return toDateLocalJST(d);
  }
  return toDateLocalJST(new Date());
}

function buildMoonEventsInMonth({ dateLocal, asOfISO, dict } = {}) {
  const baseDateLocal = resolveMonthlyDateLocal({ dateLocal, asOfISO });
  const range = monthRangeFromDateLocal(baseDateLocal);
  if (!range.start || !range.end) {
    return { ...range, dateLocal: baseDateLocal, newEvent: null, fullEvent: null };
  }
  const startIso = range.start.toISOString();
  const nextNew = findNextMoonPhase(startIso, 0);
  const nextFull = findNextMoonPhase(startIso, 180);
  const newEvent = (nextNew && nextNew.getTime() < range.end.getTime())
    ? buildNextMoonEvent("new", nextNew, dict)
    : null;
  const fullEvent = (nextFull && nextFull.getTime() < range.end.getTime())
    ? buildNextMoonEvent("full", nextFull, dict)
    : null;
  return { ...range, dateLocal: baseDateLocal, newEvent, fullEvent };
}

function listMoonSignChangesInMonth({ dateLocal, asOfISO, dict, maxChanges = 24, stepMinutes = 60 } = {}) {
  const baseDateLocal = resolveMonthlyDateLocal({ dateLocal, asOfISO });
  const range = monthRangeFromDateLocal(baseDateLocal);
  if (!range.start || !range.end) return [];

  const results = [];
  let cursor = new Date(range.start.getTime());
  for (let i = 0; i < maxChanges; i += 1) {
    const next = findNextMoonSignChangeDetailed({
      dict,
      asOfISO: cursor.toISOString(),
      maxHours: 31 * 24,
      stepMinutes,
    });
    if (!next?.date || Number.isNaN(next.date.getTime())) break;
    if (next.date.getTime() >= range.end.getTime()) break;
    results.push(next);
    cursor = new Date(next.date.getTime() + 60 * 1000);
  }
  return results;
}

module.exports = {
  monthRangeFromDateLocal,
  resolveMonthlyDateLocal,
  buildMoonEventsInMonth,
  listMoonSignChangesInMonth,
};
