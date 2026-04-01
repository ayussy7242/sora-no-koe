"use strict";

/**
 * channels/x/thread.js
 * - X用 分割（今日の空 / 月相 / 共鳴 / 近日）
 * - 返り値は JSON 文字列（x_1_main / x_2_moon_and_soon / x_3_resonance / x_4_kinjitsu）
 */

const { buildRetrogradeMap } = require("../../domain/astro/retrograde");
const { SPEC } = require("../../config/sora_spec");
const { resolveProximityConfig } = require("../../config/aspect_channel_config");
const { normalizeBodyKey } = require("../../domain/canonical");
const { CORE_PLANETS, EXTENDED_PLANETS, DEEP_BODIES } = require("../../domain/astro/constants");
const {
  formatDateLabel,
  glyphForBody,
  signJa,
  formatAspectDisplay,
  formatElementModalityLines,
} = require("../format/format/common");
const { listWithOrb, sortByOrb } = require("../../domain/aspect_selection");
const { pickApplyingUpcomingAspects } = require("../../domain/astro_compute");
const { isApplying, refinePeakTime } = require("../../domain/aspect_proximity");
const { buildMoonStatus, formatNextMoonLines } = require("../../domain/moon_info");
const { formatMonthDayHm } = require("../../utils/time");
const { joinLines } = require("../../utils/text_format");

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

function renderXThread(story, deps = {}) {
  const dict = deps?.dict || require("../../content/dict");
  const dateLabel = formatDateLabel(story?.meta?.date_local);
  const asOfISO = story?.meta?.as_of || new Date().toISOString();
  const PROXIMITY_CFG = resolveProximityConfig("x_thread", dict);

  const pub = story?.public || {};
  const skyAll = Array.isArray(pub.sky_all) ? pub.sky_all : [];
  const transitSigns = pub.transit_signs || {};

  const bodyOrder = EXTENDED_PLANETS;

  const retroMap = buildRetrogradeMap(asOfISO, bodyOrder);

  // ---------- Part 1: 配置一覧 ----------
  const coreOrder = CORE_PLANETS;
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
  const resonanceCore = new Set(CORE_PLANETS);
  const resonanceDeep = new Set(DEEP_BODIES);
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

  const applyingOnly = PROXIMITY_CFG.preferApplying === true;
  const baseUpcomingItems = (kinjitsuRaw || [])
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
    .filter((row) => !isChironLilith(row.aKey) && !isChironLilith(row.bKey));

  const isApplyingRow = (row) => {
    const base = row.raw || row;
    const aKey = normalizeBodyKey(base?.a || "");
    const bKey = normalizeBodyKey(base?.b || "");
    const aspectDeg = Number(base?.aspect_deg ?? row.aspectDeg);
    if (!aKey || !bKey || !Number.isFinite(aspectDeg)) return false;
    return isApplying({
      kind: PROXIMITY_CFG.kind,
      aKey,
      bKey,
      aspectDeg,
      asOfISO,
      horizonHours: PROXIMITY_CFG.horizonHours,
      nowOrb: base?.orb_deg ?? base?.now_orb ?? row.nowOrb,
    }) === true;
  };

  let upcomingItems = baseUpcomingItems;
  if (applyingOnly) {
    const applyingItems = baseUpcomingItems.filter(isApplyingRow);
    if (applyingItems.length) {
      upcomingItems = applyingItems;
    } else if (PROXIMITY_CFG.fallbackOutsideOrb === false) {
      upcomingItems = [];
    }
  }

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
    .slice(0, Number.isFinite(Number(PROXIMITY_CFG.maxItems)) ? Number(PROXIMITY_CFG.maxItems) : 2);

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
      const refinedPeak = refinePeakTime({
        kind: PROXIMITY_CFG.kind,
        aKey: row.aKey,
        bKey: row.bKey,
        aspectDeg: row.aspectDeg,
        seedISO: row.peakAt,
        fallbackISO: asOfISO,
        windowMs: PROXIMITY_CFG.peakWindowMs,
        stepMs: PROXIMITY_CFG.peakStepMs,
      });
      const peakText = formatMonthDayHm(refinedPeak, { fallback: "-" });

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
