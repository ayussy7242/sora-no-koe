"use strict";

const { formatDateLabel } = require("../../../engine/renderers/instagram/carousel");
const { pickObservationLine } = require("../../../presenters/format/ig_caption");
const { aspectInfo } = require("../../../presenters/format/format/common");
const { formatMonthDayHm, formatJstYmd, formatJstTimeLabel } = require("../../../utils/time");
const { refinePeakTime } = require("../../../domain/aspect/proximity");
const { buildMoonStatus, formatMoonEventDisplay } = require("../../../domain/moon");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../../domain/astro/compute");
const { signGlyph, signLabelJa } = require("../../../presenters/shared/text/tokens");
const { selectNextMajorPhase } = require("../../../domain/moon/phase_select");
const { aspectLabelJa } = require("./shared/aspects");
const { planetLine } = require("./shared/lines");
const { BODY_META, BODY_ORDER_BASIC } = require("./shared/bodies");
const { calcTransitLon } = require("../../../domain/astro/ephemeris");
const { signKeyFromLon } = require("../../../domain/astro/signs");
const { normalizeSignKey } = require("../../../domain/canonical");

function plainMoonSymbol(kind) {
  if (kind === "new") return "●";
  if (kind === "full") return "○";
  return "◑";
}

function formatJstYmdHm(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const ymd = formatJstYmd(date, { fallback: "" });
  const hm = formatJstTimeLabel(date, { fallback: "" });
  return [ymd, hm].filter(Boolean).join(" ").trim();
}

function elementFromSign(dict, signKey) {
  const key = normalizeSignKey(signKey || "");
  if (!key) return "";
  const signs = dict?.SIGNS_V2?.signs || dict?.SIGNS?.signs || {};
  return signs?.[key]?.element || "";
}

function buildResonanceSpaceConfig({ story, dict }) {
  const topAspect =
    story?.outputs?.ig?.source?.resonance_aspect ||
    story?.public?.sky_top?.[0] ||
    story?.public?.sky_all?.[0] ||
    null;
  if (!topAspect) return null;
  const elementA = elementFromSign(dict, topAspect?.a_sign_key || "");
  const elementB = elementFromSign(dict, topAspect?.b_sign_key || "");
  if (!elementA && !elementB) return null;
  const hasBoth = elementA && elementB && elementA !== elementB;
  return {
    elementOverride: elementA || elementB,
    secondaryElementOverride: elementB || elementA || elementB,
    ...(hasBoth ? { forceSecondaryMix: true, secondaryMixRatio: 0.62 } : {}),
  };
}

