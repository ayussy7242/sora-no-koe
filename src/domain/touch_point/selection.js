"use strict";

const { normalizeBodyKey, normalizeAspectKey } = require("../canonical");

function scoreTouchPoints(pool, { orbLimit, scoreForAspect } = {}) {
  if (!Array.isArray(pool)) return [];
  const limit = Number(orbLimit);
  return pool
    .filter((it) => Number.isFinite(Number(it?.orb_deg)))
    .filter((it) => Number(it.orb_deg) <= limit)
    .map((it) => {
      const nKey = normalizeBodyKey(it?.natal_body_or_point || it?.natal_body || it?.a || "");
      const tKey = normalizeBodyKey(it?.transit_body || it?.b || "");
      return {
        item: it,
        nKey,
        tKey,
        score: scoreForAspect ? scoreForAspect({ orb: it?.orb_deg, aKey: nKey, bKey: tKey }) : 0,
      };
    });
}

function sortScoredTouchPoints(scored, { isPaid } = {}) {
  if (!Array.isArray(scored)) return [];
  if (isPaid) {
    return [...scored].sort((a, b) => Number(b.score) - Number(a.score));
  }
  return [...scored].sort((a, b) => Number(a?.item?.orb_deg) - Number(b?.item?.orb_deg));
}

function touchPointKey({ item, nKey, tKey } = {}) {
  const it = item || {};
  const n = nKey || normalizeBodyKey(it?.natal_body_or_point || it?.natal_body || it?.a || "");
  const t = tKey || normalizeBodyKey(it?.transit_body || it?.b || "");
  const aspectDeg = Number.isFinite(Number(it?.aspect_deg)) ? Number(it.aspect_deg) : "";
  const aspectType = normalizeAspectKey(it?.aspect || it?.type || it?.aspectType || it?.aspect_label_ja || "", it?.aspect_deg);
  return [n, t, aspectDeg, aspectType].join("|");
}

function dedupeTouchPoints(sortedScored, { max } = {}) {
  if (!Array.isArray(sortedScored)) return [];
  const picked = [];
  const seen = new Set();
  for (const row of sortedScored) {
    const it = row?.item;
    if (!it) continue;
    const key = touchPointKey({ item: it, nKey: row?.nKey, tKey: row?.tKey });
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(it);
    if (Number.isFinite(Number(max)) && picked.length >= Number(max)) break;
  }
  return picked;
}

module.exports = {
  scoreTouchPoints,
  sortScoredTouchPoints,
  dedupeTouchPoints,
  touchPointKey,
};
