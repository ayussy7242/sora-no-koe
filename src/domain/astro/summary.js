"use strict";

const { absAngularDistance } = require("./angles");
const { calcTransitLon } = require("./ephemeris");

function formatDateYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function formatDateYmdHm(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "-";
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} ${hh}:${mm}`;
}

function pickApplyingUpcomingAspects(story, dict, asOfISO, maxItems = 5, orbLimit = 3) {
  const pub = story?.public || {};
  const skyAll = Array.isArray(pub.sky_all) ? pub.sky_all : [];
  const asOf = asOfISO ? new Date(asOfISO) : null;
  if (!asOf || Number.isNaN(asOf.getTime())) return [];

  const candidates = skyAll
    .filter((r) => Number.isFinite(Number(r?.orb_deg)))
    .filter((r) => Number(r.orb_deg) <= orbLimit)
    .map((r) => {
      const aKey = String(r?.a || "").toLowerCase();
      const bKey = String(r?.b || "").toLowerCase();
      const aspectDeg = Number(r?.aspect_deg);
      const nowOrb = Number(r?.orb_deg);
      return { aKey, bKey, aspectDeg, nowOrb, raw: r };
    })
    .filter((r) => r.aKey && r.bKey && Number.isFinite(r.aspectDeg));

  const upcoming = [];
  candidates.forEach((c) => {
    const tPlus = new Date(asOf.getTime() + 24 * 3600 * 1000);
    const orbTomorrow = (() => {
      const lonA = calcTransitLon(c.aKey, tPlus.toISOString());
      const lonB = calcTransitLon(c.bKey, tPlus.toISOString());
      if (lonA == null || lonB == null) return null;
      const dist = absAngularDistance(lonA, lonB);
      return Math.abs(dist - c.aspectDeg);
    })();

    if (!Number.isFinite(orbTomorrow)) return;
    if (orbTomorrow >= c.nowOrb) return;

    let best = { orb: c.nowOrb, time: asOf };
    const stepHours = 6;
    const steps = Math.ceil((14 * 24) / stepHours);
    for (let i = 1; i <= steps; i++) {
      const t = new Date(asOf.getTime() + i * stepHours * 3600 * 1000);
      const lonA = calcTransitLon(c.aKey, t.toISOString());
      const lonB = calcTransitLon(c.bKey, t.toISOString());
      if (lonA == null || lonB == null) continue;
      const dist = absAngularDistance(lonA, lonB);
      const orb = Math.abs(dist - c.aspectDeg);
      if (orb < best.orb) best = { orb, time: t };
    }

    upcoming.push({ ...c, peak: best.time });
  });

  upcoming.sort((a, b) => {
    const ta = a?.peak instanceof Date ? a.peak.getTime() : Infinity;
    const tb = b?.peak instanceof Date ? b.peak.getTime() : Infinity;
    if (ta !== tb) return ta - tb;
    return Number(a.nowOrb) - Number(b.nowOrb);
  });
  return upcoming.slice(0, maxItems);
}

module.exports = {
  formatDateYmd,
  formatDateYmdHm,
  pickApplyingUpcomingAspects,
};
