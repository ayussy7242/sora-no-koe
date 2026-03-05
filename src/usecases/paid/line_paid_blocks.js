"use strict";

const { isRetrograde, buildRetrogradeMap } = require("../../domain/astro/retrograde");
const { SPEC } = require("../../config/sora_spec");
const { weightForBody, scoreForAspect } = require("../../domain/touch_point_scoring");
const { computeOrbStats } = require("../../domain/aspect_stats");
const { scoreTouchPoints, sortScoredTouchPoints, dedupeTouchPoints, touchPointKey } = require("../../domain/touch_point_selection");
const { normElement, normModality } = require("../../utils/normalize");
const {
  computeTokyoAscDeg,
  signIndexFromKey,
  houseNumberForSignIndex,
  formatDateYmd,
  calcTransitLon,
  findAspectWindow,
  findTransitTransitWindow,
  findRetrogradeWindow,
  formatDateYmdHm,
  findNextMoonPhase,
  pickApplyingUpcomingAspects,
} = require("../../domain/astro_compute");
const {
  glyphForBody,
  signJa,
  aspectInfo,
} = require("../../presenters/format/format/line_common");
const { formatBunpu } = require("../../presenters/channels/line/paid/bunpu");
const { formatHouse } = require("../../presenters/channels/line/paid/house");
const { formatTsukiji } = require("../../presenters/channels/line/paid/tsukiji");
const { formatKinjitsu } = require("../../presenters/channels/line/paid/kinjitsu");
const { formatElements } = require("../../presenters/channels/line/paid/elements");

const SLOW_TRANSITS = new Set(["saturn", "uranus", "neptune", "pluto"]);
const TSUKIJI_MIN_DAYS = SPEC.tsukiji.minDays;
const TSUKIJI_ORB_LIMIT = SPEC.orb.paid;
const TSUKIJI_MAX_ITEMS = SPEC.tsukiji.maxItems;
const TSUKIJI_RETRO_KEYS = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

function buildBunpuTop5(story, dict) {
  const tps = Array.isArray(story?.personal?.touch_points_all)
    ? story.personal.touch_points_all
    : [];

  const asOfISO = story?.meta?.as_of || null;
  const dateLabel = String(story?.meta?.date_local || "").replace(/-/g, ".") || null;

  const scored = sortScoredTouchPoints(
    scoreTouchPoints(tps, { orbLimit: SPEC.orb.paid, scoreForAspect }),
    { isPaid: true }
  );

  const todayPicked = dedupeTouchPoints(
    sortScoredTouchPoints(
      scoreTouchPoints(tps, { orbLimit: SPEC.orb.free, scoreForAspect }),
      { isPaid: false }
    ),
    { max: 3 }
  );
  const excludeKeys = new Set(todayPicked.map((it) => touchPointKey({ item: it })));
  const filtered = scored.filter((row) => !excludeKeys.has(touchPointKey({ item: row.item, nKey: row.nKey, tKey: row.tKey })));
  const ura = filtered
    .slice()
    .sort((a, b) => (a?.item?.orb_deg ?? 99) - (b?.item?.orb_deg ?? 99));

  const stats = computeOrbStats(scored.map((row) => Number(row?.item?.orb_deg)));
  const quality = { same: 0, tension: 0, harmony: 0 };
  const houseCounts = {};
  const elementCounts = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalityCounts = { cardinal: 0, fixed: 0, mutable: 0 };

  const pickSignMeta = (keyRaw) => {
    if (!keyRaw) return null;
    const key = String(keyRaw || "");
    const signs = dict?.SIGNS_V2?.signs || dict?.SIGNS?.signs || {};
    if (signs[key]) return signs[key];
    const low = key.toLowerCase();
    if (signs[low]) return signs[low];
    const hit = Object.keys(signs).find((k) => k.toLowerCase() === low);
    return hit ? signs[hit] : null;
  };

  scored.forEach((row) => {
    const degRaw = Number.isFinite(Number(row?.item?.aspect_deg)) ? Math.round(Number(row.item.aspect_deg)) : null;
    if (degRaw === 0) quality.same += 1;
    else if (degRaw === 90 || degRaw === 180) quality.tension += 1;
    else if (degRaw === 60 || degRaw === 120) quality.harmony += 1;

    const house = Number(row?.item?.house_focus);
    if (Number.isFinite(house) && house >= 1 && house <= 12) {
      houseCounts[house] = (houseCounts[house] || 0) + 1;
    }

    const signKey = row?.item?.natal_sign_key || row?.item?.natal_sign || null;
    const meta = pickSignMeta(signKey);
    const e = normElement(meta?.element);
    const m = normModality(meta?.modality);
    if (e && e !== "unknown") elementCounts[e] = (elementCounts[e] || 0) + 1;
    if (m && m !== "unknown") modalityCounts[m] = (modalityCounts[m] || 0) + 1;
  });

  const retroMap = buildRetrogradeMap(
    asOfISO,
    ura.map((row) => String(row?.item?.transit_body || row?.item?.b || "").toLowerCase()).filter(Boolean)
  );

  return formatBunpu({
    dateLabel: dateLabel || (asOfISO ? formatDateYmd(new Date(asOfISO)) : "-"),
    totalCount: scored.length,
    stats,
    quality,
    houseCounts,
    elementCounts,
    modalityCounts,
    ura,
    retroMap,
    dict,
  });
}

