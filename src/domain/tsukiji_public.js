"use strict";

const dict = require("../content/dict");
const { resolveProximityConfig } = require("../config/aspect_channel_config");
const { findTransitWindowAroundNow, isApplying } = require("./aspect_proximity");
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
const TSUKIJI_MAX = 3;
const TSUKIJI_PROXIMITY_CFG = resolveProximityConfig("tsukiji_public", dict);

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
      kind: TSUKIJI_PROXIMITY_CFG.kind,
      aKey,
      bKey,
      aspectDeg,
      asOfISO: asOfISO || new Date().toISOString(),
      maxDays: TSUKIJI_PROXIMITY_CFG.windowDays,
      orbLimit: TSUKIJI_PROXIMITY_CFG.orbLimit,
      requireSign: TSUKIJI_PROXIMITY_CFG.requireSign,
      signOrder: TSUKIJI_PROXIMITY_CFG.signOrder,
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

  let filtered = rows;
  if (TSUKIJI_PROXIMITY_CFG.preferApplying === true) {
    const applyingRows = rows.filter((row) => {
      if (!row?.aKey || !row?.bKey || !Number.isFinite(Number(row?.aspectDeg))) return false;
      return isApplying({
        kind: TSUKIJI_PROXIMITY_CFG.kind,
        aKey: row.aKey,
        bKey: row.bKey,
        aspectDeg: row.aspectDeg,
        asOfISO,
        horizonHours: TSUKIJI_PROXIMITY_CFG.horizonHours,
        nowOrb: row.orb,
      }) === true;
    });
    if (applyingRows.length) {
      filtered = applyingRows;
    } else if (TSUKIJI_PROXIMITY_CFG.fallbackOutsideOrb === false) {
      filtered = [];
    }
  }

  const maxItems = Number.isFinite(Number(TSUKIJI_PROXIMITY_CFG.maxItems))
    ? Number(TSUKIJI_PROXIMITY_CFG.maxItems)
    : TSUKIJI_MAX;
  return filtered.slice(0, maxItems);
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
