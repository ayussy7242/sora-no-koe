"use strict";

const { calcTransitLon } = require("../astro/ephemeris");
const { absAngularDistance } = require("../astro/angles");
const { normalizeBodyKey, normalizeAspectKey } = require("../canonical");
const { listImportantResonances } = require("./importance");

function isoAtJst(dateLocal, hh = 12, mm = 0) {
  const d = String(dateLocal || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const h = String(Number(hh)).padStart(2, "0");
  const m = String(Number(mm)).padStart(2, "0");
  return `${d}T${h}:${m}:00+09:00`;
}

function orbDegForTransitTransit({ aKey, bKey, aspectDeg, asOfISO, calcTransitLonFn } = {}) {
  const calcLon = typeof calcTransitLonFn === "function" ? calcTransitLonFn : calcTransitLon;
  const aLon = calcLon(aKey, asOfISO);
  const bLon = calcLon(bKey, asOfISO);
  if (!Number.isFinite(Number(aLon)) || !Number.isFinite(Number(bLon))) return null;
  const dist = absAngularDistance(aLon, bLon);
  const target = Number(aspectDeg);
  if (!Number.isFinite(target)) return null;
  return Math.abs(dist - target);
}

/**
 * Pick "today's representative resonance" by scanning within the JST day and
 * choosing the candidate that reaches the smallest orb (approx; step sampling).
 *
 * Notes:
 * - Candidate pool comes from story.public.sky_all (already orb-filtered upstream).
 * - Step is configurable; default 60min keeps it cheap while stable.
 */
function pickResonanceDailyRepresentative({
  story,
  dateLocal,
  resonanceMode = "core",
  maxCandidates = 24,
  stepMinutes = 60,
  calcTransitLonFn = null,
} = {}) {
  if (!story) return { ok: false, error: "story_required" };
  const d = String(dateLocal || story?.meta?.date_local || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: "date_local_required" };

  const candidates = listImportantResonances({
    story,
    resonanceMode,
    // don't pass maxOrbDeg; upstream already filtered
  });
  const pool = Array.isArray(candidates) ? candidates.slice(0, maxCandidates) : [];
  if (!pool.length) return { ok: false, error: "no_candidates" };

  const step = Number.isFinite(Number(stepMinutes)) ? Math.max(5, Number(stepMinutes)) : 60;
  const times = [];
  for (let hh = 0; hh < 24; hh += 1) {
    for (let mm = 0; mm < 60; mm += step) {
      const iso = isoAtJst(d, hh, mm);
      if (iso) times.push(iso);
    }
  }
  if (!times.length) return { ok: false, error: "time_grid_empty" };

  const scored = pool
    .map((item) => {
      const cand = item?.candidate || null;
      const aKey = normalizeBodyKey(cand?.a || "");
      const bKey = normalizeBodyKey(cand?.b || "");
      const aspectDeg = cand?.aspect_deg ?? cand?.deg ?? null;
      const aspectKey = normalizeAspectKey(cand?.type || cand?.aspect, aspectDeg);
      if (!aKey || !bKey || !Number.isFinite(Number(aspectDeg))) return null;

      let bestOrb = Infinity;
      let bestAt = null;
      for (const asOfISO of times) {
        const orb = orbDegForTransitTransit({ aKey, bKey, aspectDeg, asOfISO, calcTransitLonFn });
        if (!Number.isFinite(Number(orb))) continue;
        if (orb < bestOrb) {
          bestOrb = orb;
          bestAt = asOfISO;
        }
      }
      if (!Number.isFinite(bestOrb) || !bestAt) return null;

      return {
        ...item,
        daily_peak: {
          best_orb_deg: bestOrb,
          best_at: bestAt,
          aspect_key: aspectKey || null,
        },
      };
    })
    .filter(Boolean);

  if (!scored.length) return { ok: false, error: "no_peak_scored" };

  scored.sort((a, b) => {
    const ao = Number(a?.daily_peak?.best_orb_deg);
    const bo = Number(b?.daily_peak?.best_orb_deg);
    if (ao !== bo) return ao - bo;
    const as = Number(a?.score) || 0;
    const bs = Number(b?.score) || 0;
    if (bs !== as) return bs - as;
    const ak = String(a?.key || "");
    const bk = String(b?.key || "");
    return ak.localeCompare(bk);
  });

  const best = scored[0];
  return {
    ok: true,
    item: best,
    candidate: best?.candidate || null,
    daily_peak: best?.daily_peak || null,
    list: scored,
  };
}

module.exports = {
  pickResonanceDailyRepresentative,
};
