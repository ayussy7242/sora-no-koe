"use strict";

const { normalizeBodyKey } = require("../canonical");
const { absAngularDistance, calcTransitLon, toIsoAtJstNoon, norm360 } = require("../astro/compute");

const DEFAULT_SIGN_ORDER = [
  "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
];

function toDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveSignOrder(signOrder) {
  return Array.isArray(signOrder) && signOrder.length >= 12
    ? signOrder
    : DEFAULT_SIGN_ORDER;
}

function signKeyFromLon(lon, signOrder) {
  if (!Number.isFinite(Number(lon))) return null;
  const order = resolveSignOrder(signOrder);
  const idx = Math.floor(norm360(Number(lon)) / 30);
  return order[idx] || null;
}

function calcOrbAt({ kind = "transit-transit", aKey, bKey, aspectDeg, iso } = {}) {
  if (kind !== "transit-transit") return null;
  const a = normalizeBodyKey(aKey || "");
  const b = normalizeBodyKey(bKey || "");
  if (!a || !b) return null;
  if (!Number.isFinite(Number(aspectDeg))) return null;
  if (!iso) return null;
  const lonA = calcTransitLon(a, iso);
  const lonB = calcTransitLon(b, iso);
  if (!Number.isFinite(Number(lonA)) || !Number.isFinite(Number(lonB))) return null;
  const dist = absAngularDistance(lonA, lonB);
  return Number.isFinite(Number(dist)) ? Math.abs(dist - Number(aspectDeg)) : null;
}

function isApplying({
  kind = "transit-transit",
  aKey,
  bKey,
  aspectDeg,
  asOfISO,
  horizonHours = 24,
  nowOrb = null,
} = {}) {
  const base = toDate(asOfISO) || new Date();
  if (Number.isNaN(base.getTime())) return null;
  if (kind !== "transit-transit") return null;

  const currentOrb = Number.isFinite(Number(nowOrb))
    ? Number(nowOrb)
    : calcOrbAt({ kind, aKey, bKey, aspectDeg, iso: base.toISOString() });
  if (!Number.isFinite(Number(currentOrb))) return null;

  const tPlus = new Date(base.getTime() + Number(horizonHours) * 3600 * 1000);
  const futureOrb = calcOrbAt({ kind, aKey, bKey, aspectDeg, iso: tPlus.toISOString() });
  if (!Number.isFinite(Number(futureOrb))) return null;

  return futureOrb < currentOrb;
}

function refinePeakTime({
  kind = "transit-transit",
  aKey,
  bKey,
  aspectDeg,
  seedISO = null,
  fallbackISO = null,
  windowMs = 18 * 3600 * 1000,
  stepMs = 5 * 60 * 1000,
} = {}) {
  if (kind !== "transit-transit") return toDate(seedISO);
  const base = toDate(seedISO);
  const fallback = toDate(fallbackISO);
  const center = base || fallback;
  if (!center) return base || null;

  let best = { orb: Infinity, time: center };
  const start = new Date(center.getTime() - windowMs);
  const end = new Date(center.getTime() + windowMs);
  for (let t = start.getTime(); t <= end.getTime(); t += stepMs) {
    const iso = new Date(t).toISOString();
    const orb = calcOrbAt({ kind, aKey, bKey, aspectDeg, iso });
    if (!Number.isFinite(Number(orb))) continue;
    if (orb < best.orb) best = { orb, time: new Date(t) };
  }

  return best.time;
}

