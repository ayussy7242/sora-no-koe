"use strict";

const { norm360 } = require("../../../../domain/astro/angles");
const { toFixedPrecision, isFiniteNumber } = require("../utils");

/**
 * swe_houses の返り値吸収
 * - cusps: hs.house / hs.cusps / hs.cusp
 * - ascmc: hs.ascmc / hs.ascmc / hs.asc_mc
 */
function normalizeHousesResult(hs) {
  if (!hs || typeof hs !== "object") return { cusps: null, ascmc: null };

  const cusps = hs.house || hs.cusps || hs.cusp || null;
  let ascmc = hs.ascmc || hs.ascmc || hs.asc_mc || null;

  // ascmc が無い場合は ascendant/mc/vertex から作る
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
  // TypedArray(Float64Array等) を配列に変換
  if (ascmc && typeof ascmc === "object" && ArrayBuffer.isView(ascmc)) {
    ascmc = Array.from(ascmc);
  }

  // 1) 配列形式
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

  // 2) オブジェクト形式
  if (ascmc && typeof ascmc === "object") {
    const asc = Number(ascmc.asc ?? ascmc.asc ?? ascmc.asc_deg ?? ascmc[0]);
    const mc = Number(ascmc.mc ?? ascmc.mc ?? ascmc.mc_deg ?? ascmc[1]);
    const vertex = Number(ascmc.vertex ?? ascmc.vertex ?? ascmc.vertex_deg ?? ascmc[3]);
    return {
      asc: Number.isFinite(asc) ? asc : null,
      mc: Number.isFinite(mc) ? mc : null,
      vertex: Number.isFinite(vertex) ? vertex : null,
    };
  }

  return { asc: null, mc: null, vertex: null };
}

// --------------------
// Swiss Ephemeris natal calc
// --------------------
function computeNatalCache({
  swisseph,
  birthUtcIso,
  houseSystem = "P",
  lat,
  lon,
  precisionDeg = 0.01,
  debug = false,
}) {
  if (!swisseph) throw new Error("computeNatalCache requires swisseph");
  if (!birthUtcIso) throw new Error("computeNatalCache requires birthUtcIso");

  const jdUt = (function jdUtFromIso(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error(`invalid ISO: ${iso}`);

    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const hour =
      d.getUTCHours() +
      d.getUTCMinutes() / 60 +
      d.getUTCSeconds() / 3600 +
      d.getUTCMilliseconds() / 3600000;

    return swisseph.swe_julday(y, m, day, hour, swisseph.SE_GREG_CAL);
  })(birthUtcIso);

  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;

  const sweConst = (name) => {
    const n = String(name || "");
    return (
      swisseph[`SE_${n}`] ??
      swisseph[`SE_${n.toUpperCase()}`] ??
      swisseph[`SE_${n.toLowerCase()}`] ??
      null
    );
  };

  const MAP = {
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
  };

  const OPTIONAL_MAP = {
    chiron: sweConst("chiron"),
    lilith: swisseph.SE_MEAN_APOG ?? sweConst("mean_apog") ?? sweConst("meanapog"),
    north_node: sweConst("mean_node") ?? sweConst("true_node") ?? sweConst("truenode"),
  };

  const bodies = {};
  for (const [name, id] of Object.entries(MAP)) {
    if (id == null) throw new Error(`swisseph constant missing for ${name}`);
    const out = swisseph.swe_calc_ut(jdUt, id, flags);
    if (!out || out.error) throw new Error(`swe_calc_ut failed for ${name}: ${out?.error || "unknown"}`);

    const lon1 = typeof out.longitude === "number" ? out.longitude : out.data?.[0];
    if (!Number.isFinite(lon1)) throw new Error(`invalid lon for ${name}`);

    bodies[name] = toFixedPrecision(norm360(lon1), precisionDeg);
  }

  // optional bodies (lilith / chiron) — if calc fails, just skip
  for (const [name, id] of Object.entries(OPTIONAL_MAP)) {
    if (id == null) continue;
    try {
      const out = swisseph.swe_calc_ut(jdUt, id, flags);
      if (!out || out.error) continue;
      const lon1 = typeof out.longitude === "number" ? out.longitude : out.data?.[0];
      if (!Number.isFinite(lon1)) continue;
      bodies[name] = toFixedPrecision(norm360(lon1), precisionDeg);
    } catch (_) {
      // optional: ignore
    }
  }

  // if north_node exists, derive south_node
  if (Number.isFinite(Number(bodies.north_node)) && bodies.south_node == null) {
    bodies.south_node = toFixedPrecision(norm360(Number(bodies.north_node) + 180), precisionDeg);
  }

  let houses = null;
  let engineHouses = null;
  let hsRaw = null;

  if (isFiniteNumber(lat) && isFiniteNumber(lon)) {
    hsRaw = swisseph.swe_houses(jdUt, lat, lon, houseSystem);
    const { cusps, ascmc } = normalizeHousesResult(hsRaw);
    const { asc, mc, vertex } = pickascmcvertex(ascmc);

    houses = {
      system: houseSystem,
      cusps: Array.isArray(cusps)
        ? cusps.map((v) => (typeof v === "number" ? toFixedPrecision(norm360(v), precisionDeg) : v))
        : null,
      angles: {
        asc: Number.isFinite(asc) ? toFixedPrecision(norm360(asc), precisionDeg) : null,
        mc: Number.isFinite(mc) ? toFixedPrecision(norm360(mc), precisionDeg) : null,
        vertex: Number.isFinite(vertex) ? toFixedPrecision(norm360(vertex), precisionDeg) : null,
      },
    };

    engineHouses = {
      system: houseSystem,
      asc_deg: Number.isFinite(asc) ? toFixedPrecision(norm360(asc), precisionDeg) : null,
      mc_deg: Number.isFinite(mc) ? toFixedPrecision(norm360(mc), precisionDeg) : null,
      vertex_deg: Number.isFinite(vertex) ? toFixedPrecision(norm360(vertex), precisionDeg) : null,
    };

    if (debug) {
      console.log("[debug:swe_houses]", {
        keys: hsRaw ? Object.keys(hsRaw) : null,
        ascmc_type: hsRaw?.ascmc ? Object.prototype.toString.call(hsRaw.ascmc) : null,
        ascmc_isArray: Array.isArray(hsRaw?.ascmc),
        ascmc_isView: hsRaw?.ascmc ? ArrayBuffer.isView(hsRaw.ascmc) : null,
        ascmc_len: hsRaw?.ascmc?.length ?? null,
        normalized_ascmc_type: ascmc ? Object.prototype.toString.call(ascmc) : null,
        normalized_ascmc_isArray: Array.isArray(ascmc),
        normalized_ascmc_isView: ascmc ? ArrayBuffer.isView(ascmc) : null,
        normalized_ascmc_len: ascmc?.length ?? null,
        asc, mc, vertex,
      });
    }
  }

  return { jd_ut: jdUt, bodies, houses, engineHouses };
}

