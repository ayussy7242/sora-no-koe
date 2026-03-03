"use strict";

function computeOrbStats(orbs) {
  const list = (orbs || []).map(Number).filter((n) => Number.isFinite(n));
  const count = list.length;
  if (!count) {
    return { count: 0, avg: 0, min: 0, max: 0, bands: { "0-1": 0, "1-2": 0, "2-3": 0 } };
  }
  const avg = list.reduce((a, b) => a + b, 0) / count;
  const min = Math.min(...list);
  const max = Math.max(...list);
  const bands = { "0-1": 0, "1-2": 0, "2-3": 0 };
  list.forEach((o) => {
    if (o < 1) bands["0-1"] += 1;
    else if (o < 2) bands["1-2"] += 1;
    else bands["2-3"] += 1;
  });
  return { count, avg, min, max, bands };
}

function countAspectDegrees(items, getDeg) {
  const counts = new Map();
  (items || []).forEach((item) => {
    const deg = getDeg(item);
    if (deg == null) return;
    counts.set(deg, (counts.get(deg) || 0) + 1);
  });
  return counts;
}

module.exports = { computeOrbStats, countAspectDegrees };