function findTransitWindowAroundNow({
  kind = "transit-transit",
  aKey,
  bKey,
  aspectDeg,
  asOfISO,
  maxDays = 400,
  orbLimit = 3,
  requireSign = true,
  signOrder = null,
} = {}) {
  if (kind !== "transit-transit") return null;
  const now = toDate(asOfISO);
  if (!now) return null;

  const a = normalizeBodyKey(aKey || "");
  const b = normalizeBodyKey(bKey || "");
  if (!a || !b) return null;
  if (!Number.isFinite(Number(aspectDeg))) return null;

  const limit = Number.isFinite(Number(orbLimit)) ? Number(orbLimit) : 3;
  const days = Number.isFinite(Number(maxDays)) ? Number(maxDays) : 400;
  const order = resolveSignOrder(signOrder);

  const calcOrb = (iso) => {
    const lonA = calcTransitLon(a, iso);
    const lonB = calcTransitLon(b, iso);
    if (!Number.isFinite(Number(lonA)) || !Number.isFinite(Number(lonB))) return null;
    const dist = absAngularDistance(lonA, lonB);
    return Math.abs(dist - Number(aspectDeg));
  };

  const nowIso = toIsoAtJstNoon(now);
  const nowLonA = nowIso ? calcTransitLon(a, nowIso) : null;
  const nowLonB = nowIso ? calcTransitLon(b, nowIso) : null;
  const nowOrb = nowIso ? calcOrb(nowIso) : null;

  const baseSignA = requireSign && Number.isFinite(Number(nowLonA)) ? signKeyFromLon(nowLonA, order) : null;
  const baseSignB = requireSign && Number.isFinite(Number(nowLonB)) ? signKeyFromLon(nowLonB, order) : null;
  if (requireSign && (!baseSignA || !baseSignB)) return null;
  if (!Number.isFinite(Number(nowOrb)) || Number(nowOrb) > limit) return null;

  const signOk = (lonA, lonB) => {
    if (!requireSign) return true;
    if (!Number.isFinite(Number(lonA)) || !Number.isFinite(Number(lonB))) return false;
    return signKeyFromLon(lonA, order) === baseSignA && signKeyFromLon(lonB, order) === baseSignB;
  };

  let start = new Date(now.getTime());
  let end = new Date(now.getTime());

  for (let i = 1; i <= days; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const orb = iso ? calcOrb(iso) : null;
    const lonA = iso ? calcTransitLon(a, iso) : null;
    const lonB = iso ? calcTransitLon(b, iso) : null;
    if (!signOk(lonA, lonB) || !Number.isFinite(Number(orb)) || Number(orb) > limit) break;
    start = d;
  }

  for (let i = 1; i <= days; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const orb = iso ? calcOrb(iso) : null;
    const lonA = iso ? calcTransitLon(a, iso) : null;
    const lonB = iso ? calcTransitLon(b, iso) : null;
    if (!signOk(lonA, lonB) || !Number.isFinite(Number(orb)) || Number(orb) > limit) break;
    end = d;
  }

  let peak = null;
  let bestOrb = Infinity;
  const totalDays = Math.min(days, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const orb = iso ? calcOrb(iso) : null;
    const lonA = iso ? calcTransitLon(a, iso) : null;
    const lonB = iso ? calcTransitLon(b, iso) : null;
    if (!signOk(lonA, lonB) || !Number.isFinite(Number(orb))) continue;
    if (orb < bestOrb) {
      bestOrb = orb;
      peak = d;
    }
  }

  return { start, end, peak, bestOrb };
}

function findTransitWindowInRange({
  kind = "transit-transit",
  aKey,
  bKey,
  aspectDeg,
  start,
  end,
  orbLimit = 3,
  stepDays = 1,
} = {}) {
  if (kind !== "transit-transit") return null;
  const from = toDate(start);
  const to = toDate(end);
  if (!from || !to) return null;

  const a = normalizeBodyKey(aKey || "");
  const b = normalizeBodyKey(bKey || "");
  if (!a || !b) return null;
  if (!Number.isFinite(Number(aspectDeg))) return null;

  const limit = Number.isFinite(Number(orbLimit)) ? Number(orbLimit) : 3;
  const stepMs = Math.max(1, Number(stepDays) || 1) * 86400000;

  let cur = new Date(from.getTime());
  let startHit = null;
  let endHit = null;
  let peak = null;
  let bestOrb = Infinity;

  while (cur.getTime() < to.getTime()) {
    const iso = toIsoAtJstNoon(cur);
    const orb = iso ? calcOrbAt({ kind, aKey: a, bKey: b, aspectDeg, iso }) : null;
    if (Number.isFinite(Number(orb)) && Number(orb) <= limit) {
      if (!startHit) startHit = new Date(cur.getTime());
      endHit = new Date(cur.getTime());
      if (orb < bestOrb) {
        bestOrb = orb;
        peak = new Date(cur.getTime());
      }
    }
    cur = new Date(cur.getTime() + stepMs);
  }

  if (!startHit || !endHit || bestOrb === Infinity) return null;
  const days = Math.round((endHit.getTime() - startHit.getTime()) / 86400000) + 1;
  return { start: startHit, end: endHit, peak, bestOrb, days };
}

function trendLabelJa(opts = {}) {
  const applying = isApplying(opts);
  if (applying === null) return "";
  return applying ? "接近中" : "離脱中";
}

module.exports = {
  calcOrbAt,
  isApplying,
  refinePeakTime,
  findTransitWindowAroundNow,
  findTransitWindowInRange,
  trendLabelJa,
};
