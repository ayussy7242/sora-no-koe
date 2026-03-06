"use strict";

/**
 * channels/x_thread.js
 * - X用 3分割（今日の空 / 月相+近日 / 今日の共鳴）
 * - 返り値は JSON 文字列（x_1_main / x_2_moon_and_soon / x_3_resonance）
 */

const { buildRetrogradeMap } = require("../../domain/astro/retrograde");
const { SPEC } = require("../../config/sora_spec");
const { normalizeBodyKey } = require("../../domain/canonical");
const {
  formatDateLabel,
  glyphForBody,
  signJa,
  aspectInfo,
  formatElementModalityLines,
} = require("../format/format/line_common");
const { listWithOrb, sortByOrb } = require("../../domain/aspect_selection");
const {
  absAngularDistance,
  calcTransitLon,
  formatDateYmdHm,
  pickApplyingUpcomingAspects,
} = require("../../domain/astro_compute");
const { formatTodayMoonLines, moonNameJaFromDate } = require("../../domain/moon_info");
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

function moonEmojiFromPhaseDeg(phaseDeg) {
  const v = Number(phaseDeg);
  if (!Number.isFinite(v)) return "🌙";
  const d = ((v % 360) + 360) % 360;
  if (d < 22.5 || d >= 337.5) return "🌑";
  if (d < 67.5) return "🌒";
  if (d < 112.5) return "🌓";
  if (d < 157.5) return "🌔";
  if (d < 202.5) return "🌕";
  if (d < 247.5) return "🌖";
  if (d < 292.5) return "🌗";
  return "🌘";
}

function signLabelFromLon(dict, lon) {
  if (!Number.isFinite(Number(lon))) return "—";
  const order = dict?.SIGNS_V2?.order || dict?.SIGNS?.order || [
    "aries","taurus","gemini","cancer","leo","virgo","libra","scorpio","sagittarius","capricorn","aquarius","pisces",
  ];
  const idx = Math.floor((((Number(lon) % 360) + 360) % 360) / 30);
  const key = order[idx];
  return key ? signJa(dict, key) : "—";
}

function moonPhaseDegAt(iso) {
  const sunLon = calcTransitLon("sun", iso);
  const moonLon = calcTransitLon("moon", iso);
  if (!Number.isFinite(Number(sunLon)) || !Number.isFinite(Number(moonLon))) return null;
  return ((Number(moonLon) - Number(sunLon) + 360) % 360);
}

function phaseContNear(iso, ref) {
  const deg = moonPhaseDegAt(iso);
  if (!Number.isFinite(Number(deg))) return null;
  let cont = Number(deg);
  while (cont - ref > 180) cont -= 360;
  while (cont - ref < -180) cont += 360;
  return cont;
}

function findNextMoonPhaseContinuous(asOfISO, targetDeg, maxDays = 40) {
  if (!asOfISO) return null;
  const start = new Date(asOfISO);
  if (!isValidDate(start)) return null;

  const startDeg = moonPhaseDegAt(asOfISO);
  if (!Number.isFinite(Number(startDeg))) return null;

  let target = Number(targetDeg);
  while (target <= Number(startDeg)) target += 360;

  const stepHours = 6;
  const totalSteps = Math.ceil((maxDays * 24) / stepHours);
  let prevTime = null;
  let prevCont = Number(startDeg);
  let prevOffset = prevCont - target;

  for (let i = 1; i <= totalSteps; i++) {
    const t = new Date(start.getTime() + i * stepHours * 3600 * 1000);
    const iso = t.toISOString();
    const cont = phaseContNear(iso, prevCont);
    if (!Number.isFinite(Number(cont))) continue;
    const offset = cont - target;

    if (prevOffset * offset <= 0) {
      let left = prevTime || start;
      let right = t;
      let leftCont = prevCont;
      let leftOffset = prevOffset;
      for (let k = 0; k < 24; k++) {
        const mid = new Date((left.getTime() + right.getTime()) / 2);
        const midCont = phaseContNear(mid.toISOString(), leftCont);
        if (!Number.isFinite(Number(midCont))) break;
        const midOffset = midCont - target;
        if (leftOffset * midOffset <= 0) {
          right = mid;
        } else {
          left = mid;
          leftCont = midCont;
          leftOffset = midOffset;
        }
      }
      return right;
    }

    prevTime = t;
    prevCont = cont;
    prevOffset = offset;
  }
  return null;
}

