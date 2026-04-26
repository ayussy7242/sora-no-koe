"use strict";

const { CORE_PLANETS } = require("../../domain/astro/constants");
const { calcTransitLon } = require("../../domain/astro/ephemeris");
const { signKeyFromLon } = require("../../domain/astro/signs");
const {
  findNextMoonSignChangeDetailed,
  buildNextMoonEvents,
  orderedMoonEvents,
} = require("../../domain/moon");
const { bodyLabelJa, signLabelJa } = require("../../presenters/shared/text/tokens");

const MAJOR_INGRESS_BODIES = CORE_PLANETS.filter((key) => key !== "sun" && key !== "moon");
const DEFAULT_MORNING_EVENT_MAX_HOURS = 6;

function startOfNextJstDay(asOfISO) {
  const base = new Date(asOfISO || Date.now());
  if (Number.isNaN(base.getTime())) return null;
  const local = new Date(base.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  if (Number.isNaN(local.getTime())) return null;
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const d = String(local.getDate()).padStart(2, "0");
  const start = new Date(`${y}-${m}-${d}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + 86400000);
}

function resolveMorningReferenceIso({ story, asOfISO } = {}) {
  const explicit = String(asOfISO || "").trim();
  if (explicit) return explicit;
  const dateLocal = String(story?.meta?.date_local || story?.public?.date_local || "").trim();
  if (dateLocal) return `${dateLocal}T08:00:00+09:00`;
  return String(story?.meta?.as_of || "").trim();
}

function refineIngressTime({ bodyKey, fromTime, toTime, deps = {}, maxIterations = 20 }) {
  let lo = fromTime;
  let hi = toTime;
  if (!(lo instanceof Date) || Number.isNaN(lo.getTime())) return null;
  if (!(hi instanceof Date) || Number.isNaN(hi.getTime())) return null;
  const calcLon = deps.calcTransitLon || calcTransitLon;
  const signFromLonFn = deps.signKeyFromLon || signKeyFromLon;
  const targetLon = calcLon(bodyKey, hi.toISOString());
  const targetSign = signFromLonFn(targetLon);
  if (!targetSign) return null;

  for (let i = 0; i < maxIterations; i += 1) {
    if (hi.getTime() - lo.getTime() <= 60000) break;
    const mid = new Date(Math.floor((lo.getTime() + hi.getTime()) / 2));
    const midLon = calcLon(bodyKey, mid.toISOString());
    const midSign = signFromLonFn(midLon);
    if (midSign === targetSign) hi = mid;
    else lo = mid;
  }
  return hi;
}

function findNextPlanetSignIngress({ bodyKey, asOfISO, endISO, deps = {} }) {
  const calcLon = deps.calcTransitLon || calcTransitLon;
  const signFromLonFn = deps.signKeyFromLon || signKeyFromLon;
  const base = new Date(asOfISO || Date.now());
  const end = new Date(endISO || "");
  if (Number.isNaN(base.getTime()) || Number.isNaN(end.getTime()) || base.getTime() >= end.getTime()) return null;

  const currentLon = calcLon(bodyKey, base.toISOString());
  const currentSign = signFromLonFn(currentLon);
  if (!currentSign) return null;

  let prevTime = base;
  let prevSign = currentSign;
  for (let t = base.getTime() + 3600000; t <= end.getTime(); t += 3600000) {
    const time = new Date(t);
    const lon = calcLon(bodyKey, time.toISOString());
    const signKey = signFromLonFn(lon);
    if (!signKey) continue;
    if (signKey !== prevSign) {
      const at = refineIngressTime({ bodyKey, fromTime: prevTime, toTime: time, deps }) || time;
      return {
        planet: bodyKey,
        toSignKey: signKey,
        atISO: at.toISOString(),
        hoursAhead: (at.getTime() - base.getTime()) / 3600000,
      };
    }
    prevTime = time;
    prevSign = signKey;
  }
  return null;
}

function buildSkyEventMeta({ story, dict, asOfISO, deps = {} } = {}) {
  const referenceIso = resolveMorningReferenceIso({ story, asOfISO });
  if (!referenceIso) return null;
  const maxHours = Number.isFinite(Number(deps.maxHours))
    ? Number(deps.maxHours)
    : DEFAULT_MORNING_EVENT_MAX_HOURS;
  const endTime = deps.endTime instanceof Date ? deps.endTime : startOfNextJstDay(referenceIso);
  if (!(endTime instanceof Date) || Number.isNaN(endTime.getTime())) return null;
  const referenceTime = new Date(referenceIso);
  if (Number.isNaN(referenceTime.getTime())) return null;
  const cutoffTime = new Date(Math.min(
    endTime.getTime(),
    referenceTime.getTime() + (maxHours * 3600000),
  ));

  const nextMoonSignChangeRaw = (deps.findNextMoonSignChangeDetailed || findNextMoonSignChangeDetailed)({ asOfISO: referenceIso, dict });
  const nextMoonSignChange = nextMoonSignChangeRaw?.date && nextMoonSignChangeRaw.date.getTime() <= cutoffTime.getTime()
    ? {
        atISO: nextMoonSignChangeRaw.date.toISOString(),
        toSign: nextMoonSignChangeRaw?.to?.label || "",
        hoursAhead: Number.isFinite(Number(nextMoonSignChangeRaw?.hoursAhead)) ? Number(nextMoonSignChangeRaw.hoursAhead) : null,
      }
    : null;

  const moonPhaseEvents = ((deps.orderedMoonEvents || orderedMoonEvents)((deps.buildNextMoonEvents || buildNextMoonEvents)(referenceIso, dict)) || [])
    .filter((event) => event?.date instanceof Date && !Number.isNaN(event.date.getTime()) && event.date.getTime() <= cutoffTime.getTime())
    .slice(0, 2)
    .map((event) => ({
      kind: event.kind || "",
      sign: event.signJa || "",
      atISO: event.date.toISOString(),
      hoursAhead: (event.date.getTime() - referenceTime.getTime()) / 3600000,
    }));

  const nextPlanetSignIngress = MAJOR_INGRESS_BODIES
    .map((planet) => findNextPlanetSignIngress({ bodyKey: planet, asOfISO: referenceIso, endISO: cutoffTime.toISOString(), deps }))
    .filter(Boolean)
    .sort((a, b) => a.hoursAhead - b.hoursAhead)
    .slice(0, 3)
    .map((item) => ({
      ...item,
      planetLabel: bodyLabelJa(dict, item.planet),
      toSign: signLabelJa(dict, item.toSignKey),
    }));

  const majorAspectPeaks = (Array.isArray(story?.public?.kinjitsu) ? story.public.kinjitsu : [])
    .map((row) => {
      const at = row?.peak_at ? new Date(row.peak_at) : null;
      if (!(at instanceof Date) || Number.isNaN(at.getTime())) return null;
      if (at.getTime() <= referenceTime.getTime() || at.getTime() > cutoffTime.getTime()) return null;
      return {
        a: row.a,
        b: row.b,
        type: row.aspect || "",
        aspectDeg: row.aspect_deg ?? null,
        atISO: at.toISOString(),
        hoursAhead: (at.getTime() - referenceTime.getTime()) / 3600000,
      };
    })
    .filter(Boolean)
    .slice(0, 5);

  return {
    asOfISO: referenceIso,
    maxHours,
    nextMoonSignChange,
    nextPlanetSignIngress,
    majorAspectPeaks,
    moonPhaseEvents,
  };
}

module.exports = {
  buildSkyEventMeta,
  findNextPlanetSignIngress,
  resolveMorningReferenceIso,
};
