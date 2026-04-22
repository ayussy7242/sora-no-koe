"use strict";

const { isRetrograde, buildRetrogradeMap } = require("../../../domain/astro/retrograde");
const { buildNextMoonEvents, orderedMoonEvents, formatMoonEventDisplay } = require("../../../domain/moon");
const { SPEC } = require("../../../config/sora_spec");
const { resolveChannelConfig, resolveProximityConfig } = require("../../../config/aspect_channel_config");
const { ymdInTimeZone } = require("../../../utils/time");
const { scoreForAspect } = require("../../../domain/touch_point/scoring");
const { computeOrbStats } = require("../../../domain/aspect/stats");
const { scoreTouchPoints, sortScoredTouchPoints, dedupeTouchPoints, touchPointKey } = require("../../../domain/touch_point/selection");
const { EXTENDED_PLANETS } = require("../../../domain/astro/constants");
const {
  absAngularDistance,
  calcTransitLon,
  formatDateYmd,
  findAspectWindow,
  findTransitTransitWindow,
  findRetrogradeWindow,
  formatDateYmdHm,
  pickApplyingUpcomingAspects,
} = require("../../../domain/astro/compute");
const { refinePeakTime } = require("../../../domain/aspect/proximity");
const { normalizeAspectKey } = require("../../../domain/canonical");
const {
  glyphForBody,
  signJa,
  formatAspectDisplay,
} = require("../../../presenters/format/format/common");
const { formatBunpu } = require("../../../presenters/line/paid/bunpu");
const { formatHouse } = require("../../../presenters/line/paid/house");
const { formatTsukiji } = require("../../../presenters/line/paid/tsukiji");
const { formatRetrogradeBlock } = require("../../../presenters/line/paid/retrograde");
const { formatSevenDayLog } = require("../../../presenters/line/paid/seven_day_log");
const { formatKinjitsu } = require("../../../presenters/line/paid/kinjitsu");
const { formatElements } = require("../../../presenters/line/paid/elements");
const { formatUra } = require("../../../presenters/line/paid/ura");

const SLOW_TRANSITS = new Set(["saturn", "uranus", "neptune", "pluto"]);
const LINE_PAID_CFG = resolveChannelConfig("line_paid");
const LINE_PAID_PROXIMITY = resolveProximityConfig("line_paid");
const TSUKIJI_MIN_DAYS = LINE_PAID_CFG.tsukijiMinDays ?? SPEC.tsukiji.minDays;
const TSUKIJI_ORB_LIMIT = 2.0;
const TSUKIJI_MAX_ITEMS = 2;
const TSUKIJI_PEAK_WINDOW_DAYS = 5;
const RETROGRADE_LOOKAHEAD_DAYS = 14;
const RETROGRADE_KEYS = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
const SEVEN_DAY_LOG_ORB_LIMIT = 2.0;

function refineTransitNatalPeakTime({ transitKey, natalLon, aspectDeg, seedDate, fallbackISO }) {
  const center = seedDate instanceof Date && !Number.isNaN(seedDate.getTime())
    ? seedDate
    : new Date(fallbackISO);
  if (Number.isNaN(center.getTime()) || !Number.isFinite(Number(natalLon))) return center;
  let best = { orb: Infinity, time: center };
  const windowMs = 18 * 60 * 60 * 1000;
  const stepMs = 5 * 60 * 1000;
  for (let t = center.getTime() - windowMs; t <= center.getTime() + windowMs; t += stepMs) {
    const iso = new Date(t).toISOString();
    const lon = calcTransitLon(transitKey, iso);
    if (!Number.isFinite(Number(lon))) continue;
    const orb = Math.abs(absAngularDistance(lon, Number(natalLon)) - Number(aspectDeg));
    if (orb < best.orb) best = { orb, time: new Date(t) };
  }
  return best.time;
}

