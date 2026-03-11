"use strict";

const dict = require("../content/dict");
const { SPEC } = require("../config/sora_spec");
const { absAngularDistance, calcTransitLon, toIsoAtJstNoon } = require("./astro_compute");
const { normalizeBodyKey, normalizeAspectKey } = require("./canonical");
let bodyLabelJa = () => "";
try {
  ({ bodyLabelJa } = require("../presenters/shared/text/tokens"));
} catch (_err) {
  bodyLabelJa = (dictObj, key) => {
    const k = String(key || "").toLowerCase();
    return dictObj?.BODIES?.[k]?.label_ja || dictObj?.BODIES?.[k]?.label || "";
  };
}

const TSUKIJI_MIN_DAYS = 30;
const TSUKIJI_ORB = SPEC?.orb?.paid ?? 3.0;
const TSUKIJI_MAX = 3;

const TSUKIJI_BODY_THEME = {
  sun: "意志",
  moon: "感情",
  mercury: "思考",
  venus: "愛",
  mars: "行動",
  jupiter: "拡張",
  saturn: "現実",
  uranus: "変革",
  neptune: "理想",
  pluto: "変容",
  chiron: "癒し",
  lilith: "影",
};

function tsukijiThemeForBody(bodyKey) {
  const key = String(bodyKey || "").toLowerCase();
  return TSUKIJI_BODY_THEME[key] || bodyLabelJa(dict, key) || key || "";
}

function buildTsukijiThemeLine(aKey, bKey) {
  const a = tsukijiThemeForBody(aKey);
  const b = tsukijiThemeForBody(bKey);
  if (!a || !b) return "";
  return `構造：${a} × ${b}`;
}

function signKeyFromLon(lon) {
  if (!Number.isFinite(Number(lon))) return null;
  const order = dict?.SIGNS_V2?.order || dict?.SIGNS?.order || [
    "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
  ];
  const idx = Math.floor((((Number(lon) % 360) + 360) % 360) / 30);
  return order[idx] || null;
}

function findTransitWindowAroundNow({ aKey, bKey, aspectDeg, asOfISO, maxDays = 400, orbLimit = 3 }) {
  const now = new Date(asOfISO);
  if (Number.isNaN(now.getTime())) return null;
  if (!Number.isFinite(Number(aspectDeg))) return null;

  const calcOrb = (iso) => {
    const lonA = calcTransitLon(aKey, iso);
    const lonB = calcTransitLon(bKey, iso);
    if (!Number.isFinite(Number(lonA)) || !Number.isFinite(Number(lonB))) return null;
    const dist = absAngularDistance(lonA, lonB);
    return Math.abs(dist - aspectDeg);
  };

  const nowIso = toIsoAtJstNoon(now);
  const nowLonA = nowIso ? calcTransitLon(aKey, nowIso) : null;
  const nowLonB = nowIso ? calcTransitLon(bKey, nowIso) : null;
  const nowOrb = nowIso ? calcOrb(nowIso) : null;
  const baseSignA = Number.isFinite(Number(nowLonA)) ? signKeyFromLon(nowLonA) : null;
  const baseSignB = Number.isFinite(Number(nowLonB)) ? signKeyFromLon(nowLonB) : null;
  if (!baseSignA || !baseSignB) return null;
  if (!Number.isFinite(Number(nowOrb)) || Number(nowOrb) > orbLimit) return null;

  let start = new Date(now.getTime());
  let end = new Date(now.getTime());

  for (let i = 1; i <= maxDays; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const orb = iso ? calcOrb(iso) : null;
    const lonA = iso ? calcTransitLon(aKey, iso) : null;
    const lonB = iso ? calcTransitLon(bKey, iso) : null;
    const signOk = Number.isFinite(Number(lonA)) && Number.isFinite(Number(lonB))
      && signKeyFromLon(lonA) === baseSignA
      && signKeyFromLon(lonB) === baseSignB;
    if (!signOk || !Number.isFinite(Number(orb)) || Number(orb) > orbLimit) break;
    start = d;
  }

  for (let i = 1; i <= maxDays; i++) {
    const d = new Date(now.getTime() + i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const orb = iso ? calcOrb(iso) : null;
    const lonA = iso ? calcTransitLon(aKey, iso) : null;
    const lonB = iso ? calcTransitLon(bKey, iso) : null;
    const signOk = Number.isFinite(Number(lonA)) && Number.isFinite(Number(lonB))
      && signKeyFromLon(lonA) === baseSignA
      && signKeyFromLon(lonB) === baseSignB;
    if (!signOk || !Number.isFinite(Number(orb)) || Number(orb) > orbLimit) break;
    end = d;
  }

  let peak = null;
  let bestOrb = Infinity;
  const totalDays = Math.min(maxDays, Math.ceil((end.getTime() - start.getTime()) / 86400000));
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const iso = toIsoAtJstNoon(d);
    const orb = iso ? calcOrb(iso) : null;
    const lonA = iso ? calcTransitLon(aKey, iso) : null;
    const lonB = iso ? calcTransitLon(bKey, iso) : null;
    const signOk = Number.isFinite(Number(lonA)) && Number.isFinite(Number(lonB))
      && signKeyFromLon(lonA) === baseSignA
      && signKeyFromLon(lonB) === baseSignB;
    if (!signOk || !Number.isFinite(Number(orb))) continue;
    if (orb < bestOrb) {
      bestOrb = orb;
      peak = d;
    }
  }

  return { start, end, peak, bestOrb };
}

