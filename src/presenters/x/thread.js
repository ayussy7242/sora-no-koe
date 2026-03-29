"use strict";

/**
 * channels/x/thread.js
 * - X用 分割（今日の空 / 月相 / 共鳴 / 近日）
 * - 返り値は JSON 文字列（x_1_main / x_2_moon_and_soon / x_3_resonance / x_4_kinjitsu）
 */

const { buildRetrogradeMap } = require("../../domain/astro/retrograde");
const { SPEC } = require("../../config/sora_spec");
const { normalizeBodyKey } = require("../../domain/canonical");
const {
  formatDateLabel,
  glyphForBody,
  signJa,
  formatAspectDisplay,
  formatElementModalityLines,
} = require("../format/format/common");
const { listWithOrb, sortByOrb } = require("../../domain/aspect_selection");
const {
  absAngularDistance,
  calcTransitLon,
  pickApplyingUpcomingAspects,
} = require("../../domain/astro_compute");
const { buildMoonStatus, formatNextMoonLines } = require("../../domain/moon_info");
const { toDateLocalJST } = require("../../utils/time_utils");

const THREAD_SEP = "\n\n---\n\n";
const BASE_TAGS = ["#ソラのこえ", "#きょうのそら"];

function buildTags(signs = [], opts = {}) {
  const base = Array.isArray(opts.base) ? opts.base : BASE_TAGS;
  const max = Number.isFinite(Number(opts.max)) ? Number(opts.max) : null;
  const out = [];
  const seen = new Set();
  const push = (tag) => {
    if (!tag) return;
    if (seen.has(tag)) return;
    if (max != null && out.length >= max) return;
    seen.add(tag);
    out.push(tag);
  };
  base.forEach(push);
  signs
    .map((s) => String(s || "").replace(/\s+/g, "").trim())
    .filter(Boolean)
    .forEach((s) => push(`#${s}`));
  return out.join(" ");
}

function makeAspectKey(aKey, bKey, aspectDeg) {
  const a = String(aKey || "").toLowerCase().trim();
  const b = String(bKey || "").toLowerCase().trim();
  const deg = Number(aspectDeg);
  if (!a || !b || !Number.isFinite(deg)) return "";
  const pair = [a, b].sort().join("|");
  return `${pair}|${deg}`;
}

function joinLines(lines = []) {
  return lines.filter((v) => v !== undefined && v !== null).join("\n");
}

function isValidDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

function formatJstYmd(date) {
  const ymd = isValidDate(date) ? toDateLocalJST(date) : null;
  return ymd ? ymd.replace(/-/g, ".") : "-";
}

function formatMonthDay(date) {
  const ymd = isValidDate(date) ? toDateLocalJST(date) : null;
  if (!ymd) return "-";
  const parts = ymd.split("-");
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return "-";
  return `${m}/${d}`;
}