function buildBunpuTop5(story, dict) {
  const tps = Array.isArray(story?.personal?.touch_points_all)
    ? story.personal.touch_points_all
    : [];

  const BUNPU_ORB_LIMIT = 2.0;
  const bunpuTouchPoints = tps.filter((tp) => Number.isFinite(Number(tp?.orb_deg)) && Number(tp.orb_deg) <= BUNPU_ORB_LIMIT);
  const asOfISO = story?.meta?.as_of || null;

  const scored = sortScoredTouchPoints(
    scoreTouchPoints(bunpuTouchPoints, { orbLimit: BUNPU_ORB_LIMIT, scoreForAspect }),
    { isPaid: true }
  );

  const todayPicked = dedupeTouchPoints(
    sortScoredTouchPoints(
      scoreTouchPoints(tps, { orbLimit: LINE_PAID_CFG.orbLimitFree ?? SPEC.orb.free, scoreForAspect }),
      { isPaid: false }
    ),
    { max: 3 }
  );
  const excludeKeys = new Set(todayPicked.map((it) => touchPointKey({ item: it })));
  const filtered = scored.filter((row) => !excludeKeys.has(touchPointKey({ item: row.item, nKey: row.nKey, tKey: row.tKey })));
  const uraSorted = filtered
    .slice()
    .sort((a, b) => (a?.item?.orb_deg ?? 99) - (b?.item?.orb_deg ?? 99));
  const ura = [];
  const seenUra = new Set();
  uraSorted.forEach((row) => {
    const it = row?.item || {};
    const nKey = row?.nKey || String(it?.natal_body_or_point || it?.natal_body || it?.a || "").toLowerCase();
    const tKey = row?.tKey || String(it?.transit_body || it?.b || "").toLowerCase();
    const aspectDeg = Number.isFinite(Number(it?.aspect_deg)) ? Math.round(Number(it.aspect_deg)) : "";
    const aspectType = normalizeAspectKey(it?.aspect || it?.type || it?.aspectType || it?.aspect_label_ja || "", it?.aspect_deg);
    const nSignKey = String(it?.natal_sign_key || it?.natal_sign || "").toLowerCase();
    const tSignKey = String(it?.transit_sign_key || it?.transit_sign || "").toLowerCase();
    const key = [nKey, tKey, aspectType, aspectDeg, nSignKey, tSignKey].join("|");
    if (seenUra.has(key)) return;
    seenUra.add(key);
    ura.push(row);
  });

  const stats = computeOrbStats(scored.map((row) => Number(row?.item?.orb_deg)));
  const quality = { same: 0, tension: 0, harmony: 0 };
  const micro = { c30_150: 0, c45_135: 0, c72_144: 0, c40_80_160: 0 };

  scored.forEach((row) => {
    const degRaw = Number.isFinite(Number(row?.item?.aspect_deg)) ? Math.round(Number(row.item.aspect_deg)) : null;
    if (degRaw === 0) quality.same += 1;
    else if (degRaw === 90 || degRaw === 180) quality.tension += 1;
    else if (degRaw === 60 || degRaw === 120) quality.harmony += 1;
    else if (degRaw === 30 || degRaw === 150) micro.c30_150 += 1;
    else if (degRaw === 45 || degRaw === 135) micro.c45_135 += 1;
    else if (degRaw === 72 || degRaw === 144) micro.c72_144 += 1;
    else if (degRaw === 40 || degRaw === 80 || degRaw === 160) micro.c40_80_160 += 1;
  });

  const retroMap = buildRetrogradeMap(
    asOfISO,
    ura.map((row) => String(row?.item?.transit_body || row?.item?.b || "").toLowerCase()).filter(Boolean)
  );

  const bunpuLines = formatBunpu({
    totalCount: scored.length,
    stats,
    quality,
    micro,
  });

  const uraLines = formatUra({ ura, retroMap, dict });

  return { bunpuLines, uraLines };
}

