"use strict";

function clamp(n, min, max) {
  if (!Number.isFinite(Number(n))) return min;
  return Math.min(max, Math.max(min, Number(n)));
}

module.exports = { clamp };
