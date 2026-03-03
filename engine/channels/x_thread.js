"use strict";

/**
 * channels/x_thread.js
 * - X用 3分割（今日の空 / 月相+近日 / 今日の共鳴）
 * - 返り値は JSON 文字列（x_1_main / x_2_moon_and_soon / x_3_resonance）
 */

const { buildRetrogradeMap } = require("../astro/retrograde");
const { SPEC } = require("../config/sora_spec");
const { normalizeBodyKey } = require("../domain/canonical");
const {
  formatDateLabel,
  glyphForBody,
  signJa,
  aspectInfo,
  formatElementModalityLines,
} = require("../render_parts/format/line_common");
const { listWithOrb, sortByOrb } = require("../domain/aspect_selection");
const {
  absAngularDistance,
  calcTransitLon,
  findNextMoonPhase,
  pickApplyingUpcomingAspects,
} = require("../domain/astro_compute");
const { toDateLocalJST } = require("../time_utils");

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
  const dict = deps?.dict || require("../../dict");
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

  const sunSign = transitSigns?.sun?.sign_ja || signJa(dict, transitSigns?.sun?.sign_key || "");
  const moonSign = transitSigns?.moon?.sign_ja || signJa(dict, transitSigns?.moon?.sign_key || "");
  const part1Tags = buildTags([sunSign, moonSign]);

  const part1Lines = [
    `🌌 きょうのそら｜${dateLabel}`,
    "",
    ...bodyLines,
    "",
    ...distLines,
    "",
    part1Tags,
  ];

  // ---------- Part 2: 月相 + 近日（接近中） ----------
  const baseDate = new Date(asOfISO || Date.now());
  const baseDateLocal = String(story?.meta?.date_local || "").trim();
  const moonWindowMs = 2 * 86400000;

  const moonCandidates = [
    { kind: "new", emoji: "🌑", label: "新月", deg: 0 },
    { kind: "full", emoji: "🌕", label: "満月", deg: 180 },
  ];

  const moonEvents = [];
  moonCandidates.forEach((c) => {
    const next = findNextMoonPhase(asOfISO, c.deg);
    const prev = findNextMoonPhase(new Date(baseDate.getTime() - moonWindowMs).toISOString(), c.deg);
    [next, prev].forEach((d) => {
      if (!isValidDate(d)) return;
      const exists = moonEvents.some((v) => Math.abs(v.date.getTime() - d.getTime()) < 6 * 3600 * 1000);
      if (exists) return;
      moonEvents.push({ ...c, date: d });
    });
  });

  const moonLines = moonEvents
    .filter((ev) => Math.abs(ev.date.getTime() - baseDate.getTime()) <= moonWindowMs)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((ev) => {
      const dateText = formatJstYmd(ev.date);
      const isToday = baseDateLocal && toDateLocalJST(ev.date) === baseDateLocal;
      return `${ev.emoji} ${ev.label}｜${dateText}${isToday ? "（今日）" : ""}`;
    });

  const kinjitsuRaw = Array.isArray(pub.kinjitsu) && pub.kinjitsu.length
    ? pub.kinjitsu
    : pickApplyingUpcomingAspects({ public: pub }, dict, asOfISO, 6, 3).map((it) => ({
      a: it?.aKey || it?.raw?.a || null,
      b: it?.bKey || it?.raw?.b || null,
      aspect: it?.raw?.type || it?.raw?.aspT || it?.raw?.aspect || null,
      aspect_deg: it?.aspectDeg ?? it?.raw?.aspect_deg ?? null,
      now_orb: it?.nowOrb ?? it?.raw?.orb_deg ?? null,
      peak_at: it?.peak instanceof Date ? it.peak.toISOString() : null,
    }));

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
    .filter((row) => computeApplyingFlag(row.raw || row, asOfISO) === true)
    .sort((a, b) => a.nowOrb - b.nowOrb)
    .slice(0, 3);

  const upcomingLines = upcomingItems.length
    ? upcomingItems.flatMap((row, idx) => {
      const aGlyph = glyphForBody(row.aKey);
      const bGlyph = glyphForBody(row.bKey);
      const aLabel = dict?.PLANETS_V2?.bodies?.[row.aKey]?.label_ja || dict?.POINTS_V1?.points?.[row.aKey]?.label_ja || row.aKey;
      const bLabel = dict?.PLANETS_V2?.bodies?.[row.bKey]?.label_ja || dict?.POINTS_V1?.points?.[row.bKey]?.label_ja || row.bKey;
      const aspect = aspectInfo(dict, row.raw?.aspect || row.raw?.type || row.raw?.aspT, row.aspectDeg);
      const aspectLabel = aspect?.label_ja || String(row.raw?.aspect || row.raw?.type || row.raw?.aspT || "");
      const degText = Number.isFinite(Number(row.aspectDeg)) ? `${Math.round(Number(row.aspectDeg))}°` : "";
      const peakText = row.peakAt && isValidDate(row.peakAt) ? formatMonthDay(row.peakAt) : "-";

      const lines = [
        `★ ${aGlyph ? `${aGlyph} ` : ""}${aLabel} × ${bGlyph ? `${bGlyph} ` : ""}${bLabel}`,
        `${aspectLabel} ${degText}`.trim(),
        `最接近 ${peakText}`,
      ];
      return idx === 0 ? lines : ["", ...lines];
    })
    : ["該当なし"];

  const part2Blocks = [];
  if (moonLines.length) {
    part2Blocks.push(["🌙 月相", "", ...moonLines].join("\n"));
  }
  part2Blocks.push(["📅 近日（接近中）", "", ...upcomingLines].join("\n"));
  part2Blocks.push(buildTags([], { base: BASE_TAGS }));

  const part2Text = part2Blocks.filter(Boolean).join("\n\n");

  // ---------- Part 3: 今日の共鳴（最接近） ----------
  const allWithOrb = listWithOrb(skyAll);
  const aspectPool = allWithOrb.map((row) => ({
    row,
    orb: Number(row?.orb_deg),
    applying: computeApplyingFlag(row, asOfISO),
  }));

  const applyingPool = aspectPool.filter((v) => v.applying === true);
  const pool = applyingPool.length ? applyingPool : aspectPool;
  const pickedItem = pool.sort((a, b) => a.orb - b.orb)[0]?.row || null;

  const resonanceLines = (() => {
    if (!pickedItem) return ["該当なし"];

    const aKey = normalizeBodyKey(pickedItem?.a || "");
    const bKey = normalizeBodyKey(pickedItem?.b || "");

    const aSign = pickedItem?.a_sign_ja || signJa(dict, pickedItem?.a_sign_key || "") || transitSigns?.[aKey]?.sign_ja || "";
    const bSign = pickedItem?.b_sign_ja || signJa(dict, pickedItem?.b_sign_key || "") || transitSigns?.[bKey]?.sign_ja || "";

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

    const aspect = aspectInfo(dict, pickedItem?.type || pickedItem?.aspT || pickedItem?.aspect, pickedItem?.aspect_deg);
    const aspectLabel = aspect?.label_ja || String(pickedItem?.type || pickedItem?.aspT || pickedItem?.aspect || "");
    const aspectDeg = Number.isFinite(Number(pickedItem?.aspect_deg))
      ? Number(pickedItem.aspect_deg)
      : Number.isFinite(Number(aspect?.deg))
        ? Number(aspect.deg)
        : null;
    const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
    const orb = Number.isFinite(Number(pickedItem?.orb_deg)) ? Number(pickedItem.orb_deg) : null;
    const orbText = orb != null ? `${orb.toFixed(1)}` : "-";
    const applying = computeApplyingFlag(pickedItem, asOfISO);
    const trendLabel = applying === false ? "離脱中" : "接近中";

    const elementA = elementLabelFromSign(dict, pickedItem?.a_sign_key || transitSigns?.[aKey]?.sign_key);
    const elementB = elementLabelFromSign(dict, pickedItem?.b_sign_key || transitSigns?.[bKey]?.sign_key);

    return [
      `(T) ${aGlyph ? `${aGlyph} ` : ""}${aLabelR}${aSignText}`,
      "×",
      `(T) ${bGlyph ? `${bGlyph} ` : ""}${bLabelR}${bSignText}`,
      "",
      `${aspectLabel} ${degText}`.trim(),
      `オーブ ${orbText}°（${trendLabel}）`,
      "",
      `${elementA} × ${elementB}`,
    ];
  })();

  let resonanceSigns = [];
  if (pickedItem) {
    const aSign = pickedItem?.a_sign_ja || signJa(dict, pickedItem?.a_sign_key || "");
    const bSign = pickedItem?.b_sign_ja || signJa(dict, pickedItem?.b_sign_key || "");
    resonanceSigns = [aSign, bSign];
  }
  const part3Tags = buildTags(resonanceSigns, { base: ["#ソラのこえ"], max: 3 });

  const part3Text = joinLines([
    "【今日の共鳴（最大接近）】",
    "",
    ...resonanceLines,
    "",
    part3Tags,
  ]);

  const output = {
    x_1_main: joinLines(part1Lines).trim(),
    x_2_moon_and_soon: part2Text.trim(),
    x_3_resonance: part3Text.trim(),
  };

  return JSON.stringify(output, null, 2);
}

module.exports = { renderXThread, THREAD_SEP };