function buildHouseBlock(story, dict, asOfISO) {
  const HOUSE_ORB_LIMIT = 2.0;
  const tps = Array.isArray(story?.personal?.touch_points_all) ? story.personal.touch_points_all : [];
  const houseBuckets = new Map();
  for (let i = 1; i <= 12; i++) houseBuckets.set(i, { houseNo: i, count: 0, score: 0 });

  tps
    .filter((tp) => Number.isFinite(Number(tp?.orb_deg)) && Number(tp.orb_deg) <= HOUSE_ORB_LIMIT)
    .forEach((tp) => {
      const houseNo = Number(
        tp?.natal_house_focus ??
        tp?.house_focus ??
        tp?.natal_house ??
        null
      );
      if (!Number.isFinite(houseNo) || houseNo < 1 || houseNo > 12) return;
      const bucket = houseBuckets.get(houseNo);
      bucket.count += 1;
      bucket.score += 1;
    });

  const rows = [];
  for (let h = 1; h <= 12; h++) {
    const bucket = houseBuckets.get(h);
    if (!bucket) continue;
    rows.push(bucket);
  }

  rows.sort((a, b) => (b.score - a.score) || (a.houseNo - b.houseNo));
  return formatHouse({ rows: rows.filter((row) => row.count > 0).slice(0, 3), dict });
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

  const personalRows = [];

  candidates.forEach((tp) => {
    const tKey = String(tp?.transit_body || tp?.b || "").toLowerCase();
    const nKey = String(tp?.natal_body_or_point || tp?.natal_body || tp?.a || "").toLowerCase();
    const tSign = tp?.transit_sign_ja || signJa(dict, tp?.transit_sign_key || tp?.transit_sign || "");
    const nSign = tp?.natal_sign_ja || signJa(dict, tp?.natal_sign_key || tp?.natal_sign || "");

    const aspectMeta = formatAspectDisplay({
      dict,
      rawType: tp?.aspect || tp?.type || tp?.aspectType || tp?.aspect_label_ja,
      aspectDeg: tp?.aspect_deg,
      orbDeg: tp?.orb_deg,
    });
    const aspectDeg = Number.isFinite(Number(aspectMeta?.deg)) ? Number(aspectMeta.deg) : null;
    const orb = Number.isFinite(Number(aspectMeta?.orb)) ? Number(aspectMeta.orb) : null;
    const aspectTypeNorm = normalizeAspectKey(
      tp?.aspect || tp?.type || tp?.aspectType || tp?.aspect_label_ja || "",
      aspectDeg
    );

    const window = findAspectWindow({
      transitKey: tKey,
      natalLon: Number(tp?.natal_lon_deg),
      aspectDeg: aspectDeg != null ? aspectDeg : 0,
      asOfISO: baseISO,
      maxDays: 240,
      orbLimit: TSUKIJI_ORB_LIMIT,
    });

    if (!window?.peak) return;
    const peakAt = refineTransitNatalPeakTime({
      transitKey: tKey,
      natalLon: Number(tp?.natal_lon_deg),
      aspectDeg,
      seedDate: window.peak,
      fallbackISO: baseISO,
    });
    const diffDays = Math.abs((peakAt.getTime() - now.getTime()) / 86400000);
    if (diffDays > TSUKIJI_PEAK_WINDOW_DAYS) return;

    personalRows.push({
      aKind: "T",
      bKind: "N",
      aKey: tKey,
      bKey: nKey,
      aSignKey: tp?.transit_sign_key || tp?.transit_sign || null,
      bSignKey: tp?.natal_sign_key || tp?.natal_sign || null,
      aSign: tSign,
      bSign: nSign,
      aspectType: aspectTypeNorm,
      aspectDeg,
      orbDeg: orb,
      peakAt,
    });
  });

  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const skyRows = [];
  skyAll
    .filter((r) => Number.isFinite(Number(r?.orb_deg)))
    .filter((r) => Number(r.orb_deg) <= TSUKIJI_ORB_LIMIT)
    .forEach((r) => {
      const aKey = String(r?.a || "").toLowerCase();
      const bKey = String(r?.b || "").toLowerCase();
      const aspectDeg = Number.isFinite(Number(r?.aspect_deg)) ? Number(r.aspect_deg) : null;
      if (!aKey || !bKey || !Number.isFinite(aspectDeg)) return;
      const aspectTypeNorm = normalizeAspectKey(r?.type || r?.aspT || r?.aspect || "", aspectDeg);

      const window = findTransitTransitWindow({
        aKey,
        bKey,
        aspectDeg,
        asOfISO: baseISO,
        maxDays: 240,
        orbLimit: TSUKIJI_ORB_LIMIT,
      });
      if (!window?.peak) return;
      const peakAt = refinePeakTime({
        kind: "transit-transit",
        aKey,
        bKey,
        aspectDeg,
        seedISO: window.peak.toISOString(),
        fallbackISO: baseISO,
        windowMs: 18 * 60 * 60 * 1000,
        stepMs: 5 * 60 * 1000,
      });
      const diffDays = Math.abs((peakAt.getTime() - now.getTime()) / 86400000);
      if (diffDays > TSUKIJI_PEAK_WINDOW_DAYS) return;

      skyRows.push({
        aKind: "T",
        bKind: "T",
        aKey,
        bKey,
        aSignKey: r?.a_sign_key || null,
        bSignKey: r?.b_sign_key || null,
        aSign: r?.a_sign_ja || null,
        bSign: r?.b_sign_ja || null,
        aspectType: aspectTypeNorm,
        aspectDeg,
        orbDeg: Number.isFinite(Number(r?.orb_deg)) ? Number(r.orb_deg) : null,
        peakAt,
      });
    });

  const sortPeak = (rows) => rows
    .slice()
    .sort((a, b) => {
      const da = a?.peakAt instanceof Date ? a.peakAt.getTime() : Infinity;
      const db = b?.peakAt instanceof Date ? b.peakAt.getTime() : Infinity;
      if (da !== db) return da - db;
      const oa = Number(a?.orbDeg ?? 99);
      const ob = Number(b?.orbDeg ?? 99);
      return oa - ob;
    })
    .slice(0, TSUKIJI_MAX_ITEMS);

  return formatTsukiji({
    personalRows: sortPeak(personalRows),
    skyRows: sortPeak(skyRows),
    dict,
  });
}

