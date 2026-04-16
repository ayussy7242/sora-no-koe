"use strict";

const { swisseph } = require("../../config/swisseph");
const { jdUtFromIso } = require("./ephemeris");
const { norm360 } = require("./angles");
const { normalizeSignKey } = require("../canonical");

// Root fix: keep houses computations self-contained so Cloud Run can't fail
// due to a bad/cached module export shape. (This should match astro/signs.js)
const SIGN_ORDER = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
];

function signIndexFromKey(dict, signKey) {
  const order = dict?.SIGNS_V2?.order || dict?.SIGNS?.order || SIGN_ORDER;
  const key = normalizeSignKey(signKey);
  return Array.isArray(order) ? order.indexOf(key) : -1;
}

function signKeyFromLon(lon) {
  if (!Number.isFinite(Number(lon))) return null;
  const idx = Math.floor(norm360(Number(lon)) / 30);
  return SIGN_ORDER[idx] || null;
}

const TOKYO_LAT = 35.6895;
const TOKYO_LON = 139.6917;
const HOUSE_SYSTEM_WHOLE_SIGN = "W";
const HOUSE_SYSTEMS = Object.freeze({
  WHOLE_SIGN: "whole_sign",
  CUSPS: "cusps",
});
const HOUSE_BASIS = Object.freeze({
  TRANSIT_PUBLIC: "transit_public",
  NATAL_PERSONAL: "natal_personal",
  TOUCH_TRANSIT: "touch_transit",
  TOUCH_NATAL: "touch_natal",
});

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

function computeTokyoAnglesDeg(asOfISO) {
  if (!swisseph || typeof swisseph.swe_houses !== "function") return { asc: null, mc: null, vertex: null };
  const jdUt = jdUtFromIso(asOfISO);
  if (!Number.isFinite(Number(jdUt))) return { asc: null, mc: null, vertex: null };
  const hsRaw = swisseph.swe_houses(jdUt, TOKYO_LAT, TOKYO_LON, HOUSE_SYSTEM_WHOLE_SIGN);
  const { ascmc } = normalizeHousesResult(hsRaw);
  const { asc, mc, vertex } = pickascmcvertex(ascmc);
  return {
    asc: Number.isFinite(Number(asc)) ? norm360(asc) : null,
    mc: Number.isFinite(Number(mc)) ? norm360(mc) : null,
    vertex: Number.isFinite(Number(vertex)) ? norm360(vertex) : null,
  };
}

function houseNumberForSignIndex(signIndex, ascIndex) {
  if (signIndex < 0 || ascIndex < 0) return null;
  return ((signIndex - ascIndex + 12) % 12) + 1;
}

function normalizeCusps(rawCusps) {
  if (!rawCusps) return null;
  if (ArrayBuffer.isView(rawCusps)) rawCusps = Array.from(rawCusps);
  if (Array.isArray(rawCusps)) {
    const arr = rawCusps
      .map((v) => (Number.isFinite(Number(v)) ? norm360(Number(v)) : null))
      .filter((v) => Number.isFinite(Number(v)));
    if (arr.length === 13) {
      return arr.slice(1, 13);
    }
    if (arr.length === 12) return arr;
  }
  if (typeof rawCusps === "object") {
    const out = [];
    for (let i = 1; i <= 12; i++) {
      const v = rawCusps[i] ?? rawCusps[String(i)];
      if (Number.isFinite(Number(v))) out.push(norm360(Number(v)));
    }
    return out.length === 12 ? out : null;
  }
  return null;
}

function houseNumberForLonWholeSign(lonDeg, ascLonDeg) {
  const lon = Number(lonDeg);
  const asc = Number(ascLonDeg);
  if (!Number.isFinite(lon) || !Number.isFinite(asc)) return null;
  const signIndex = Math.floor(norm360(lon) / 30);
  const ascIndex = Math.floor(norm360(asc) / 30);
  return houseNumberForSignIndex(signIndex, ascIndex);
}

function houseNumberForLonCusps(lonDeg, cuspsRaw) {
  const lon = Number(lonDeg);
  if (!Number.isFinite(lon)) return null;
  const cusps = normalizeCusps(cuspsRaw);
  if (!cusps || cusps.length !== 12) return null;
  const lonNorm = norm360(lon);
  for (let i = 0; i < 12; i++) {
    const start = cusps[i];
    const end = cusps[(i + 1) % 12];
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (start <= end) {
      if (lonNorm >= start && lonNorm < end) return i + 1;
    } else {
      if (lonNorm >= start || lonNorm < end) return i + 1;
    }
  }
  return null;
}

function resolveHouseNumber({
  basis,
  lonDeg,
  signKey,
  ascLonDeg,
  ascSignKey,
  cusps,
  asOfISO,
  dict,
} = {}) {
  const basisKey = String(basis || "").trim();

  const useAscLon = (() => {
    if (Number.isFinite(Number(ascLonDeg))) return Number(ascLonDeg);
    if (asOfISO) {
      const asc = computeTokyoAscDeg(asOfISO);
      return Number.isFinite(Number(asc)) ? Number(asc) : null;
    }
    return null;
  })();

  const resolveWholeSignFromSignKey = (key, ascLon) => {
    const ascKey = ascSignKey || (Number.isFinite(Number(ascLon)) ? signKeyFromLon(ascLon) : null);
    if (!key || !ascKey) return null;
    const ascIndex = signIndexFromKey(dict, ascKey || "");
    const signIndex = signIndexFromKey(dict, key);
    return houseNumberForSignIndex(signIndex, ascIndex);
  };

  if (basisKey === HOUSE_BASIS.TRANSIT_PUBLIC || basisKey === HOUSE_BASIS.TOUCH_TRANSIT) {
    if (signKey) return resolveWholeSignFromSignKey(signKey, useAscLon);
    if (Number.isFinite(Number(lonDeg))) return houseNumberForLonWholeSign(lonDeg, useAscLon);
    return null;
  }

  if (basisKey === HOUSE_BASIS.NATAL_PERSONAL || basisKey === HOUSE_BASIS.TOUCH_NATAL) {
    if (Number.isFinite(Number(lonDeg))) {
      const cuspHouse = houseNumberForLonCusps(lonDeg, cusps);
      if (cuspHouse) return cuspHouse;
      if (Number.isFinite(Number(ascLonDeg))) return houseNumberForLonWholeSign(lonDeg, ascLonDeg);
    }
    return null;
  }

  return null;
}

module.exports = {
  TOKYO_LAT,
  TOKYO_LON,
  HOUSE_SYSTEM_WHOLE_SIGN,
  HOUSE_SYSTEMS,
  HOUSE_BASIS,
  normalizeHousesResult,
  pickascmcvertex,
  computeTokyoAscDeg,
  computeTokyoAnglesDeg,
  houseNumberForSignIndex,
  normalizeCusps,
  houseNumberForLonWholeSign,
  houseNumberForLonCusps,
  resolveHouseNumber,
};