function buildTsukijiRowsPublic(story, asOfISO) {
  const longLogs = Array.isArray(story?.public?.kinjitsu_long) ? story.public.kinjitsu_long : [];
  const now = new Date(asOfISO || new Date().toISOString());
  if (Number.isNaN(now.getTime())) return [];

  if (longLogs.length) {
    return longLogs
      .map((row) => ({
        aKey: normalizeBodyKey(row?.a || ""),
        bKey: normalizeBodyKey(row?.b || ""),
        aSignKey: row?.a_sign_key || "",
        bSignKey: row?.b_sign_key || "",
        aSignJa: row?.a_sign_ja || "",
        bSignJa: row?.b_sign_ja || "",
        aspect: normalizeAspectKey(row?.aspect || row?.type, row?.aspect_deg),
        aspectDeg: Number(row?.aspect_deg),
        orb: Number(row?.now_orb),
        start: row?.start_at ? new Date(row.start_at) : null,
        peak: row?.peak_at ? new Date(row.peak_at) : null,
        end: row?.end_at ? new Date(row.end_at) : null,
        durationDays: Number(row?.duration_days),
      }))
      .filter((r) => r.aKey && r.bKey)
      .filter((r) => {
        if (!(r.start instanceof Date) || !(r.end instanceof Date)) return true;
        if (Number.isNaN(r.start.getTime()) || Number.isNaN(r.end.getTime())) return true;
        return r.start <= now && now <= r.end;
      })
      .filter((r) => {
        const duration = Number.isFinite(Number(r.durationDays))
          ? Number(r.durationDays)
          : (r.start && r.end ? Math.ceil((r.end.getTime() - r.start.getTime()) / 86400000) : null);
        return duration == null || duration >= TSUKIJI_MIN_DAYS;
      });
  }

  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const rows = [];
  const seen = new Set();

  skyAll.forEach((row) => {
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    if (!aKey || !bKey) return;
    const sig = [aKey, bKey].sort().join("|");
    if (seen.has(sig)) return;
    seen.add(sig);

    const aspectDeg = Number(row?.aspect_deg);
    if (!Number.isFinite(aspectDeg)) return;
    const window = findTransitWindowAroundNow({
      aKey,
      bKey,
      aspectDeg,
      asOfISO: asOfISO || new Date().toISOString(),
      maxDays: 400,
      orbLimit: TSUKIJI_ORB,
    });
    if (!window?.start || !window?.end) return;
    const durationDays = Math.ceil((window.end.getTime() - window.start.getTime()) / 86400000);
    if (durationDays < TSUKIJI_MIN_DAYS) return;
    if (!(window.start <= now && now <= window.end)) return;

    rows.push({
      aKey,
      bKey,
      aSignKey: row?.a_sign_key || "",
      bSignKey: row?.b_sign_key || "",
      aSignJa: row?.a_sign_ja || "",
      bSignJa: row?.b_sign_ja || "",
      aspect: normalizeAspectKey(row?.type || row?.aspect, aspectDeg),
      aspectDeg,
      orb: Number(row?.orb_deg),
      start: window.start,
      peak: window.peak,
      end: window.end,
      durationDays,
    });
  });

  rows.sort((a, b) => {
    const ao = Number.isFinite(Number(a.orb)) ? Number(a.orb) : 999;
    const bo = Number.isFinite(Number(b.orb)) ? Number(b.orb) : 999;
    return ao - bo;
  });

  return rows.slice(0, TSUKIJI_MAX);
}

function buildKinjitsuRowsPublic(story) {
  const items = Array.isArray(story?.public?.kinjitsu_short)
    ? story.public.kinjitsu_short
    : (Array.isArray(story?.public?.kinjitsu) ? story.public.kinjitsu : []);

  return items
    .filter((it) => Number.isFinite(Number(it?.now_orb)))
    .sort((a, b) => Number(a.now_orb) - Number(b.now_orb))
    .slice(0, 5)
    .map((row) => ({
      aKey: normalizeBodyKey(row?.a || ""),
      bKey: normalizeBodyKey(row?.b || ""),
      aSignKey: row?.a_sign_key || "",
      bSignKey: row?.b_sign_key || "",
      aSignJa: row?.a_sign_ja || "",
      bSignJa: row?.b_sign_ja || "",
      aspect: normalizeAspectKey(row?.aspect || row?.type, row?.aspect_deg),
      aspectDeg: Number(row?.aspect_deg),
      orb: Number(row?.now_orb),
      start: row?.start_at ? new Date(row.start_at) : null,
      peak: row?.peak_at ? new Date(row.peak_at) : null,
      end: row?.end_at ? new Date(row.end_at) : null,
      durationDays: Number(row?.duration_days),
    }))
    .filter((r) => r.aKey && r.bKey);
}

module.exports = { buildTsukijiRowsPublic, buildKinjitsuRowsPublic, buildTsukijiThemeLine };