function findNextMoonSignChange({ asOfISO, dict, maxHours = 72, stepMinutes = 30 } = {}) {
  const base = new Date(asOfISO);
  if (Number.isNaN(base.getTime())) return null;
  const baseLon = calcTransitLon("moon", base.toISOString());
  const baseSign = signKeyFromLon(baseLon);
  if (!baseSign) return null;

  const stepMs = stepMinutes * 60 * 1000;
  let lastTime = base;
  let lastSign = baseSign;

  const maxSteps = Math.ceil((maxHours * 60) / stepMinutes);
  for (let i = 1; i <= maxSteps; i += 1) {
    const t = new Date(base.getTime() + i * stepMs);
    const lon = calcTransitLon("moon", t.toISOString());
    const sign = signKeyFromLon(lon);
    if (!sign) continue;
    if (sign !== lastSign) {
      let lo = lastTime;
      let hi = t;
      for (let j = 0; j < 18; j += 1) {
        const mid = new Date((lo.getTime() + hi.getTime()) / 2);
        const midLon = calcTransitLon("moon", mid.toISOString());
        const midSign = signKeyFromLon(midLon);
        if (!midSign || midSign === lastSign) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      const toLabel = signLabelJa(dict, sign) || sign;
      return {
        time: hi,
        fromKey: lastSign,
        toKey: sign,
        toLabel,
      };
    }
    lastTime = t;
    lastSign = sign;
  }
  return null;
}

function buildMoonSlide({ story, dateLabel, dateLocal, dict }) {
  const asOfISO = `${dateLocal}T12:00:00+09:00`;
  const igOut = story?.outputs?.ig || {};
  const parts = igOut?.parts || {};
  const renderedCarousel = igOut?.rendered?.carousel || igOut?.carousel || {};
  const moonStatus = buildMoonStatus({ asOfISO, story, dict });
  const phaseLabelBase = String(moonStatus?.phaseLabel || "").trim();
  const phaseName = String(moonStatus?.phaseName || "").trim();
  const waName = String(moonStatus?.waName || "").trim();
  const moonSign = String(moonStatus?.signJa || "").trim();
  const moonElement = elementFromSign(dict, story?.public?.moon?.sign_key || story?.public?.transit_signs?.moon?.sign_key || "");
  const phaseSymbol = moonStatus?.phaseSymbol || "🌙";

  const moonAgeLabel = Number.isFinite(Number(moonStatus?.moonAge))
    ? `月齢 ${Number(moonStatus.moonAge).toFixed(1)}`
    : "";
  const illuminationLabel = Number.isFinite(Number(moonStatus?.illumination))
    ? `照度 ${Math.round(Number(moonStatus.illumination) * 100)}%`
    : "";

  const nextSignChange = findNextMoonSignChange({ asOfISO, dict });
  let nextSymbol = "";
  let nextPhaseLabel = "";
  let nextMoonName = "";
  let nextDate = "";

  if (nextSignChange?.time && nextSignChange?.toLabel) {
    nextSymbol = "→";
    nextPhaseLabel = `${nextSignChange.toLabel}へ`;
    nextDate = formatJstYmdHm(nextSignChange.time);
  } else {
    const phasePick = selectNextMajorPhase({ asOfISO, story, dict });
    const next = phasePick?.next || null;
    const nextDisplay = next ? formatMoonEventDisplay({ kind: next.kind, date: next.date, signJa: next.signJa, dict }) : null;
    nextSymbol = next ? plainMoonSymbol(next.kind) : "";
    nextPhaseLabel = nextDisplay?.label || "";
    nextDate = nextDisplay?.dateLabel || "";
  }

  const observation =
    parts.moon ||
    renderedCarousel.slide2_text ||
    igOut.moon_text ||
    (phaseLabelBase || moonSign
      ? `${moonSign || "—"}の月が空にあり、${phaseLabelBase || "静かな月相"}の空気が広がります。`
      : "");

  return {
    dateLabel,
    header: "今日の月",
    phaseSymbol,
    phaseLabel: phaseLabelBase || "—",
    moonSign: moonSign || "—",
    moonAgeLabel,
    illuminationLabel,
    observation,
    nextLabel: "次の月",
    nextSymbol,
    nextPhaseLabel,
    nextMoonName,
    nextDate,
    nextOffsetY: 0,
    moonIllumination: Number.isFinite(Number(moonStatus?.illumination)) ? Number(moonStatus.illumination) : 0.5,
    moonWaxing: Number.isFinite(Number(moonStatus?.moonAge))
      ? Number(moonStatus.moonAge) < 14.765
      : true,
    moonSize: 160,
    phaseName,
    waName,
    spaceConfig: moonElement ? { elementOverride: moonElement } : null,
  };
}

function buildCarouselSlides({ story, dateLocal, withCta, dict }) {
  const dateLabel = formatDateLabel(dateLocal);
  const igOut = story?.outputs?.ig || {};
  const parts = igOut?.parts || {};
  const renderedCarousel = igOut?.rendered?.carousel || igOut?.carousel || {};

  const sunSign = story?.public?.transit_signs?.sun?.sign_ja || "魚座";
  const moonSign = story?.public?.transit_signs?.moon?.sign_ja || "乙女座";

  const observation =
    parts.observation ||
    renderedCarousel.slide1_observation ||
    igOut.observation_text ||
    pickObservationLine({
      transitSigns: story?.public?.transit_signs || {},
      skyStrata: story?.public?.sky_strata || {},
      houseFocus: story?.public?.house_focus || {},
    }) || "天体が全体に散る配置";

  const slide1 = {
    dateLabel,
    brand: "ソラのこえ",
    tagline: "今日の星の配置",
    subLabel: "today's sky",
    sunLine: `☉ ${sunSign}`,
    moonLine: `☽ ${moonSign}`,
    observation,
    swipeLabel: "Swipe →",
  };

  const placements = (() => {
    const transit = story?.public?.transit_signs || {};
    const ascKey = story?.public?.house_focus?.asc_sign_key || "";
    const ascIndex = signIndexFromKey(dict, ascKey);
    return BODY_ORDER_BASIC.map((key) => {
      const meta = BODY_META[key] || { name: key, glyph: "" };
      const signKey = transit?.[key]?.sign_key || "";
      const signJa = transit?.[key]?.sign_ja || "—";
      const signIndex = signIndexFromKey(dict, signKey);
      const houseNo = Number.isFinite(signIndex) && Number.isFinite(ascIndex)
        ? houseNumberForSignIndex(signIndex, ascIndex)
        : null;
      const houseLabel = houseNo ? `${houseNo}H` : "—";
      return {
        glyph: meta.glyph,
        label: meta.name,
        signGlyph: signGlyph(signKey),
        sign: signJa,
        house: houseLabel,
      };
    });
  })();

  const slidePlacements = {
    dateLabel,
    header: "今日の配置",
    subLabel: "today's placements",
    lines: placements,
    brand: "sora-no-koe",
  };

  const topAspect =
    story?.outputs?.ig?.source?.resonance_aspect ||
    story?.public?.sky_top?.[0] ||
    story?.public?.sky_all?.[0] ||
    null;
  const aKey = topAspect?.a || "moon";
  const bKey = topAspect?.b || "lilith";
  const aMeta = BODY_META[aKey] || { name: aKey, glyph: "" };
  const bMeta = BODY_META[bKey] || { name: bKey, glyph: "" };

  const aSign = story?.public?.transit_signs?.[aKey]?.sign_ja || "乙女座";
  const bSign = story?.public?.transit_signs?.[bKey]?.sign_ja || "射手座";

  const { aspectLine, deepLine, aspectDeg } = (() => {
    if (!topAspect) return { aspectLine: "スクエア 90°　orb 0.30°", deepLine: "", aspectDeg: null };
    const info = aspectInfo(dict, topAspect.type || topAspect.aspect, topAspect.aspect_deg);
    const label = info?.label_ja || aspectLabelJa(topAspect.type, topAspect.aspect_deg);
    const deg = Number.isFinite(Number(info?.deg)) ? Number(info.deg) : Number(topAspect.aspect_deg);
    const degLabel = Number.isFinite(deg) ? `${deg}°` : "";
    const head = label && label.includes("°") ? label : [label, degLabel].filter(Boolean).join(" ");
    const orbLabel = Number.isFinite(Number(topAspect.orb_deg)) ? `orb ${Number(topAspect.orb_deg).toFixed(2)}°` : "";
    const line = [head, orbLabel].filter(Boolean).join("　").trim();

    return { aspectLine: line, deepLine: "", aspectDeg: Number.isFinite(deg) ? deg : null };
  })();

  const asOfISO = story?.meta?.as_of || `${dateLocal}T12:00:00+09:00`;
  const peakTime = (topAspect && Number.isFinite(Number(aspectDeg)))
    ? refinePeakTime({
      kind: "transit-transit",
      aKey,
      bKey,
      aspectDeg,
      seedISO: topAspect?.peak_at || topAspect?.peak_at_iso || topAspect?.peak_at_utc || null,
      fallbackISO: asOfISO,
    })
    : null;
  const peakTimeLabel = peakTime ? formatJstYmdHm(peakTime) : "";

  const resonanceText =
    parts.resonance ||
    renderedCarousel.slide3_text ||
    igOut.resonance_text ||
    "感情の整理と、日常に収まりきらない要素がぶつかる角度です。\n乙女座と射手座のあいだで、細部と遠さが同時に立ち上がります。";

  const slide3 = {
    dateLabel,
    header: "今日の共鳴",
    subLabel: "today's resonance",
    lineA: planetLine({ glyph: aMeta.glyph, name: aMeta.name, sign: aSign }),
    lineB: planetLine({ glyph: bMeta.glyph, name: bMeta.name, sign: bSign }),
    aspectLine,
    deepLine,
    structure: resonanceText,
    bodyAKey: aKey,
    bodyBKey: bKey,
    peakLabel: peakTimeLabel ? "ピーク時刻" : "",
    peakTime: peakTimeLabel,
  };

  const slideMoon = { ...buildMoonSlide({ story, dateLabel, dateLocal, dict }), subLabel: "today's moon" };

  const slide5 = {
    ornament: "☉     ☽",
    timeText: "毎朝 8:00",
    title: "今日の星の配置",
    subtitle: "あなたの星 × 今日の空",
    cta: "LINEで配信中",
    link: "link in bio",
    brand: "sora-no-koe",
    dateLabel,
  };

  return {
    slides: [
      { kind: "cover", data: slide1 },
      { kind: "placements", data: slidePlacements },
      { kind: "moon", data: slideMoon },
      { kind: "resonance", data: slide3 },
      { kind: "chart", data: { story, dateLabel, footerLabel: "sky chart", subLabel: "today's chart" } },
      ...(withCta ? [{ kind: "cta", data: slide5 }] : []),
    ],
  };
}

function buildMorningCarouselSlides({ story, dateLocal, withCta = true, dict }) {
  const base = buildCarouselSlides({ story, dateLocal, withCta, dict });
  const keep = new Set(["cover", "placements", "chart", "cta"]);
  return {
    slides: base.slides.filter((slide) => keep.has(slide?.kind)),
  };
}

function buildResonanceWheelSlide({ story, dateLocal }) {
  const dateLabel = formatDateLabel(dateLocal);
  const resonanceAspect =
    story?.outputs?.ig?.source?.resonance_aspect ||
    story?.public?.sky_top?.[0] ||
    story?.public?.sky_all?.[0] ||
    null;
  return {
    kind: "resonance_wheel",
    data: {
      story,
      dateLabel,
      resonanceAspect,
      title: "今日の共鳴",
      subLabel: "today's resonance",
      brand: "ソラのこえ",
      swipeLabel: "Swipe →",
    },
  };
}

function buildResonanceCarouselSlides({ story, dateLocal, dict }) {
  const base = buildCarouselSlides({ story, dateLocal, withCta: false, dict });
  const resonanceText = base.slides.find((slide) => slide?.kind === "resonance") || null;
  const resonanceWheel = buildResonanceWheelSlide({ story, dateLocal });
  return {
    slides: [resonanceWheel, resonanceText].filter(Boolean),
    spaceConfig: buildResonanceSpaceConfig({ story, dict }),
  };
}

function buildNightMoonSlide({ story, dateLocal, dict }) {
  const dateLabel = formatDateLabel(dateLocal);
  const moon = buildMoonSlide({ story, dateLabel, dateLocal, dict });
  return {
    kind: "night_moon",
    data: {
      dateLabel,
      title: "今日の月",
      subLabel: "today's moon",
      brand: "ソラのこえ",
      swipeLabel: "Swipe →",
      moonIllumination: moon.moonIllumination,
      moonWaxing: moon.moonWaxing,
      moonSize: 520,
    },
  };
}

function buildNightCarouselSlides({ story, dateLocal, dict }) {
  const dateLabel = formatDateLabel(dateLocal);
  const moonBase = buildMoonSlide({ story, dateLabel, dateLocal, dict });
  const moonDetail = { ...moonBase, subLabel: "today's moon" };
  return {
    slides: [buildNightMoonSlide({ story, dateLocal, dict }), { kind: "moon", data: moonDetail }],
    spaceConfig: moonBase?.spaceConfig || null,
  };
}

module.exports = {
  buildMoonSlide,
  buildCarouselSlides,
  buildMorningCarouselSlides,
  buildResonanceCarouselSlides,
  buildNightCarouselSlides,
};
