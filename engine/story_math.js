"use strict";

function norm360(deg) {
  let x = deg % 360;
  if (x < 0) x += 360;
  return x;
}

function absAngularDistance(a, b) {
  const d = Math.abs(norm360(a) - norm360(b));
  return Math.min(d, 360 - d);
}

function toFixedPrecision(n, precisionDeg = 0.01) {
  const p = 1 / precisionDeg;
  return Math.round(n * p) / p;
}

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function safeNumber(x) {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

module.exports = {
  norm360,
  absAngularDistance,
  toFixedPrecision,
  isYYYYMMDD,
  safeNumber,
  clamp,
};