function buildHouseBlock(story, dict, asOfISO) {
  const ascDeg = asOfISO ? computeTokyoAscDeg(asOfISO) : null;
  const ascIndex = Number.isFinite(Number(ascDeg)) ? Math.floor(Number(ascDeg) / 30) : null;

  const transitSigns = story?.public?.transit_signs || {};
  const bodyOrder = [
    "sun","moon","mercury","venus","mars","jupiter","saturn","uranus","neptune","pluto","lilith","chiron",
  ];

  const houseBuckets = new Map();
  for (let i = 1; i <= 12; i++) houseBuckets.set(i, { items: [], score: 0, signKey: null, signJa: null, signGlyph: null });

  const retroMap = buildRetrogradeMap(asOfISO, bodyOrder);

  const signOrder =
    dict?.SIGNS_V2?.order ||
    dict?.SIGNS?.order ||
    [
      "aries",
      "taurus",
      "gemini",
      "cancer",
      "leo",
      "virgo",
      "libra",
      "scorpio",
      "sagittarius",
      "capricorn",
      "aquarius",
      "pisces",
    ];

  if (ascIndex != null && ascIndex >= 0) {
    for (let h = 1; h <= 12; h++) {
      const key = signOrder[(ascIndex + h - 1) % 12];
      const signLabel = signJa(dict, key);
      const bucket = houseBuckets.get(h);
      bucket.signKey = key;
      bucket.signJa = signLabel || "";
    }
  }

  bodyOrder.forEach((key) => {
    const signKeyRaw = transitSigns?.[key]?.sign_key || "";
    const signKey = String(signKeyRaw || "").toLowerCase();
    const signJaLabel = transitSigns?.[key]?.sign_ja || signJa(dict, signKey || "");
    const signIndex = signIndexFromKey(dict, signKey || "");
    if (signIndex < 0 || ascIndex == null) return;
    const houseNo = houseNumberForSignIndex(signIndex, ascIndex);
    if (!houseNo) return;
    const glyph = glyphForBody(key);
    const retro = retroMap[key] ? `${SPEC.retro.joiner}${SPEC.retro.short}` : "";
    const bodyJa = dict?.PLANETS_V2?.bodies?.[key]?.label_ja || dict?.POINTS_V1?.points?.[key]?.label_ja || key;
    const entry = `${bodyJa}（${signJaLabel}${retro}）`;
    const bucket = houseBuckets.get(houseNo);
    bucket.items.push(entry);
    bucket.score += weightForBody(key);
  });

  const rows = [];
  for (let h = 1; h <= 12; h++) {
    const bucket = houseBuckets.get(h);
    if (!bucket) continue;
    rows.push({
      houseNo: h,
      signKey: bucket.signKey,
      signJa: bucket.signJa,
      score: bucket.score,
      items: bucket.items,
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return formatHouse({ rows });
}

function buildTsukijiBlock(story, dict, asOfISO) {
  const baseISO = asOfISO || new Date().toISOString();
  const now = new Date(baseISO);
  if (Number.isNaN(now.getTime())) return ["該当なし"];

  const tps = Array.isArray(story?.personal?.touch_points_all)
    ? story.personal.touch_points_all
    : [];

  const candidates = tps
    .filter((tp) => Number.isFinite(Number(tp?.orb_deg)))
    .filter((tp) => Number(tp.orb_deg) <= TSUKIJI_ORB_LIMIT);

  const approachRows = [];

  candidates.forEach((tp) => {
    const tKey = String(tp?.transit_body || tp?.b || "").toLowerCase();
    const nKey = String(tp?.natal_body_or_point || tp?.natal_body || tp?.a || "").toLowerCase();
    const tSign = tp?.transit_sign_ja || signJa(dict, tp?.transit_sign_key || tp?.transit_sign || "");
    const nSign = tp?.natal_sign_ja || signJa(dict, tp?.natal_sign_key || tp?.natal_sign || "");

    const aspectMeta = aspectInfo(dict, tp?.aspect || tp?.type || tp?.aspectType || tp?.aspect_label_ja, tp?.aspect_deg);
    const aspectDeg = Number.isFinite(Number(tp?.aspect_deg))
      ? Number(tp.aspect_deg)
      : Number.isFinite(Number(aspectMeta?.deg))
        ? Number(aspectMeta.deg)
        : null;
    const orb = Number.isFinite(Number(tp?.orb_deg)) ? Number(tp.orb_deg) : null;

    const window = findAspectWindow({
      transitKey: tKey,
      natalLon: Number(tp?.natal_lon_deg),
      aspectDeg: aspectDeg != null ? aspectDeg : 0,
      asOfISO: baseISO,
      maxDays: 240,
      orbLimit: TSUKIJI_ORB_LIMIT,
    });

    if (!window?.start || !window?.end) return;
    const durationMs = window.end.getTime() - window.start.getTime();
    const durationDays = Math.ceil(durationMs / 86400000);
    if (!Number.isFinite(durationDays) || durationDays < TSUKIJI_MIN_DAYS) return;
    if (!(window.start <= now && now <= window.end)) return;

    const startText = window?.start ? formatDateYmd(window.start) : "-";
    const endText = window?.end ? formatDateYmd(window.end) : "-";
    const remainingDays = Math.max(0, Math.ceil((window.end.getTime() - now.getTime()) / 86400000));

    approachRows.push({
      orb,
      data: {
        aKind: "T",
        bKind: "N",
        aKey: tKey,
        bKey: nKey,
        aSignKey: tp?.transit_sign_key || tp?.transit_sign || null,
        bSignKey: tp?.natal_sign_key || tp?.natal_sign || null,
        aSign: tSign,
        bSign: nSign,
        aspectType: tp?.aspect || tp?.type || tp?.aspectType || tp?.aspect_label_ja || "",
        aspectDeg,
        orb,
        startText,
        endText,
        remainingDays,
      },
    });
  });

  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  skyAll
    .filter((r) => Number.isFinite(Number(r?.orb_deg)))
    .filter((r) => Number(r.orb_deg) <= TSUKIJI_ORB_LIMIT)
    .forEach((r) => {
      const aKey = String(r?.a || "").toLowerCase();
      const bKey = String(r?.b || "").toLowerCase();
      const aspectDeg = Number.isFinite(Number(r?.aspect_deg)) ? Number(r.aspect_deg) : null;
      if (!aKey || !bKey || !Number.isFinite(aspectDeg)) return;

      const window = findTransitTransitWindow({
        aKey,
        bKey,
        aspectDeg,
        asOfISO: baseISO,
        maxDays: 240,
        orbLimit: TSUKIJI_ORB_LIMIT,
      });
      if (!window?.start || !window?.end) return;
      const durationMs = window.end.getTime() - window.start.getTime();
      const durationDays = Math.ceil(durationMs / 86400000);
      if (!Number.isFinite(durationDays) || durationDays < TSUKIJI_MIN_DAYS) return;
      if (!(window.start <= now && now <= window.end)) return;

      const startText = window?.start ? formatDateYmd(window.start) : "-";
      const endText = window?.end ? formatDateYmd(window.end) : "-";
      const remainingDays = Math.max(0, Math.ceil((window.end.getTime() - now.getTime()) / 86400000));

      approachRows.push({
        orb: Number.isFinite(Number(r?.orb_deg)) ? Number(r.orb_deg) : null,
        data: {
          aKind: "T",
          bKind: "T",
          aKey,
          bKey,
          aSignKey: r?.a_sign_key || null,
          bSignKey: r?.b_sign_key || null,
          aSign: r?.a_sign_ja || null,
          bSign: r?.b_sign_ja || null,
          aspectType: r?.type || r?.aspT || r?.aspect || "",
          aspectDeg,
          orb: Number.isFinite(Number(r?.orb_deg)) ? Number(r.orb_deg) : null,
          startText,
          endText,
          remainingDays,
        },
      });
    });

  const approachData = approachRows
    .sort((a, b) => Number(a.orb || 0) - Number(b.orb || 0))
    .map((row) => row.data);

  const uniqApproach = [];
  const seenApproach = new Set();
  approachData.forEach((row) => {
    const key = [
      row?.aKind, row?.bKind,
      row?.aKey, row?.bKey,
      row?.aspectType, row?.aspectDeg,
      row?.aSignKey, row?.bSignKey,
      row?.startText, row?.endText,
    ].join("|");
    if (seenApproach.has(key)) return;
    seenApproach.add(key);
    uniqApproach.push(row);
  });

  const approachLimited = uniqApproach.slice(0, TSUKIJI_MAX_ITEMS);

  const retroData = [];
  TSUKIJI_RETRO_KEYS.forEach((key) => {
    if (!isRetrograde(key, baseISO)) return;
    const window = findRetrogradeWindow(key, baseISO, 500);
    if (!window?.start || !window?.end) return;
    const startText = formatDateYmd(window.start);
    const endText = formatDateYmd(window.end);
    const remainingDays = Math.max(0, Math.ceil((window.end.getTime() - now.getTime()) / 86400000));
    retroData.push({
      bodyKey: key,
      startText,
      endText,
      remainingDays,
    });
  });

  return formatTsukiji({
    approachRows: approachLimited,
    retroRows: retroData,
    dict,
  });
}

function buildElementModalityBlock(story) {
  const skyStrata = story?.public?.sky_strata || story?.meta?.sky_strata || null;
  return formatElements({ skyStrata });
}

function buildKinjitsuBlock(story, dict, asOfISO) {
  // 近日は「リアルタイム起点」を最優先（storyの日時より現在時刻を使う）
  const baseISO = new Date().toISOString();
  const items = pickApplyingUpcomingAspects(story, dict, baseISO, 5);
  const retroMap = buildRetrogradeMap(
    baseISO,
    Array.from(new Set(items.flatMap((it) => [it.aKey, it.bKey]).filter(Boolean)))
  );

  let newMoon = findNextMoonPhase(baseISO, 0);
  let fullMoon = findNextMoonPhase(baseISO, 180);

  if (newMoon && fullMoon && Math.abs(newMoon.getTime() - fullMoon.getTime()) < 6 * 3600 * 1000) {
    const earlier = newMoon.getTime() <= fullMoon.getTime() ? "new" : "full";
    const shiftISO = new Date(Math.min(newMoon.getTime(), fullMoon.getTime()) + 60 * 60 * 1000).toISOString();
    if (earlier === "new") {
      fullMoon = findNextMoonPhase(shiftISO, 180) || fullMoon;
    } else {
      newMoon = findNextMoonPhase(shiftISO, 0) || newMoon;
    }
  }

  const signOrder =
    dict?.SIGNS_V2?.order ||
    dict?.SIGNS?.order ||
    [
      "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
    ];

  const moonEvents = [];
  if (newMoon) moonEvents.push({ kind: "new", date: newMoon });
  if (fullMoon) moonEvents.push({ kind: "full", date: fullMoon });
  moonEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

  const itemsData = items.map((it) => ({
    aKey: it.aKey,
    bKey: it.bKey,
    aSignKey: it.raw?.a_sign_key || null,
    bSignKey: it.raw?.b_sign_key || null,
    aSign: it.raw?.a_sign_ja || null,
    bSign: it.raw?.b_sign_ja || null,
    aRetro: retroMap[it.aKey] || false,
    bRetro: retroMap[it.bKey] || false,
    aspectType: it.raw?.type || it.raw?.aspT || it.raw?.aspect || "",
    aspectDeg: it.aspectDeg,
    nowOrb: it.nowOrb,
    peak: it.peak,
  }));

  const moonEventsData = moonEvents.map((ev) => {
    const lon = calcTransitLon("moon", ev.date.toISOString());
    const idx = Number.isFinite(Number(lon)) ? Math.floor(((lon % 360) + 360) % 360 / 30) : null;
    const signKey = idx != null ? signOrder[idx] : null;
    const signLabel = signKey ? signJa(dict, signKey) : "";
    return {
      kind: ev.kind,
      date: ev.date,
      signKey,
      signJa: signLabel,
    };
  });

  return formatKinjitsu({
    items: itemsData,
    moonEvents: moonEventsData,
    dict,
    formatDateYmdHm,
  });
}

module.exports = {
  buildBunpuTop5,
  buildHouseBlock,
  buildTsukijiBlock,
  buildElementModalityBlock,
  buildKinjitsuBlock,
};
