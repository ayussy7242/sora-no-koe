"use strict";

const { swisseph } = require("../../config/swisseph");
const { normalizeBodyKey } = require("../canonical");
const { isRetrograde } = require("./retrograde");
const { norm360, absAngularDistance } = require("./angles");
const { signKeyFromLon } = require("./signs");

function jdUtFromIso(asOfISO) {
  const d = new Date(asOfISO);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hour =
    d.getUTCHours() +
    d.getUTCMinutes() / 60 +
    d.getUTCSeconds() / 3600 +
    d.getUTCMilliseconds() / 3600000;
  return swisseph.swe_julday(y, m, day, hour, swisseph.SE_GREG_CAL);
}

function toIsoAtJstNoon(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T03:00:00.000Z`;
}

function calcTransitLon(bodyKey, asOfISO) {
  if (!swisseph) return null;
  const jdUt = jdUtFromIso(asOfISO);
  if (!Number.isFinite(Number(jdUt))) return null;

  const map = {
    sun: swisseph.SE_SUN,
    moon: swisseph.SE_MOON,
    mercury: swisseph.SE_MERCURY,
    venus: swisseph.SE_VENUS,
    mars: swisseph.SE_MARS,
    jupiter: swisseph.SE_JUPITER,
    saturn: swisseph.SE_SATURN,
    uranus: swisseph.SE_URANUS,
    neptune: swisseph.SE_NEPTUNE,
    pluto: swisseph.SE_PLUTO,
    chiron: swisseph.SE_CHIRON,
    lilith: swisseph.SE_MEAN_APOG,
  };
  const id = map[normalizeBodyKey(bodyKey)];
  if (id == null) return null;

  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;
  const out = swisseph.swe_calc_ut(jdUt, id, flags);
  if (!out || out.error) return null;
  const lon = typeof out.longitude === "number" ? out.longitude : out.data?.[0];
  if (!Number.isFinite(lon)) return null;
  return norm360(lon);
}

function findAspectWindow({ transitKey, natalLon, aspectDeg, asOfISO, maxDays = 240, orbLimit = 3 }) {
  const now = new Date(asOfISO);
  if (Number.isNaN(now.getTime())) return null;
  if (!Number.isFinite(Number(natalLon))) return null;

  let start = null;
  let end = null;
  let peak = null;
  let bestOrb = Infinity;

  const steps = maxDays;
  for (let i = steps; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const lon = calcTransitLon(transitKey, iso);
    if (lon == null) continue;
    const dist = absAngularDistance(lon, natalLon);
    const orb = Math.abs(dist - aspectDeg);
    if (orb <= orbLimit) {
      if (!start) start = new Date(d.getTime());
      if (orb < bestOrb) {
        bestOrb = orb;
        peak = new Date(d.getTime());
      }
    } else if (start && !end) {
      end = new Date(d.getTime());
    }
  }

  for (let i = 0; i <= steps; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const lon = calcTransitLon(transitKey, iso);
    if (lon == null) continue;
    const dist = absAngularDistance(lon, natalLon);
    const orb = Math.abs(dist - aspectDeg);
    if (orb <= orbLimit) {
      if (orb < bestOrb) {
        bestOrb = orb;
        peak = new Date(d.getTime());
      }
      end = new Date(d.getTime());
    } else if (end) {
      break;
    }
  }

  if (!start || !end) return null;
  return { start, end, peak, bestOrb };
}

function findTransitTransitWindow({ aKey, bKey, aspectDeg, asOfISO, maxDays = 240, orbLimit = 3, aSignKey = null, bSignKey = null }) {
  const now = new Date(asOfISO);
  if (Number.isNaN(now.getTime())) return null;

  let start = null;
  let end = null;
  let peak = null;
  let bestOrb = Infinity;
  const requireSign = Boolean(aSignKey || bSignKey);

  const steps = maxDays;
  for (let i = steps; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const lonA = calcTransitLon(aKey, iso);
    const lonB = calcTransitLon(bKey, iso);
    if (lonA == null || lonB == null) continue;
    const signOk = !requireSign
      || ((aSignKey ? signKeyFromLon(lonA) === aSignKey : true)
        && (bSignKey ? signKeyFromLon(lonB) === bSignKey : true));
    const dist = absAngularDistance(lonA, lonB);
    const orb = Math.abs(dist - aspectDeg);
    if (orb <= orbLimit && signOk) {
      if (!start) start = new Date(d.getTime());
      if (orb < bestOrb) {
        bestOrb = orb;
        peak = new Date(d.getTime());
      }
    } else if (start && !end) {
      end = new Date(d.getTime());
    }
  }

  for (let i = 0; i <= steps; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const lonA = calcTransitLon(aKey, iso);
    const lonB = calcTransitLon(bKey, iso);
    if (lonA == null || lonB == null) continue;
    const signOk = !requireSign
      || ((aSignKey ? signKeyFromLon(lonA) === aSignKey : true)
        && (bSignKey ? signKeyFromLon(lonB) === bSignKey : true));
    const dist = absAngularDistance(lonA, lonB);
    const orb = Math.abs(dist - aspectDeg);
    if (orb <= orbLimit && signOk) {
      if (orb < bestOrb) {
        bestOrb = orb;
        peak = new Date(d.getTime());
      }
      end = new Date(d.getTime());
    } else if (end) {
      break;
    }
  }

  if (!start || !end) return null;
  return { start, end, peak, bestOrb };
}

function findRetrogradeWindow(bodyKey, asOfISO, maxDays = 500) {
  const now = new Date(asOfISO);
  if (Number.isNaN(now.getTime())) return null;

  if (!isRetrograde(bodyKey, asOfISO)) return null;

  let start = null;
  for (let i = 1; i <= maxDays; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = toIsoAtJstNoon(d);
    if (!isRetrograde(bodyKey, iso)) {
      start = new Date(d.getTime() + 86400000);
      break;
    }
  }
  if (!start) start = new Date(now.getTime() - maxDays * 86400000);

  let end = null;
  for (let i = 1; i <= maxDays; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const iso = toIsoAtJstNoon(d);
    if (!isRetrograde(bodyKey, iso)) {
      end = new Date(d.getTime() - 86400000);
      break;
    }
  }
  if (!end) end = new Date(now.getTime() + maxDays * 86400000);

  return { start, end };
}

function moonPhaseDegAt(iso) {
  const sunLon = calcTransitLon("sun", iso);
  const moonLon = calcTransitLon("moon", iso);
  if (!Number.isFinite(Number(sunLon)) || !Number.isFinite(Number(moonLon))) return null;
  return norm360(Number(moonLon) - Number(sunLon));
}

function phaseContNear(iso, ref) {
  const deg = moonPhaseDegAt(iso);
  if (!Number.isFinite(Number(deg))) return null;
  let cont = Number(deg);
  while (cont - ref > 180) cont -= 360;
  while (cont - ref < -180) cont += 360;
  return cont;
}

function findNextMoonPhase(asOfISO, targetDeg, maxDays = 40) {
  if (!asOfISO) return null;
  const start = new Date(asOfISO);
  if (Number.isNaN(start.getTime())) return null;

  const startDeg = moonPhaseDegAt(asOfISO);
  if (!Number.isFinite(Number(startDeg))) return null;

  let target = Number(targetDeg);
  if (!Number.isFinite(target)) return null;
  while (target <= Number(startDeg)) target += 360;

  const stepHours = 6;
  const totalSteps = Math.ceil((maxDays * 24) / stepHours);
  let prevTime = null;
  let prevCont = Number(startDeg);
  let prevOffset = prevCont - target;

  for (let i = 1; i <= totalSteps; i++) {
    const t = new Date(start.getTime() + i * stepHours * 3600 * 1000);
    const cont = phaseContNear(t.toISOString(), prevCont);
    if (!Number.isFinite(Number(cont))) continue;
    const offset = cont - target;

    if (prevOffset * offset <= 0) {
      let left = prevTime || start;
      let right = t;
      let leftCont = prevCont;
      let leftOffset = prevOffset;
      for (let k = 0; k < 24; k++) {
        const mid = new Date((left.getTime() + right.getTime()) / 2);
        const midCont = phaseContNear(mid.toISOString(), leftCont);
        if (!Number.isFinite(Number(midCont))) break;
        const midOffset = midCont - target;
        if (leftOffset * midOffset <= 0) {
          right = mid;
        } else {
          left = mid;
          leftCont = midCont;
          leftOffset = midOffset;
        }
      }
      return right;
    }

    prevTime = t;
    prevCont = cont;
    prevOffset = offset;
  }

  return null;
}

module.exports = {
  jdUtFromIso,
  toIsoAtJstNoon,
  calcTransitLon,
  findAspectWindow,
  findTransitTransitWindow,
  findRetrogradeWindow,
  findNextMoonPhase,
};
