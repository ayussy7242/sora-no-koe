"use strict";

const { swisseph } = require("../../config/swisseph");
const { jdUtFromIso } = require("./ephemeris");
const { norm360 } = require("./angles");

const TOKYO_LAT = 35.6895;
const TOKYO_LON = 139.6917;
const HOUSE_SYSTEM_WHOLE_SIGN = "W";

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

function houseNumberForSignIndex(signIndex, ascIndex) {
  if (signIndex < 0 || ascIndex < 0) return null;
  return ((signIndex - ascIndex + 12) % 12) + 1;
}

module.exports = {
  TOKYO_LAT,
  TOKYO_LON,
  HOUSE_SYSTEM_WHOLE_SIGN,
  normalizeHousesResult,
  pickascmcvertex,
  computeTokyoAscDeg,
  houseNumberForSignIndex,
};