function formatMonthDayHm(date) {
  if (!isValidDate(date)) return "-";
  const ymd = formatMonthDay(date);
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mm = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${ymd} ${hh}:${mm}`;
}

function elementLabelFromSign(dict, signKey) {
  const key = String(signKey || "").toLowerCase().trim();
  const signMeta =
    dict?.SIGNS_V2?.signs?.[key] ||
    dict?.SIGNS_V1?.signs?.[key] ||
    dict?.SIGNS?.signs?.[key] ||
    null;
  const elementKey = signMeta?.element || null;
  const elementLabel = dict?.ELEMENTS_V1?.elements?.[elementKey]?.label_ja || null;
  if (elementLabel) return elementLabel;
  if (elementKey === "fire") return "火";
  if (elementKey === "earth") return "地";
  if (elementKey === "air") return "風";
  if (elementKey === "water") return "水";
  return "？";
}

function computeOrbAt(aKey, bKey, aspectDeg, iso) {
  if (!aKey || !bKey || !Number.isFinite(Number(aspectDeg))) return null;
  const lonA = calcTransitLon(aKey, iso);
  const lonB = calcTransitLon(bKey, iso);
  if (!Number.isFinite(Number(lonA)) || !Number.isFinite(Number(lonB))) return null;
  const dist = absAngularDistance(lonA, lonB);
  return Number.isFinite(Number(dist)) ? Math.abs(dist - Number(aspectDeg)) : null;
}

function refinePeakTime(aKey, bKey, aspectDeg, seed, fallbackISO) {
  const base = seed instanceof Date ? seed : (seed ? new Date(seed) : null);
  const fallback = fallbackISO ? new Date(fallbackISO) : null;
  const center =
    base && !Number.isNaN(base.getTime()) ? base :
    fallback && !Number.isNaN(fallback.getTime()) ? fallback :
    null;
  if (!center) return seed instanceof Date ? seed : null;

  const windowMs = 18 * 3600 * 1000;
  const stepMs = 5 * 60 * 1000;
  let best = { orb: Infinity, time: center };
  const start = new Date(center.getTime() - windowMs);
  const end = new Date(center.getTime() + windowMs);
  for (let t = start.getTime(); t <= end.getTime(); t += stepMs) {
    const iso = new Date(t).toISOString();
    const orb = computeOrbAt(aKey, bKey, aspectDeg, iso);
    if (!Number.isFinite(Number(orb))) continue;
    if (orb < best.orb) best = { orb, time: new Date(t) };
  }
  return best.time;
}

function computeApplyingFlag(row, asOfISO) {
  const nowOrb = Number(row?.orb_deg ?? row?.now_orb);
  const aspectDeg = Number(row?.aspect_deg);
  if (!Number.isFinite(nowOrb) || !Number.isFinite(aspectDeg)) return null;
  const base = new Date(asOfISO || Date.now());
  if (!isValidDate(base)) return null;

  const aKey = normalizeBodyKey(row?.a || "");
  const bKey = normalizeBodyKey(row?.b || "");
  if (!aKey || !bKey) return null;

  const tPlus = new Date(base.getTime() + 24 * 3600 * 1000);
  const orbTomorrow = computeOrbAt(aKey, bKey, aspectDeg, tPlus.toISOString());
  if (!Number.isFinite(Number(orbTomorrow))) return null;
  return orbTomorrow < nowOrb;
}

function renderXThread(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const dateLabel = formatDateLabel(story?.meta?.date_local);
  const asOfISO = story?.meta?.as_of || new Date().toISOString();

  const pub = story?.public || {};
  const skyAll = Array.isArray(pub.sky_all) ? pub.sky_all : [];
  const transitSigns = pub.transit_signs || {};

  const bodyOrder = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","lilith","chiron",
  ];

  const retroMap = buildRetrogradeMap(asOfISO, bodyOrder);

  // ---------- Part 1: 配置一覧 ----------
  const coreOrder = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ];
  const pointOrder = ["lilith","chiron"];

  const renderBodyLine = (k) => {
    let signKey = transitSigns?.[k]?.sign_key || "";
    let signLabel = transitSigns?.[k]?.sign_ja || "";
    if (!signLabel && signKey) signLabel = signJa(dict, signKey || "");
    signLabel = String(signLabel || "").trim();
    if (!signLabel) return "";

    const glyph = glyphForBody(k);
    const bodyJa = (dict?.PLANETS_V2?.bodies?.[k]?.label_ja || dict?.POINTS_V1?.points?.[k]?.label_ja || k).toString();
    const retro = retroMap[k] ? SPEC.retro.suffix : "";
    const bodyText = `${bodyJa}${retro}`;
    const prefix = glyph ? `${glyph} ` : "";
    return `${prefix}${bodyText}｜${signLabel}`;
  };

  const coreLines = coreOrder.map(renderBodyLine).filter(Boolean);
  const pointLines = pointOrder.map(renderBodyLine).filter(Boolean);
  const bodyLines = pointLines.length ? [...coreLines, "", ...pointLines] : coreLines;

  const distLines = formatElementModalityLines(pub.sky_strata || story?.meta?.sky_strata || null);

  const part1Tags = buildTags([], { base: BASE_TAGS, max: BASE_TAGS.length });

  const part1Lines = [
    `🌌 きょうのそら｜${dateLabel}`,
    "",
    ...bodyLines,
    "",
    ...distLines,
    "",
    part1Tags,
  ];

  // ---------- Part 2: 月相 + 今日の共鳴（上位1件） ----------
  const moonLines = (() => {
    const today = buildMoonStatus({ asOfISO, story, dict });
    if (!today?.line1) return [];

    const lines = [];
    lines.push(today.line1);
    if (today.line2) lines.push(today.line2);

    const nextMoon = formatNextMoonLines({ asOfISO, dict });
    const items = nextMoon?.items || [];
    if (items.length) {
      lines.push("", "次の月相");
      items.forEach((item, idx) => {
        if (idx > 0) lines.push("");
        if (item?.line1) lines.push(item.line1);
        if (item?.line2) lines.push(item.line2);
      });
    }

    return lines;
  })();

  const resonanceMode = deps?.resonanceMode || story?.meta?.resonance_mode || "core";
  const resonanceCore = new Set([
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto",
  ]);
  const resonanceDeep = new Set(["lilith", "chiron"]);
  const resonanceAll = listWithOrb(skyAll);
  const coreItems = resonanceAll.filter((row) => {
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    return resonanceCore.has(aKey) && resonanceCore.has(bKey);
  });
  const deepItems = resonanceAll.filter((row) => {
    const aKey = normalizeBodyKey(row?.a || "");
    const bKey = normalizeBodyKey(row?.b || "");
    return resonanceDeep.has(aKey) || resonanceDeep.has(bKey);
  });
  const useDeep = resonanceMode === "deep";
  const resonancePool = useDeep
    ? (deepItems.length ? deepItems : coreItems)
    : (coreItems.length ? coreItems : deepItems);
  const resonanceItems = resonancePool
    .sort((a, b) => Number(a?.orb_deg) - Number(b?.orb_deg))
    .slice(0, 3);

  const resonanceBlocks = resonanceItems.length
    ? resonanceItems.map((item) => {
      const aKey = normalizeBodyKey(item?.a || "");
      const bKey = normalizeBodyKey(item?.b || "");
      const aSign = item?.a_sign_ja || signJa(dict, item?.a_sign_key || "") || transitSigns?.[aKey]?.sign_ja || "";
      const bSign = item?.b_sign_ja || signJa(dict, item?.b_sign_key || "") || transitSigns?.[bKey]?.sign_ja || "";
      const aGlyph = glyphForBody(aKey);
      const bGlyph = glyphForBody(bKey);
      const aLabel = dict?.PLANETS_V2?.bodies?.[aKey]?.label_ja || dict?.POINTS_V1?.points?.[aKey]?.label_ja || aKey;
      const bLabel = dict?.PLANETS_V2?.bodies?.[bKey]?.label_ja || dict?.POINTS_V1?.points?.[bKey]?.label_ja || bKey;
      const aRetro = retroMap[aKey] ? SPEC.retro.suffix : "";
      const bRetro = retroMap[bKey] ? SPEC.retro.suffix : "";
      const aLabelR = `${aLabel}${aRetro}`;
      const bLabelR = `${bLabel}${bRetro}`;
      const aSignText = aSign ? `（${aSign}）` : "";
      const bSignText = bSign ? `（${bSign}）` : "";

      const aspect = formatAspectDisplay({
        dict,
        rawType: item?.type || item?.aspT || item?.aspect,
        aspectDeg: item?.aspect_deg,
        orbDeg: item?.orb_deg,
        orbPrecision: 1,
      });
      const degText = aspect.degText || "";
      const orbText = aspect.orbText ? aspect.orbText.replace(/°$/, "") : "-";

      return [
        `(T) ${aGlyph ? `${aGlyph} ` : ""}${aLabelR}${aSignText}`,
        `× (T) ${bGlyph ? `${bGlyph} ` : ""}${bLabelR}${bSignText}`,
        `${aspect.label} ${degText}`.trim(),
        `現在 オーブ ${orbText}°`,
      ].join("\n");
    })
    : ["該当なし"];

  const primaryResonance = resonanceItems[0] || null;
  const resonanceKeys = new Set(
    resonanceItems
      .map((it) => makeAspectKey(it?.a, it?.b, it?.aspect_deg))
      .filter(Boolean)
  );
  const resonanceSigns = primaryResonance
    ? [
      primaryResonance?.a_sign_ja || signJa(dict, primaryResonance?.a_sign_key || ""),
      primaryResonance?.b_sign_ja || signJa(dict, primaryResonance?.b_sign_key || ""),
    ].filter(Boolean)
    : [];
  const part2Tags = buildTags(resonanceSigns, { base: ["#ソラのこえ"], max: 3 });
  const part2Text = moonLines.join("\n");
  const part3Text = joinLines([
    "【今日の共鳴（最大接近）】",
    "",
    resonanceBlocks.join("\n\n"),
    "",
    part2Tags,
  ]).trim();

  // ---------- Part 3: 近日（接近中） ----------
  const kinjitsuRaw = Array.isArray(pub.kinjitsu) && pub.kinjitsu.length
    ? pub.kinjitsu
    : pickApplyingUpcomingAspects({ public: pub }, dict, asOfISO, 6, 3).map((it) => ({
      a: it?.aKey || it?.raw?.a || null,
      b: it?.bKey || it?.raw?.b || null,
      aspect: it?.raw?.type || it?.raw?.aspT || it?.raw?.aspect || null,
      aspect_deg: it?.aspectDeg ?? it?.raw?.aspect_deg ?? null,
      now_orb: it?.nowOrb ?? it?.raw?.orb_deg ?? null,
      peak_at: it?.peak instanceof Date ? it.peak.toISOString() : null,
      a_sign_key: it?.raw?.a_sign_key || null,
      a_sign_ja: it?.raw?.a_sign_ja || null,
      b_sign_key: it?.raw?.b_sign_key || null,
      b_sign_ja: it?.raw?.b_sign_ja || null,
    }));

  const isChironLilith = (k) => {
    const s = String(k || "").toLowerCase();
    return s === "chiron" || s === "lilith";
  };

  const upcomingItems = (kinjitsuRaw || [])
    .map((row) => {
      const aKey = normalizeBodyKey(row?.a || "");
      const bKey = normalizeBodyKey(row?.b || "");
      const aspectDeg = Number(row?.aspect_deg);
      const nowOrb = Number(row?.now_orb ?? row?.orb_deg);
      const peakAt = row?.peak_at ? new Date(row.peak_at) : null;
      if (!aKey || !bKey || !Number.isFinite(aspectDeg) || !Number.isFinite(nowOrb)) return null;
      return { aKey, bKey, aspectDeg, nowOrb, peakAt, raw: row };
    })
    .filter(Boolean)
    .filter((row) => !isChironLilith(row.aKey) && !isChironLilith(row.bKey))
    .filter((row) => computeApplyingFlag(row.raw || row, asOfISO) === true);

  const seenUpcoming = new Set();
  const filteredUpcoming = upcomingItems
    .filter((row) => {
      const key = makeAspectKey(row.aKey, row.bKey, row.aspectDeg);
      if (!key) return false;
      if (resonanceKeys.size && resonanceKeys.has(key)) return false;
      if (seenUpcoming.has(key)) return false;
      seenUpcoming.add(key);
      return true;
    })
    .sort((a, b) => a.nowOrb - b.nowOrb)
    .slice(0, 2);

  const upcomingLines = filteredUpcoming.length
    ? filteredUpcoming.flatMap((row, idx) => {
      const aGlyph = glyphForBody(row.aKey);
      const bGlyph = glyphForBody(row.bKey);
      const aLabel = dict?.PLANETS_V2?.bodies?.[row.aKey]?.label_ja || dict?.POINTS_V1?.points?.[row.aKey]?.label_ja || row.aKey;
      const bLabel = dict?.PLANETS_V2?.bodies?.[row.bKey]?.label_ja || dict?.POINTS_V1?.points?.[row.bKey]?.label_ja || row.bKey;
      const aSign = row?.raw?.a_sign_ja || signJa(dict, row?.raw?.a_sign_key || "") || transitSigns?.[row.aKey]?.sign_ja || "";
      const bSign = row?.raw?.b_sign_ja || signJa(dict, row?.raw?.b_sign_key || "") || transitSigns?.[row.bKey]?.sign_ja || "";
      const aSignText = aSign ? `（${aSign}）` : "";
      const bSignText = bSign ? `（${bSign}）` : "";
      const aspect = formatAspectDisplay({
        dict,
        rawType: row.raw?.aspect || row.raw?.type || row.raw?.aspT,
        aspectDeg: row.aspectDeg,
      });
      const degText = aspect.degText || "";
      const nowOrbText = Number.isFinite(Number(row.nowOrb)) ? row.nowOrb.toFixed(2) : "-";
      const refinedPeak = refinePeakTime(row.aKey, row.bKey, row.aspectDeg, row.peakAt, asOfISO);
      const peakText = refinedPeak && isValidDate(refinedPeak) ? formatMonthDayHm(refinedPeak) : "-";

      const lines = [
        `★ ${aGlyph ? `${aGlyph} ` : ""}${aLabel}${aSignText} × ${bGlyph ? `${bGlyph} ` : ""}${bLabel}${bSignText}`,
        `${aspect.label} ${degText}`.trim(),
        `現在 オーブ ${nowOrbText}°`,
        `最接近 ${peakText}（JST）`,
      ];
      return idx === 0 ? lines : ["", ...lines];
    })
    : ["該当なし"];

  const part4Text = [
    "📅 近日（接近中）",
    "",
    ...upcomingLines,
    "",
    buildTags([], { base: ["#ソラのこえ"], max: 1 }),
  ].join("\n").trim();

  const output = {
    x_1_main: joinLines(part1Lines).trim(),
    x_2_moon_and_soon: part2Text.trim(),
    x_3_resonance: part3Text.trim(),
    x_4_kinjitsu: part4Text.trim(),
  };

  return JSON.stringify(output, null, 2);
}

module.exports = { renderXThread, THREAD_SEP };
