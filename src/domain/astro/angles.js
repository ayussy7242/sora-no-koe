"use strict";

function norm360(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

function absAngularDistance(a, b) {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
}

function normalizeAngleDiff(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return null;
  const n = ((v + 180) % 360) - 180;
  return n;
}

module.exports = {
  norm360,
  absAngularDistance,
  normalizeAngleDiff,
};
