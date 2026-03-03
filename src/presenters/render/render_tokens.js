"use strict";

const { normalizeBodyKey, normalizeSignKey } = require("../../domain/canonical");

const BODY_GLYPH = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
  chiron: "⚷",
  lilith: "⚸",
  north_node: "☊",
  south_node: "☋",
};

const SIGN_GLYPH = {
  aries: "♈",
  taurus: "♉",
  gemini: "♊",
  cancer: "♋",
  leo: "♌",
  virgo: "♍",
  libra: "♎",
  scorpio: "♏",
  sagittarius: "♐",
  capricorn: "♑",
  aquarius: "♒",
  pisces: "♓",
};

const BODY_ALIAS_JA = {
  asc: "ASC",
  mc: "MC",
  ic: "IC",
  dc: "DC",
  vertex: "Vertex",
  north_node: "北ノード",
  south_node: "南ノード",
};

function bodyGlyph(key) {
  const k = normalizeBodyKey(key);
  return BODY_GLYPH[k] || "";
}

function signGlyph(key) {
  const k = normalizeSignKey(key);
  return SIGN_GLYPH[k] || "";
}

function bodyLabelJa(dict, key) {
  const k = normalizeBodyKey(key);
  if (!k) return "";
  const v2 = dict?.PLANETS_V2?.bodies || dict?.PLANETS?.bodies || null;
  const p =
    v2?.[k] ||
    dict?.planets?.[k] ||
    dict?.POINTS_V1?.points?.[k] ||
    dict?.POINTS?.points?.[k] ||
    null;
  if (p?.label_ja) return p.label_ja;
  if (BODY_ALIAS_JA[k]) return BODY_ALIAS_JA[k];
  return k;
}

function signLabelJa(dict, key) {
  const k = normalizeSignKey(key);
  if (!k) return "";
  return (
    dict?.SIGNS_V2?.signs?.[k]?.label_ja ||
    dict?.SIGNS?.signs?.[k]?.label_ja ||
    dict?.SIGNS_V1?.signs?.[k]?.label_ja ||
    ""
  );
}

module.exports = {
  BODY_GLYPH,
  SIGN_GLYPH,
  bodyGlyph,
  signGlyph,
  bodyLabelJa,
  signLabelJa,
};