// --------------------
// validators
// --------------------
function housesLooksValid(h) {
  if (!h || typeof h !== "object") return false;

  const asc = Number(h.asc_deg);
  const mc = Number(h.mc_deg);

  if (!Number.isFinite(asc) || !Number.isFinite(mc)) return false;
  if (asc < 0 || asc >= 360) return false;
  if (mc < 0 || mc >= 360) return false;
  if (Math.abs(asc - mc) < 1e-9) return false;

  return true;
}

function housesStructLooksValid(h) {
  if (!h || typeof h !== "object") return false;
  const a = h.angles;
  if (!a || typeof a !== "object") return false;

  const asc = Number(a.asc);
  const mc = Number(a.mc);

  if (!Number.isFinite(asc) || !Number.isFinite(mc)) return false;
  if (asc < 0 || asc >= 360) return false;
  if (mc < 0 || mc >= 360) return false;
  if (Math.abs(asc - mc) < 1e-9) return false;

  if (h.cusps != null) {
    if (!Array.isArray(h.cusps)) return false;
    if (h.cusps.length < 12) return false;
  }

  return true;
}

function minBodiesLooksValid(bodies) {
  if (!bodies || typeof bodies !== "object") return false;
  // 太陽〜冥王星が揃ってる想定（10個以上）
  return Object.keys(bodies).length >= 10;
}

function minAnglesLooksValid(a) {
  if (!a || typeof a !== "object") return false;

  const asc = Number(a.asc_deg ?? a.asc ?? a.asc);
  const mc = Number(a.mc_deg ?? a.mc ?? a.mc);

  if (!Number.isFinite(asc) || !Number.isFinite(mc)) return false;
  if (asc < 0 || asc >= 360) return false;
  if (mc < 0 || mc >= 360) return false;
  if (Math.abs(asc - mc) < 1e-9) return false;

  return true;
}

module.exports = {
  computeNatalCache,
  housesLooksValid,
  housesStructLooksValid,
  minBodiesLooksValid,
  minAnglesLooksValid,
};
