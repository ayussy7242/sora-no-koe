"use strict";

const { swisseph } = require("../../config/swisseph");
const { isRetrograde } = require("../astro/retrograde");

const TOKYO_LAT = 35.6895;
const TOKYO_LON = 139.6917;
const HOUSE_SYSTEM_WHOLE_SIGN = "W";

function norm360(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

function absAngularDistance(a, b) {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}

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

function normalizeHousesResult(hs) {
  if (!hs || typeof hs !== "object") return { cusps: null, ascmc: null };
  const cusps = hs.house || hs.cusps || hs.cusp || null;
  let ascmc = hs.ascmc || hs.ascmc || hs.asc_mc || null;

  if (!ascmc) {
    const asc = typeof hs.ascendant === "number" ? hs.ascendant : null;
    const mc = typeof hs.mc === "number" ? hs.mc : null;
    const vertex = typeof hs.vertex === "number" ? hs.vertex : null;
    if (asc != null || mc != null || vertex != null) {
      ascmc = [asc, mc, hs.armc ?? null, vertex];
    }
  }

  return { cusps, ascmc };
}

function pickascmcvertex(ascmc) {
  if (ascmc && typeof ascmc === "object" && ArrayBuffer.isView(ascmc)) {
    ascmc = Array.from(ascmc);
  }

  if (Array.isArray(ascmc)) {
    const asc = Number(ascmc[0]);
    const mc = Number(ascmc[1]);
    const vertex = Number(ascmc[3]);
    return {
      asc: Number.isFinite(asc) ? asc : null,
      mc: Number.isFinite(mc) ? mc : null,
      vertex: Number.isFinite(vertex) ? vertex : null,
    };
  }

  if (ascmc && typeof ascmc === "object") {
    const asc = Number(ascmc.asc ?? ascmc.asc_deg ?? ascmc[0]);
    const mc = Number(ascmc.mc ?? ascmc.mc_deg ?? ascmc[1]);
    const vertex = Number(ascmc.vertex ?? ascmc.vertex_deg ?? ascmc[3]);
    return {
      asc: Number.isFinite(asc) ? asc : null,
      mc: Number.isFinite(mc) ? mc : null,
      vertex: Number.isFinite(vertex) ? vertex : null,
    };
  }

  return { asc: null, mc: null, vertex: null };
}

function computeTokyoAscDeg(asOfISO) {
  if (!swisseph || typeof swisseph.swe_houses !== "function") return null;
  const jdUt = jdUtFromIso(asOfISO);
  if (!Number.isFinite(Number(jdUt))) return null;
  const hsRaw = swisseph.swe_houses(jdUt, TOKYO_LAT, TOKYO_LON, HOUSE_SYSTEM_WHOLE_SIGN);
  const { ascmc } = normalizeHousesResult(hsRaw);
  const { asc } = pickascmcvertex(ascmc);
  return Number.isFinite(Number(asc)) ? norm360(asc) : null;
}

function signIndexFromKey(dict, signKey) {
  const order =
    dict?.SIGNS_V2?.order ||
    dict?.SIGNS?.order ||
    [
      "aries",
      "taurus",
      "gemini",
      "cancer",
      "leo",
      "virgo",
      "libra",
      "scorpio",
      "sagittarius",
      "capricorn",
      "aquarius",
      "pisces",
    ];
  const key = String(signKey || "").toLowerCase();
  return order.indexOf(key);
}

function houseNumberForSignIndex(signIndex, ascIndex) {
  if (signIndex < 0 || ascIndex < 0) return null;
  return ((signIndex - ascIndex + 12) % 12) + 1;
}

function formatDateYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
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
  const id = map[String(bodyKey || "").toLowerCase()];
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

function findTransitTransitWindow({ aKey, bKey, aspectDeg, asOfISO, maxDays = 240, orbLimit = 3 }) {
  const now = new Date(asOfISO);
  if (Number.isNaN(now.getTime())) return null;

  let start = null;
  let end = null;
  let peak = null;
  let bestOrb = Infinity;

  const steps = maxDays;
  for (let i = steps; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const lonA = calcTransitLon(aKey, iso);
    const lonB = calcTransitLon(bKey, iso);
    if (lonA == null || lonB == null) continue;
    const dist = absAngularDistance(lonA, lonB);
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
    const lonA = calcTransitLon(aKey, iso);
    const lonB = calcTransitLon(bKey, iso);
    if (lonA == null || lonB == null) continue;
    const dist = absAngularDistance(lonA, lonB);
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

function normalizeAngleDiff(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return null;
  const n = ((v + 180) % 360) - 180;
  return n;
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

function findNextMoonPhase(asOfISO, targetDeg, maxDays = 40) {
  if (!asOfISO) return null;
  const start = new Date(asOfISO);
  if (Number.isNaN(start.getTime())) return null;

  const stepHours = 6;
  let prev = null;
  let prevTime = null;

  const totalSteps = Math.ceil((maxDays * 24) / stepHours);
  for (let i = 0; i <= totalSteps; i++) {
    const t = new Date(start.getTime() + i * stepHours * 3600 * 1000);
    const iso = t.toISOString();
    const sunLon = calcTransitLon("sun", iso);
    const moonLon = calcTransitLon("moon", iso);
    if (sunLon == null || moonLon == null) continue;
    const diff = norm360(moonLon - sunLon);
    const offset = normalizeAngleDiff(diff - targetDeg);
    if (offset == null) continue;

    if (prev != null && offset != null && prev * offset <= 0) {
      let left = prevTime;
      let right = t;
      let leftVal = prev;
      let rightVal = offset;
      for (let k = 0; k < 24; k++) {
        const mid = new Date((left.getTime() + right.getTime()) / 2);
        const midIso = mid.toISOString();
        const sunMid = calcTransitLon("sun", midIso);
        const moonMid = calcTransitLon("moon", midIso);
        if (sunMid == null || moonMid == null) break;
        const midDiff = norm360(moonMid - sunMid);
        const midOffset = normalizeAngleDiff(midDiff - targetDeg);
        if (midOffset == null) break;
        if (leftVal * midOffset <= 0) {
          right = mid;
          rightVal = midOffset;
        } else {
          left = mid;
          leftVal = midOffset;
        }
      }
      return right;
    }

    prev = offset;
    prevTime = t;
  }

  return null;
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
  norm360,
  absAngularDistance,
  jdUtFromIso,
  normalizeHousesResult,
  pickascmcvertex,
  computeTokyoAscDeg,
  signIndexFromKey,
  houseNumberForSignIndex,
  formatDateYmd,
  toIsoAtJstNoon,
  calcTransitLon,
  findAspectWindow,
  findTransitTransitWindow,
  findRetrogradeWindow,
  normalizeAngleDiff,
  formatDateYmdHm,
  findNextMoonPhase,
  pickApplyingUpcomingAspects,
};
