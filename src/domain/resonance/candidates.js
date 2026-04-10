"use strict";

const { normalizeBodyKey } = require("../canonical");
const { listWithOrb, filterWithinOrb, sortByOrb } = require("../aspect/selection");
const { CORE_PLANETS, DEEP_BODIES } = require("../astro/constants");
const { aspectInfo, signJa } = require("../../presenters/format/format/common");
const { bodyLabelJa } = require("../../presenters/shared/text/tokens");

function resolveResonanceMode(story, resonanceMode) {
  return resonanceMode || story?.meta?.resonance_mode || "core";
}

function splitResonancePools(pool = []) {
  const coreBodies = new Set(CORE_PLANETS);
  const deepBodies = new Set(DEEP_BODIES);
  const corePool = [];
  const deepPool = [];

  for (const row of pool) {
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    if (coreBodies.has(aKey) && coreBodies.has(bKey)) corePool.push(row);
    if (deepBodies.has(aKey) || deepBodies.has(bKey)) deepPool.push(row);
  }

  return { corePool, deepPool };
}

function pickResonanceAspectFromPool(pool = [], opts = {}) {
  const mode = opts.resonanceMode || "core";
  const preferWithinOrb = Number.isFinite(Number(opts.preferWithinOrb)) ? Number(opts.preferWithinOrb) : null;
  const maxOrbDeg = Number.isFinite(Number(opts.maxOrbDeg)) ? Number(opts.maxOrbDeg) : null;
  const useListWithOrb = opts.useListWithOrb === true;

  const list = useListWithOrb ? listWithOrb(pool) : (Array.isArray(pool) ? pool : []);
  if (!list.length) return null;

  const { corePool, deepPool } = splitResonancePools(list);
  const targetPool = mode === "deep"
    ? (deepPool.length ? deepPool : corePool)
    : (corePool.length ? corePool : deepPool);
  if (!targetPool.length) return null;

  const withOrb = targetPool
    .map((row) => ({ row, orb: Number(row?.orb_deg) }))
    .filter((r) => Number.isFinite(r.orb));

  const withinMax = maxOrbDeg != null
    ? withOrb.filter((r) => r.orb <= maxOrbDeg)
    : withOrb;
  if (!withinMax.length) return null;

  if (preferWithinOrb != null) {
    const withinPref = withinMax.filter((r) => r.orb <= preferWithinOrb);
    if (withinPref.length) {
      withinPref.sort((a, b) => a.orb - b.orb);
      return withinPref[0].row;
    }
  }

  withinMax.sort((a, b) => a.orb - b.orb);
  return withinMax[0]?.row || null;
}

function pickPreferredResonanceAspect(story, opts = {}) {
  const preferOutput = opts.preferOutput !== false;
  const preferredAspect = opts.preferOutputAspect || (preferOutput ? story?.outputs?.ig?.source?.resonance_aspect : null);
  if (preferredAspect) return preferredAspect;

  const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const pool = [...skyTop, ...skyAll];
  if (!pool.length) return null;

  const mode = resolveResonanceMode(story, opts.resonanceMode);
  return pickResonanceAspectFromPool(pool, {
    resonanceMode: mode,
    preferWithinOrb: opts.preferWithinOrb ?? 1.0,
  });
}

function pickPrimaryResonanceAspect({ story, dict, maxOrbDeg, resonanceMode } = {}) {
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const mode = resolveResonanceMode(story, resonanceMode);
  const picked = pickResonanceAspectFromPool(skyAll, {
    resonanceMode: mode,
    maxOrbDeg,
    useListWithOrb: true,
  });
  if (!picked) return null;

  const aKey = normalizeBodyKey(picked?.a || "");
  const bKey = normalizeBodyKey(picked?.b || "");
  const aLabel = bodyLabelJa(dict, aKey);
  const bLabel = bodyLabelJa(dict, bKey);
  const aSign = picked?.a_sign_ja || signJa(dict, picked?.a_sign_key || "");
  const bSign = picked?.b_sign_ja || signJa(dict, picked?.b_sign_key || "");
  const aspect = aspectInfo(dict, picked?.type || picked?.aspect || picked?.aspT, picked?.aspect_deg);
  const aspectLabel = aspect?.label_ja || String(picked?.type || picked?.aspect || "");
  const deg = Number.isFinite(Number(picked?.aspect_deg))
    ? Number(picked.aspect_deg)
    : Number.isFinite(Number(aspect?.deg))
      ? Number(aspect.deg)
      : null;
  const orb = Number.isFinite(Number(picked?.orb_deg)) ? Number(picked.orb_deg) : null;

  return {
    raw: picked,
    aKey,
    bKey,
    aLabel,
    bLabel,
    aSign,
    bSign,
    aspectLabel,
    aspectDeg: deg,
    orb,
  };
}

function buildResonanceKey(raw) {
  if (!raw) return "";
  const aKey = normalizeBodyKey(raw?.a || "");
  const bKey = normalizeBodyKey(raw?.b || "");
  const pair = [aKey, bKey].filter(Boolean).sort().join("|");
  const type = String(raw?.type || raw?.aspect || raw?.aspT || "").trim();
  const deg = Number.isFinite(Number(raw?.aspect_deg)) ? Math.round(Number(raw.aspect_deg)) : "";
  const aSign = String(raw?.a_sign_key || "").trim();
  const bSign = String(raw?.b_sign_key || "").trim();
  const signPair = [aSign, bSign].filter(Boolean).sort().join("|");
  return [pair, type, deg, signPair].filter((v) => v !== "").join("|");
}

function listResonanceCandidates({ story, maxOrbDeg, resonanceMode } = {}) {
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const mode = resolveResonanceMode(story, resonanceMode);
  const list = listWithOrb(skyAll);
  if (!list.length) return [];

  const { corePool, deepPool } = splitResonancePools(list);
  const targetPool = mode === "deep"
    ? (deepPool.length ? deepPool : corePool)
    : (corePool.length ? corePool : deepPool);
  if (!targetPool.length) return [];

  const withinMax = Number.isFinite(Number(maxOrbDeg))
    ? filterWithinOrb(targetPool, Number(maxOrbDeg))
    : targetPool;

  return sortByOrb(withinMax);
}

module.exports = {
  resolveResonanceMode,
  splitResonancePools,
  pickResonanceAspectFromPool,
  pickPreferredResonanceAspect,
  pickPrimaryResonanceAspect,
  listResonanceCandidates,
  buildResonanceKey,
};
