"use strict";

const { DEEP_BODIES } = require("../../domain/astro/constants");

function createTransitsService({ swisseph, signFromLon, toFixedPrecision, norm360, safeNumber }) {
  function jdUtFromIso(asOfISO) {
    const d = new Date(asOfISO);
    if (Number.isNaN(d.getTime())) throw new Error(`invalid as_of ISO: ${asOfISO}`);

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

  const sweConst = (name) => {
    const up = String(name).toUpperCase();
    const low = String(name).toLowerCase();

    // grab common variants
    return (
      swisseph[`SE_${up}`] ??
      swisseph[`SE_${low}`] ??
      swisseph[`SE_${name}`] ??
      swisseph[`SE_${String(name)}`] ??
      swisseph[`SE_${String(name).toUpperCase()}`] ??
      swisseph[`SE_${String(name).toLowerCase()}`] ??
      null
    );
  };

  const BODY_MAP = {
    sun: sweConst("sun"),
    moon: sweConst("moon"),
    mercury: sweConst("mercury"),
    venus: sweConst("venus"),
    mars: sweConst("mars"),
    jupiter: sweConst("jupiter"),
    saturn: sweConst("saturn"),
    uranus: sweConst("uranus"),
    neptune: sweConst("neptune"),
    pluto: sweConst("pluto"),
    chiron: sweConst("chiron"),
    lilith: swisseph.SE_MEAN_APOG ?? sweConst("mean_apog") ?? sweConst("meanapog"),
  };

  for (const [k, v] of Object.entries(BODY_MAP)) {
    if (v === null) throw new Error(`swisseph constant missing for: ${k}`);
  }

  const TRANSIT_TARGETS = Object.keys(BODY_MAP);

  function sweLonDeg(bodyName, jdUt) {
    const id = BODY_MAP[bodyName];
    if (id === undefined) throw new Error(`unsupported body: ${bodyName}`);

    const flags = swisseph.SEFLG_SWIEPH;
    const out = swisseph.swe_calc_ut(jdUt, id, flags);
    if (!out || out.error) throw new Error(`swe_calc_ut failed: ${out?.error || "unknown"}`);

    const lon = typeof out.longitude === "number" ? out.longitude : out.data?.[0];
    if (!Number.isFinite(lon)) throw new Error("invalid lon from swe_calc_ut");

    return norm360(lon);
  }

  function computeTransitsSwiss(asOfISO, precisionDeg = 0.01) {
    const jdUt = jdUtFromIso(asOfISO);

    const bodies = {};
    const bodies_signs = {};
    const optionalBodies = new Set(DEEP_BODIES);

    for (const body of TRANSIT_TARGETS) {
      try {
        const lon = sweLonDeg(body, jdUt);
        const lonFixed = toFixedPrecision(lon, precisionDeg);
        bodies[body] = lonFixed;

        const s = signFromLon(lonFixed);
        bodies_signs[body] = { ...s, lon_deg: lonFixed };
      } catch (err) {
        if (optionalBodies.has(body)) continue;
        throw err;
      }
    }

    const moonLon = bodies.moon;
    const moonSign = typeof moonLon === "number" ? signFromLon(moonLon) : { sign_key: null, sign_ja: null };

    return {
      bodies,
      bodies_signs,
      moon: {
        lon_deg: safeNumber(moonLon),
        sign_key: moonSign.sign_key,
        sign_ja: moonSign.sign_ja,
      },
    };
  }

  return { computeTransitsSwiss };
}

module.exports = { createTransitsService };
