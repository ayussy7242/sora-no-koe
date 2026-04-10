"use strict";

const { normalizeBodyKey } = require("../canonical");
const { CORE_PLANETS } = require("../astro/constants");
const { buildResonanceKey, resolveResonanceMode, splitResonancePools } = require("./candidates");
const { REASONS } = require("./reasons");
const {
  scoreByOrb,
  scoreByBodies,
  scoreByAspect,
  scoreBySkyTop,
  scoreByRarity,
  scoreByLuminaries,
} = require("./scoring");

const MAJOR_ASPECT_DEGS = new Set([0, 60, 90, 120, 180]);

function normalizeAspectDeg(rawDeg) {
  if (!Number.isFinite(Number(rawDeg))) return null;
  return Math.round(Number(rawDeg));
}

function isMajorAspectByDeg(rawDeg) {
  const deg = normalizeAspectDeg(rawDeg);
  return deg != null && MAJOR_ASPECT_DEGS.has(deg);
}

function buildSkyTopKeySet(skyTop = []) {
  const set = new Set();
  for (const row of skyTop || []) {
    const key = buildResonanceKey(row);
    if (key) set.add(key);
  }
  return set;
}

function scoreImportantResonance({ candidate, inSkyTop } = {}) {
  const orb = Number(candidate?.orb_deg);
  const aKey = normalizeBodyKey(candidate?.a || "");
  const bKey = normalizeBodyKey(candidate?.b || "");
  const isCoreA = !!aKey && CORE_PLANETS.includes(aKey);
  const isCoreB = !!bKey && CORE_PLANETS.includes(bKey);
  const isCorePair = isCoreA && isCoreB;
  const isCoreAny = isCoreA || isCoreB;
  const hasSun = aKey === "sun" || bKey === "sun";
  const hasMoon = aKey === "moon" || bKey === "moon";
  const isSunMoonPair = (aKey === "sun" && bKey === "moon") || (aKey === "moon" && bKey === "sun");
  const aspectDeg = candidate?.aspect_deg ?? candidate?.deg;
  const isMajorAspect = isMajorAspectByDeg(aspectDeg);

  const score =
    scoreByOrb(orb) +
    scoreByBodies({ isCorePair, isCoreAny }) +
    scoreByAspect({ isMajorAspect, aspectDeg }) +
    scoreBySkyTop(inSkyTop) +
    scoreByRarity({ isMajorAspect, orb }) +
    scoreByLuminaries({ hasSun, hasMoon, isSunMoonPair });

  const reasons = [];
  if (Number.isFinite(orb) && orb <= 0.1) reasons.push(REASONS.near_peak);
  if (Number.isFinite(orb) && orb <= 0.4) reasons.push(REASONS.small_orb);
  if (isCorePair) reasons.push(REASONS.major_bodies);
  if (isMajorAspect) reasons.push(REASONS.major_aspect);
  if (inSkyTop) reasons.push(REASONS.in_sky_top);
  if (!isMajorAspect && Number.isFinite(orb) && orb <= 0.2) reasons.push(REASONS.rare_and_sharp);
  if (isSunMoonPair) {
    reasons.push(REASONS.luminary_pair);
  } else if (hasSun || hasMoon) {
    reasons.push(REASONS.luminary);
  }

  return {
    score,
    reasons,
    flags: {
      orb: Number.isFinite(orb) ? Number(orb) : null,
      isCorePair,
      isCoreAny,
      hasSun,
      hasMoon,
      isSunMoonPair,
      isMajorAspect,
      inSkyTop: !!inSkyTop,
    },
  };
}

function classifyImportantResonanceKinds({ flags } = {}) {
  const types = [];
  const orb = Number(flags?.orb);
  const isCorePair = !!flags?.isCorePair;
  const isMajorAspect = !!flags?.isMajorAspect;
  const inSkyTop = !!flags?.inSkyTop;

  if (isCorePair && isMajorAspect && Number.isFinite(orb) && orb <= 0.3) {
    types.push("critical");
  }
  if (isCorePair && Number.isFinite(orb) && orb <= 0.6) {
    types.push("important");
  } else if (isMajorAspect && Number.isFinite(orb) && orb <= 0.6) {
    types.push("important");
  }
  if (inSkyTop || (isMajorAspect && Number.isFinite(orb) && orb <= 1.0)) {
    types.push("representative");
  }
  if (!isMajorAspect && Number.isFinite(orb) && orb <= 0.2) {
    types.push("instant");
  }

  if (!types.length) types.push("representative");
  return Array.from(new Set(types));
}

function listImportantResonances({
  story,
  candidates,
  skyTop,
  maxOrbDeg,
  resonanceMode,
} = {}) {
  const listRaw = Array.isArray(candidates)
    ? candidates
    : (Array.isArray(story?.public?.sky_all) ? story.public.sky_all : []);
  if (!listRaw.length) return [];

  const mode = resolveResonanceMode(story, resonanceMode);
  const { corePool, deepPool } = splitResonancePools(listRaw);
  const list = mode === "deep"
    ? (deepPool.length ? deepPool : corePool)
    : (corePool.length ? corePool : deepPool);
  if (!list.length) return [];

  const skyTopList = Array.isArray(skyTop) ? skyTop : (Array.isArray(story?.public?.sky_top) ? story.public.sky_top : []);
  const skyTopKeys = buildSkyTopKeySet(skyTopList);

  const normalized = list
    .map((candidate) => {
      if (!candidate) return null;
      const orb = Number(candidate?.orb_deg);
      if (Number.isFinite(Number(maxOrbDeg)) && Number.isFinite(orb) && orb > Number(maxOrbDeg)) {
        return null;
      }
      const key = buildResonanceKey(candidate);
      const inSkyTop = key ? skyTopKeys.has(key) : false;
      const scored = scoreImportantResonance({ candidate, inSkyTop });
      const types = classifyImportantResonanceKinds({ flags: scored.flags });
      return {
        key,
        candidate,
        score: scored.score,
        types,
        reasons: scored.reasons,
        flags: scored.flags,
      };
    })
    .filter(Boolean);

  const bestByKey = new Map();
  const withoutKey = [];
  const isBetter = (next, current) => {
    if (!current) return true;
    const nextScore = Number(next?.score) || 0;
    const currentScore = Number(current?.score) || 0;
    if (nextScore !== currentScore) return nextScore > currentScore;
    const nextOrb = Number.isFinite(Number(next?.flags?.orb)) ? Number(next.flags.orb) : Infinity;
    const currentOrb = Number.isFinite(Number(current?.flags?.orb)) ? Number(current.flags.orb) : Infinity;
    return nextOrb < currentOrb;
  };

  for (const item of normalized) {
    if (!item?.key) {
      withoutKey.push(item);
      continue;
    }
    const existing = bestByKey.get(item.key);
    if (!existing || isBetter(item, existing)) {
      bestByKey.set(item.key, item);
    }
  }

  const deduped = [...bestByKey.values(), ...withoutKey];

  deduped.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aOrb = Number.isFinite(Number(a?.flags?.orb)) ? Number(a.flags.orb) : Infinity;
    const bOrb = Number.isFinite(Number(b?.flags?.orb)) ? Number(b.flags.orb) : Infinity;
    if (aOrb !== bOrb) return aOrb - bOrb;
    return String(a.key || "").localeCompare(String(b.key || ""));
  });

  return deduped;
}

module.exports = {
  listImportantResonances,
  classifyImportantResonanceKinds,
  scoreImportantResonance,
};
