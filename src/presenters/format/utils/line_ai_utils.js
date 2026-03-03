"use strict";

const { normalizeBodyKey } = require("../../../domain/canonical");

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
  lilith: "リリス",
  chiron: "キロン",
};

const planetJa = (dictObj, planetKey) => {
  if (!planetKey) return "";
  const dict = dictObj || {};
  const key = normalizeBodyKey(planetKey);
  const lower = key.toLowerCase();
  const v2 = dict.PLANETS?.bodies || dict.PLANETS_V2?.bodies || null;
  const p =
    v2?.[key] ||
    v2?.[lower] ||
    dict.planets?.[key] ||
    dict.planets?.[lower] ||
    null;
  if (p?.label_ja) return p.label_ja;
  if (PLANET_ALIAS[lower]) return PLANET_ALIAS[lower];
  return key;
};

module.exports = {
  fmtDeg,
  planetJa,
};
