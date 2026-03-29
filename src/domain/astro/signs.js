"use strict";

const { normalizeSignKey } = require("../canonical");
const { norm360 } = require("./angles");

const SIGN_ORDER = [
  "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
];

function signIndexFromKey(dict, signKey) {
  const order =
    dict?.SIGNS_V2?.order ||
    dict?.SIGNS?.order ||
    SIGN_ORDER;
  const key = normalizeSignKey(signKey);
  return order.indexOf(key);
}

function signKeyFromLon(lon) {
  if (!Number.isFinite(Number(lon))) return null;
  const idx = Math.floor(norm360(Number(lon)) / 30);
  return SIGN_ORDER[idx] || null;
}

module.exports = {
  SIGN_ORDER,
  signIndexFromKey,
  signKeyFromLon,
};
