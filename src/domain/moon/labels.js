"use strict";

const { norm360 } = require("../astro_compute");

let signLabelJa = () => "";
try {
  ({ signLabelJa } = require("../../presenters/shared/text/tokens"));
} catch (_err) {
  signLabelJa = (dictObj, key) => {
    const k = String(key || "").toLowerCase();
    return dictObj?.SIGNS?.[k]?.label_ja || dictObj?.SIGNS?.[k]?.label || "";
  };
}

function signLabelFromLon(dict, lon) {
  if (!Number.isFinite(Number(lon))) return "—";
  const order = dict?.SIGNS_V2?.order || dict?.SIGNS?.order || [
    "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
  ];
  const idx = Math.floor((((Number(lon) % 360) + 360) % 360) / 30);
  const key = order[idx];
  return key ? signLabelJa(dict, key) : "—";
}

function signKeyFromLon(dict, lon) {
  if (!Number.isFinite(Number(lon))) return null;
  const order = dict?.SIGNS_V2?.order || dict?.SIGNS?.order || [
    "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
  ];
  const idx = Math.floor(norm360(Number(lon)) / 30);
  return order[idx] || null;
}

function degInSignFromLon(lon) {
  if (!Number.isFinite(Number(lon))) return null;
  const v = Number(lon);
  return ((v % 30) + 30) % 30;
}

module.exports = {
  signLabelJa,
  signLabelFromLon,
  signKeyFromLon,
  degInSignFromLon,
};