function computeMoonPhaseState(asOfISO) {
  const sunLon = calcTransitLon("sun", asOfISO);
  const moonLon = calcTransitLon("moon", asOfISO);
  if (!Number.isFinite(Number(sunLon)) || !Number.isFinite(Number(moonLon))) return null;

  const phaseDeg = ((Number(moonLon) - Number(sunLon) + 360) % 360);
  const phaseAngle = absAngularDistance(moonLon, sunLon);
  const illumination = (1 - Math.cos((phaseAngle * Math.PI) / 180)) / 2;
  const now = new Date(asOfISO);
  const peak = isValidDate(now)
    ? findNextMoonPhaseContinuous(
        new Date(now.getTime() - 3 * 86400000).toISOString(),
        180,
        10
      )
    : null;
  const hoursAfterPeak =
    isValidDate(now) && isValidDate(peak) ? (now.getTime() - peak.getTime()) / 3600000 : null;

  if (illumination <= 0.02) {
    return { kind: "new", emoji: "🌑", label: "新月なう", phaseDeg, illumination };
  }
  if (illumination >= 0.98) {
    if (Number.isFinite(Number(hoursAfterPeak)) && Number(hoursAfterPeak) > 12) {
      return { kind: "full_near", emoji: "🌕", label: "満月（ピーク通過）", phaseDeg, illumination, peak };
    }
    return { kind: "full", emoji: "🌕", label: "満月なう", phaseDeg, illumination, peak };
  }
  if (illumination >= 0.95) {
    const label = isValidDate(peak) && Number.isFinite(Number(hoursAfterPeak)) && Number(hoursAfterPeak) > 0
      ? "満月（ピーク通過）"
      : "満月へ向かう";
    return { kind: "full_near", emoji: "🌕", label, phaseDeg, illumination, peak };
  }
  if (phaseDeg < 180) {
    return { kind: "waxing", emoji: "🌓", label: "上弦へ向かう", phaseDeg, illumination, peak };
  }
  return { kind: "waning", emoji: "🌗", label: "下弦へ向かう", phaseDeg, illumination, peak };
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
  const baseDate = new Date(asOfISO || Date.now());

  const moonLines = (() => {
    const today = formatTodayMoonLines({ asOfISO, story, dict });
    if (!today?.lines?.length) return [];

    const lines = [];
    const todayEmoji = moonEmojiFromPhaseDeg(today.info?.phaseDeg);
    lines.push("🌙 月相", "", `${todayEmoji} 本日の月`);
    lines.push(...today.lines.slice(1));

    const prevStart = new Date(baseDate.getTime() - 40 * 86400000).toISOString();
    let lastFull = findNextMoonPhaseContinuous(prevStart, 180, 60);
    if (isValidDate(lastFull) && lastFull.getTime() > baseDate.getTime()) {
      const prevStart2 = new Date(baseDate.getTime() - 70 * 86400000).toISOString();
      lastFull = findNextMoonPhaseContinuous(prevStart2, 180, 90);
      if (isValidDate(lastFull) && lastFull.getTime() > baseDate.getTime()) lastFull = null;
    }

    if (isValidDate(lastFull)) {
      const fullName = moonNameJaFromDate(lastFull);
      const fullLabel = fullName ? `🌕 ${fullName}` : "🌕 満月";
      lines.push("", "直近の満月", fullLabel, `${formatDateYmdHm(lastFull)}（JST）`);
    }

    const nextNew = findNextMoonPhaseContinuous(asOfISO, 0);
    const nextFull = findNextMoonPhaseContinuous(asOfISO, 180);
    let nextMajor = null;
    if (isValidDate(nextNew) && isValidDate(nextFull)) {
      nextMajor = nextNew.getTime() <= nextFull.getTime()
        ? { kind: "new", date: nextNew }
        : { kind: "full", date: nextFull };
    } else if (isValidDate(nextNew)) {
      nextMajor = { kind: "new", date: nextNew };
    } else if (isValidDate(nextFull)) {
      nextMajor = { kind: "full", date: nextFull };
    }

    if (nextMajor) {
      const lon = calcTransitLon("moon", nextMajor.date.toISOString());
      const signJaLabel = signLabelFromLon(dict, lon);
      const kindText = nextMajor.kind === "new" ? "新月" : "満月";
      const emoji = nextMajor.kind === "new" ? "🌑" : "🌕";
      const labelCore = signJaLabel && signJaLabel !== "—" ? `${signJaLabel}${kindText}` : kindText;
      lines.push("", "次の月相", `${emoji} ${labelCore}`, `${formatDateYmdHm(nextMajor.date)}（JST）`);
    }

    return lines;
  })();

  const resonanceItems = listWithOrb(skyAll)
    .sort((a, b) => Number(a?.orb_deg) - Number(b?.orb_deg))
    .slice(0, 1);

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

      const aspect = aspectInfo(dict, item?.type || item?.aspT || item?.aspect, item?.aspect_deg);
      const aspectLabel = aspect?.label_ja || String(item?.type || item?.aspT || item?.aspect || "");
      const aspectDeg = Number.isFinite(Number(item?.aspect_deg))
        ? Number(item.aspect_deg)
        : Number.isFinite(Number(aspect?.deg))
          ? Number(aspect.deg)
          : null;
      const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
      const orb = Number.isFinite(Number(item?.orb_deg)) ? Number(item.orb_deg) : null;
      const orbText = orb != null ? `${orb.toFixed(1)}` : "-";

      return [
        `(T) ${aGlyph ? `${aGlyph} ` : ""}${aLabelR}${aSignText}`,
        `× (T) ${bGlyph ? `${bGlyph} ` : ""}${bLabelR}${bSignText}`,
        `${aspectLabel} ${degText}`.trim(),
        `現在 オーブ ${orbText}°`,
      ].join("\n");
    })
    : ["該当なし"];

  const primaryResonance = resonanceItems[0] || null;
  const resonanceSigns = primaryResonance
    ? [
      primaryResonance?.a_sign_ja || signJa(dict, primaryResonance?.a_sign_key || ""),
      primaryResonance?.b_sign_ja || signJa(dict, primaryResonance?.b_sign_key || ""),
    ].filter(Boolean)
    : [];
  const part2Tags = buildTags(resonanceSigns, { base: ["#ソラのこえ"], max: 3 });

  const part2Blocks = [];
  if (moonLines.length) {
    part2Blocks.push(moonLines.join("\n"));
  }
  part2Blocks.push(["【今日の共鳴（最大接近）】", "", resonanceBlocks.join("\n\n")].join("\n"));
  part2Blocks.push(part2Tags);

  const part2Text = part2Blocks.filter(Boolean).join("\n\n");

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
      const aSign = row?.raw?.a_sign_ja || signJa(dict, row?.raw?.a_sign_key || "") || transitSigns?.[row.aKey]?.sign_ja || "";
      const bSign = row?.raw?.b_sign_ja || signJa(dict, row?.raw?.b_sign_key || "") || transitSigns?.[row.bKey]?.sign_ja || "";
      const aSignText = aSign ? `（${aSign}）` : "";
      const bSignText = bSign ? `（${bSign}）` : "";
      const aspect = aspectInfo(dict, row.raw?.aspect || row.raw?.type || row.raw?.aspT, row.aspectDeg);
      const aspectLabel = aspect?.label_ja || String(row.raw?.aspect || row.raw?.type || row.raw?.aspT || "");
      const degText = Number.isFinite(Number(row.aspectDeg)) ? `${Math.round(Number(row.aspectDeg))}°` : "";
      const nowOrbText = Number.isFinite(Number(row.nowOrb)) ? row.nowOrb.toFixed(1) : "-";
      const peakText = row.peakAt && isValidDate(row.peakAt) ? formatMonthDayHm(row.peakAt) : "-";

      const lines = [
        `★ ${aGlyph ? `${aGlyph} ` : ""}${aLabel}${aSignText} × ${bGlyph ? `${bGlyph} ` : ""}${bLabel}${bSignText}`,
        `${aspectLabel} ${degText}`.trim(),
        `現在 オーブ ${nowOrbText}°`,
        `最接近 ${peakText}（JST）`,
      ];
      return idx === 0 ? lines : ["", ...lines];
    })
    : ["該当なし"];

  const part3Text = [
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
  };

  return JSON.stringify(output, null, 2);
}

module.exports = { renderXThread, THREAD_SEP };
