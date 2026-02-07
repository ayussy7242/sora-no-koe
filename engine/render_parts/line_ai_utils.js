"use strict";

const fmtDeg = (deg) => {
  if (deg == null) return "";
  const n = Number(deg);
  if (!Number.isFinite(n)) return "";
  return `${Math.round(n)}°`;
};

const PLANET_ALIAS = {
  asc: "ASC",
  mc: "MC",
  ic: "IC",
  dsc: "DSC",
};

const planetJa = (dictObj, planetKey) => {
  if (!planetKey) return "";
  const dict = dictObj || {};
  const key = String(planetKey || "");
  const lower = key.toLowerCase();
  const v2 = dict.PLANETS_V2?.bodies || null;
  const v1 = dict.PLANETS_V1 || null;
  const p =
    v2?.[key] ||
    v2?.[lower] ||
    dict.planets?.[key] ||
    dict.planets?.[lower] ||
    v1?.[key] ||
    v1?.[lower] ||
    null;
  if (p?.label_ja) return p.label_ja;
  if (PLANET_ALIAS[lower]) return PLANET_ALIAS[lower];
  return key;
};

module.exports = {
  fmtDeg,
  planetJa,
};