function findNextRetrogradeStart(bodyKey, baseISO, maxDays = 500) {
  const base = new Date(baseISO);
  if (Number.isNaN(base.getTime())) return null;
  const todayIso = toIsoAtJstNoon(base);
  if (!todayIso) return null;
  let prevRetro = isRetrograde(bodyKey, todayIso);
  for (let i = 1; i <= maxDays; i += 1) {
    const day = new Date(base.getTime() + i * 86400000);
    const iso = toIsoAtJstNoon(day);
    if (!iso) continue;
    const currentRetro = isRetrograde(bodyKey, iso);
    if (!prevRetro && currentRetro) return day;
    prevRetro = currentRetro;
  }
  return null;
}

function buildRetrogradeOnlyBlock(dict, asOfISO) {
  const baseISO = asOfISO || new Date().toISOString();

  const activeRows = RETROGRADE_KEYS
    .filter((key) => isRetrograde(key, baseISO))
    .map((bodyKey) => {
      const window = findRetrogradeWindow(bodyKey, baseISO, 500);
      if (!window?.start || !window?.end) return null;
      return { bodyKey, startDate: window.start, endDate: window.end };
    })
    .filter(Boolean)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const upcomingRows = RETROGRADE_KEYS
    .filter((key) => !isRetrograde(key, baseISO))
    .map((bodyKey) => {
      const startDate = findNextRetrogradeStart(bodyKey, baseISO, 500);
      if (!startDate) return null;
      const daysUntil = Math.ceil((startDate.getTime() - new Date(baseISO).getTime()) / 86400000);
      if (!Number.isFinite(daysUntil) || daysUntil < 0 || daysUntil > RETROGRADE_LOOKAHEAD_DAYS) return null;
      const window = findRetrogradeWindow(bodyKey, startDate.toISOString(), 500);
      if (!window?.start || !window?.end) return null;
      return { bodyKey, startDate: window.start, endDate: window.end };
    })
    .filter(Boolean)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .slice(0, 2);

  return formatRetrogradeBlock({ activeRows, upcomingRows, dict });
}

function normalizeSevenDayTouchPoint(tp, dict) {
  const transitKey = String(tp?.transit_body || tp?.b || "").toLowerCase();
  const natalKey = String(tp?.natal_body_or_point || tp?.natal_body || tp?.a || "").toLowerCase();
  const transitLabel = dict?.PLANETS_V2?.bodies?.[transitKey]?.label_ja || dict?.POINTS_V1?.points?.[transitKey]?.label_ja || transitKey;
  const natalLabel = dict?.PLANETS_V2?.bodies?.[natalKey]?.label_ja || dict?.POINTS_V1?.points?.[natalKey]?.label_ja || natalKey;
  const transitSignJa = tp?.transit_sign_ja || signJa(dict, tp?.transit_sign_key || tp?.transit_sign || "");
  const natalSignJa = tp?.natal_sign_ja || signJa(dict, tp?.natal_sign_key || tp?.natal_sign || "");
  const aspectDeg = Number.isFinite(Number(tp?.aspect_deg)) ? Math.round(Number(tp.aspect_deg)) : null;
  const orbDeg = Number(tp?.orb_deg);
  return {
    transitLabel,
    natalLabel,
    transitSign: transitSignJa ? `（${transitSignJa}）` : "",
    natalSign: natalSignJa ? `（${natalSignJa}）` : "",
    aspectDeg,
    orbDeg,
  };
}

