"use strict";

const { buildTodayMoonInfo, buildNextMoonEvents, orderedMoonEvents } = require("./moon_info");

const SYNODIC_HALF = 14.765;

function isWaxingByAge(moonAge) {
  if (!Number.isFinite(Number(moonAge))) return null;
  return Number(moonAge) < SYNODIC_HALF;
}

function selectNextMajorPhase({ asOfISO, story, dict } = {}) {
  const info = buildTodayMoonInfo({ asOfISO, story, dict });
  const events = buildNextMoonEvents(asOfISO, dict);
  const waxing = isWaxingByAge(info?.moonAge);

  const ordered = orderedMoonEvents(events);
  let next = null;
  if (asOfISO) {
    const base = new Date(asOfISO);
    if (!Number.isNaN(base.getTime())) {
      next = ordered.find((ev) => ev?.date instanceof Date && ev.date.getTime() > base.getTime()) || null;
    }
  }
  if (!next) next = ordered[0] || null;

  return { next, info, events, waxing };
}

module.exports = {
  selectNextMajorPhase,
  isWaxingByAge,
};
