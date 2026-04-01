"use strict";

const { norm360, absAngularDistance } = require("../../domain/astro/angles");
const { clamp } = require("../../utils/data/parse");
const { isYYYYMMDD } = require("../../utils/time");

function toFixedPrecision(n, precisionDeg = 0.01) {
  const p = 1 / precisionDeg;
  return Math.round(n * p) / p;
}

function safeNumber(x) {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

module.exports = {
  norm360,
  absAngularDistance,
  toFixedPrecision,
  isYYYYMMDD,
  safeNumber,
  clamp,
};