function countElementsAndModalities(items, dict) {
  const elementCounts = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalityCounts = { cardinal: 0, fixed: 0, mutable: 0 };
  (items || []).forEach((tp) => {
    const signKeys = [
      String(tp?.natal_sign_key || tp?.natal_sign || "").toLowerCase(),
      String(tp?.transit_sign_key || tp?.transit_sign || "").toLowerCase(),
    ].filter(Boolean);
    signKeys.forEach((signKey) => {
      const meta = dict?.SIGNS_V2?.signs?.[signKey] || dict?.SIGNS?.signs?.[signKey] || null;
      const element = meta?.element || null;
      const modality = meta?.modality || null;
      if (element && Object.prototype.hasOwnProperty.call(elementCounts, element)) elementCounts[element] += 1;
      if (modality && Object.prototype.hasOwnProperty.call(modalityCounts, modality)) modalityCounts[modality] += 1;
    });
  });
  return { elementCounts, modalityCounts };
}

async function buildSevenDayLogBlock({ storyBuilder, appUserId, centerDateLocal, dict, offsets = [-6, -5, -4, -3, -2, -1, 0], title = "🌌 ななにちログ" }) {
  const center = new Date(`${centerDateLocal}T00:00:00+09:00`);
  if (Number.isNaN(center.getTime())) return ["該当なし"];

  const resonanceRows = [];
  const elementRows = [];
  const modalityRows = [];

  for (const offset of offsets) {
    const date = new Date(center.getTime() + offset * 86400000);
    const dateLocal = ymdInTimeZone(date, "Asia/Tokyo");
    const built = await storyBuilder({ appUserId, dateLocal });
    const story = built?.story || null;
    const tps = Array.isArray(story?.personal?.touch_points_all) ? story.personal.touch_points_all : [];
    const within = tps
      .filter((tp) => Number.isFinite(Number(tp?.orb_deg)) && Number(tp.orb_deg) <= SEVEN_DAY_LOG_ORB_LIMIT)
      .sort((a, b) => Number(a.orb_deg) - Number(b.orb_deg));
    const top = within[0] ? normalizeSevenDayTouchPoint(within[0], dict) : null;
    const { elementCounts, modalityCounts } = countElementsAndModalities(within, dict);

    resonanceRows.push({ dateLocal, item: top });
    elementRows.push({
      dateLocal,
      fire: elementCounts.fire,
      earth: elementCounts.earth,
      air: elementCounts.air,
      water: elementCounts.water,
    });
    modalityRows.push({
      dateLocal,
      cardinal: modalityCounts.cardinal,
      fixed: modalityCounts.fixed,
      mutable: modalityCounts.mutable,
    });
  }

  return formatSevenDayLog({ title, resonanceRows, elementRows, modalityRows });
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

  const itemsData = items.map((it) => {
    const peak = refinePeakTime({
      kind: LINE_PAID_PROXIMITY.kind,
      aKey: it.aKey,
      bKey: it.bKey,
      aspectDeg: it.aspectDeg,
      seedISO: it.peak,
      fallbackISO: baseISO,
      windowMs: LINE_PAID_PROXIMITY.peakWindowMs,
      stepMs: LINE_PAID_PROXIMITY.peakStepMs,
    });
    return {
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
      peak,
    };
  });

  const moonEventsRaw = buildNextMoonEvents(baseISO, dict);
  const moonEventsData = orderedMoonEvents(moonEventsRaw)
    .map((ev) => formatMoonEventDisplay({ ...ev, dict }))
    .filter(Boolean);

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
  buildRetrogradeOnlyBlock,
  buildSevenDayLogBlock,
  buildElementModalityBlock,
  buildKinjitsuBlock,
};
