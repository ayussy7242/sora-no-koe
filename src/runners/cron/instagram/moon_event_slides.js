"use strict";

const { formatDateLabel } = require("../../../engine/renderers/instagram/carousel");
const { pickObservationLine } = require("../../../presenters/format/ig_caption");
const { aspectInfo } = require("../../../presenters/format/format/common");
const {
  buildMoonStatus,
  moonSignAtIso,
  moonEventKindLabelJa,
  moonEventIlluminationDefaults,
  moonEventRelationInfo,
  moonEventNameLineEn,
} = require("../../../domain/moon");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../../domain/astro/compute");
const { pickMoonResonanceAspect } = require("./moon_event");
const { aspectLabelJa, aspectCircuitLabel } = require("./shared/aspects");
const { signLabelEnFromKey } = require("./shared/signs");
const { BODY_META } = require("./shared/bodies");
const { planetLine } = require("./shared/lines");

function safeCount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatElementCounts(elementCount = {}) {
  const fire = safeCount(elementCount.fire);
  const earth = safeCount(elementCount.earth);
  const air = safeCount(elementCount.air);
  const water = safeCount(elementCount.water);
  return `火${fire} 地${earth} 風${air} 水${water}`;
}

function formatModeCounts(modeCount = {}) {
  const cardinal = safeCount(modeCount.cardinal);
  const fixed = safeCount(modeCount.fixed);
  const mutable = safeCount(modeCount.mutable);
  return `活動${cardinal} 不動${fixed} 柔軟${mutable}`;
}

function pickAirFeel(elementCount = {}, modeCount = {}) {
  const fire = safeCount(elementCount.fire);
  const earth = safeCount(elementCount.earth);
  const air = safeCount(elementCount.air);
  const water = safeCount(elementCount.water);
  const light = fire + air;
  const heavy = earth + water;
  let temp = "";
  if (light - heavy >= 2) temp = "軽い";
  if (heavy - light >= 2) temp = "重い";

  const cardinal = safeCount(modeCount.cardinal);
  const fixed = safeCount(modeCount.fixed);
  const mutable = safeCount(modeCount.mutable);
  let motion = "流れる";
  if (cardinal >= fixed && cardinal >= mutable) motion = "動く";
  if (fixed >= cardinal && fixed >= mutable) motion = "留まる";

  if (!temp) return motion;
  return `${temp}・${motion}`;
}

function buildMoonAirSummary(elementCount = {}, modeCount = {}) {
  const elementMap = {
    fire: { label: "火", feel: "熱" },
    earth: { label: "地", feel: "重さ" },
    air: { label: "風", feel: "軽さ" },
    water: { label: "水", feel: "湿り" },
  };
  const elements = Object.entries(elementCount)
    .map(([key, value]) => ({ key, value: safeCount(value) }))
    .sort((a, b) => b.value - a.value);
  const top = elements[0]?.key || "";
  const elementLabel = elementMap[top]?.label || "";
  const elementFeel = elementMap[top]?.feel || "";

  const cardinal = safeCount(modeCount.cardinal);
  const fixed = safeCount(modeCount.fixed);
  const mutable = safeCount(modeCount.mutable);
  let motion = "流れる";
  if (cardinal >= fixed && cardinal >= mutable) motion = "動く";
  if (fixed >= cardinal && fixed >= mutable) motion = "留まる";

  if (elementLabel && elementFeel) {
    return `${elementLabel}が多く、${elementFeel}が${motion}温度感。`;
  }
  return `${motion}温度感。`;
}

function houseCoreLabel(dict, houseNo) {
  const n = Number(houseNo);
  if (!Number.isFinite(n)) return "";
  const house = dict?.HOUSES_V1?.houses?.[n];
  return house?.core || house?.sora_short || "";
}

function buildMoonPlacementObservation({ houseNo, dict }) {
  if (!Number.isFinite(Number(houseNo))) {
    return "月の配置から、領域が立ち上がりやすい空。";
  }
  const core = houseCoreLabel(dict, houseNo);
  if (core) {
    return `第${houseNo}ハウスに月があり、${core}の領域が立ち上がりやすい配置。`;
  }
  return `第${houseNo}ハウスに月があり、その領域が立ち上がりやすい配置。`;
}

const PLANET_META = BODY_META;

function buildMoonEventPlacementBlock({
  story,
  event,
  dateLocal,
  dict,
  summaryText,
  moonPlacementText,
} = {}) {
  const dateLabel = formatDateLabel(dateLocal);
  const transit = story?.public?.transit_signs || {};
  const skyStrata = story?.public?.sky_strata || {};
  const elementCount = skyStrata.element_count || {};
  const modeCount = skyStrata.mode_count || skyStrata.modality_count || {};

  const sunSign = transit?.sun?.sign_ja || "—";
  const moonSign = transit?.moon?.sign_ja || event?.signJa || "—";

  const coverObservation =
    pickObservationLine({
      transitSigns: transit,
      skyStrata,
      houseFocus: story?.public?.house_focus || {},
    }) || buildMoonAirSummary(elementCount, modeCount);

  const eventIso = event?.date instanceof Date ? event.date.toISOString() : story?.meta?.as_of || "";
  const moonPos = eventIso ? moonSignAtIso({ dict, iso: eventIso }) : null;
  const moonDeg = Number.isFinite(Number(moonPos?.degInSign)) ? Number(moonPos.degInSign) : null;
  const moonDegLabel = Number.isFinite(moonDeg) ? `${moonDeg.toFixed(1)}°` : "";
  const moonKey = moonPos?.key || transit?.moon?.sign_key || "";
  const ascKey = story?.public?.house_focus?.asc_sign_key || "";
  const ascIndex = signIndexFromKey(dict, ascKey);
  const moonIndex = signIndexFromKey(dict, moonKey);
  const houseNo = Number.isFinite(ascIndex) && Number.isFinite(moonIndex)
    ? houseNumberForSignIndex(moonIndex, ascIndex)
    : null;
  const houseLabel = Number.isFinite(Number(houseNo)) ? `${houseNo}H` : "";

  const moonStatus = buildMoonStatus({ asOfISO: eventIso || story?.meta?.as_of, story, dict });
  const illuminationDefaults = moonEventIlluminationDefaults(event);
  const moonIllumination = Number.isFinite(Number(moonStatus?.illumination))
    ? Number(moonStatus.illumination)
    : illuminationDefaults.illumination;
  const moonWaxing = typeof moonStatus?.waxing === "boolean"
    ? moonStatus.waxing
    : illuminationDefaults.waxing;

  const pressureLines = [
    formatElementCounts(elementCount),
    formatModeCounts(modeCount),
  ].filter(Boolean);
  const moonNameLine = moonEventNameLineEn({
    kind: event?.kind,
    signEn: signLabelEnFromKey(moonKey),
    specialNameEn: event?.specialNameEn,
    moonNameEn: event?.moonNameEn,
  });

  const coverSlide = {
    dateLabel,
    brand: "ソラのこえ",
    tagline: "",
    subLabel: event?.dateLabel || "",
    sunLine: event?.phaseName || moonEventKindLabelJa(event?.kind),
    midLine: moonNameLine,
    moonLine: moonSign,
    observation: pressureLines.length ? "" : coverObservation,
    pressureLines,
    swipeLabel: "Swipe →",
  };

  const degreeLabel = moonDegLabel ? `度数 ${moonDegLabel}` : "";
  const houseInfoLabel = houseLabel ? `ハウス ${houseLabel}` : "";
  const placementSlide = {
    dateLabel,
    header: "月の配置",
    subLabel: "moon placement",
    phaseSymbol: event?.phaseSymbol || moonStatus?.phaseSymbol || "🌙",
    phaseLabel: moonSign,
    moonSign: "",
    moonAgeLabel: degreeLabel,
    illuminationLabel: houseInfoLabel,
    observation: moonPlacementText || buildMoonPlacementObservation({ houseNo, dict }),
    nextLabel: "",
    nextSymbol: "",
    nextPhaseLabel: "",
    nextMoonName: "",
    nextDate: "",
    moonIllumination,
    moonWaxing,
    moonSize: 160,
  };

  const climateSlide = {
    dateLabel,
    header: "月の空気",
    subLabel: "moon climate",
    lines: [
      { label: summaryText || buildMoonAirSummary(elementCount, modeCount) },
    ],
    brand: "sora-no-koe",
  };

  const ctaSlide = {
    ornament: "☉     ☽",
    timeText: "明日は",
    title: event?.phaseName ? `${event.phaseName}の空` : "月相の空",
    subtitle: "",
    cta: "星の配置を記録しています",
    link: "Keep this sky",
    brand: "sora-no-koe",
    dateLabel,
  };

  return {
    dateLabel,
    transit,
    elementCount,
    modeCount,
    sunSign,
    moonSign,
    moonKey,
    coverSlide,
    placementSlide,
    climateSlide,
    ctaSlide,
  };
}

function buildMoonEventRelationBlock({ dateLabel, event, sunSign, moonSign, sunMoonText } = {}) {
  const relationInfo = moonEventRelationInfo(event);
  const relationLabel = relationInfo.labelJa || "";
  const relationDeg = Number.isFinite(Number(relationInfo.deg)) ? Number(relationInfo.deg) : 0;
  const relationLine = relationLabel ? `${relationLabel} ${relationDeg}°` : `${relationDeg}°`;
  const relationStructure = relationInfo.structureJa || "";
  return {
    dateLabel,
    header: "月と太陽",
    subLabel: "sun & moon",
    lineA: planetLine({ glyph: PLANET_META.moon.glyph, name: PLANET_META.moon.name, sign: moonSign }),
    lineB: planetLine({ glyph: PLANET_META.sun.glyph, name: PLANET_META.sun.name, sign: sunSign }),
    aspectLine: relationLine,
    deepLine: "",
    structure: sunMoonText || relationStructure,
    bodyAKey: "moon",
    bodyBKey: "sun",
  };
}

function buildMoonEventResonanceBlock({
  story,
  dateLabel,
  transit,
  moonSign,
  dict,
  moonResonanceText,
  moonResonanceAspect,
} = {}) {
  const moonAspect = moonResonanceAspect || pickMoonResonanceAspect(story);
  if (!moonAspect) {
    return {
      dateLabel,
      header: "月の共鳴",
      subLabel: "moon resonance",
      lineA: planetLine({ glyph: PLANET_META.moon.glyph, name: PLANET_META.moon.name, sign: moonSign }),
      lineB: "—",
      aspectLine: "該当なし",
      deepLine: "",
      structure: "月の共鳴は今回はなし。",
      bodyAKey: "moon",
      bodyBKey: "",
    };
  }

  const aKey = String(moonAspect?.a || "").toLowerCase();
  const bKey = String(moonAspect?.b || "").toLowerCase();
  const aMeta = PLANET_META[aKey] || { name: aKey, glyph: "" };
  const bMeta = PLANET_META[bKey] || { name: bKey, glyph: "" };
  const aSign = transit?.[aKey]?.sign_ja || "—";
  const bSign = transit?.[bKey]?.sign_ja || "—";

  const info = aspectInfo(dict, moonAspect?.type || moonAspect?.aspect, moonAspect?.aspect_deg);
  const label = info?.label_ja || aspectLabelJa(moonAspect?.type, moonAspect?.aspect_deg);
  const deg = Number.isFinite(Number(info?.deg)) ? Number(info.deg) : Number(moonAspect?.aspect_deg);
  const degLabel = Number.isFinite(deg) ? `${deg}°` : "";
  const orb = Number(moonAspect?.orb_deg);
  const orbLabel = Number.isFinite(orb) ? `orb ${orb.toFixed(2)}°` : "";
  const aspectLine = [label, degLabel].filter(Boolean).join(" ").trim();
  const aspectLineFull = [aspectLine, orbLabel].filter(Boolean).join("　").trim();

  const otherKey = aKey === "moon" ? bKey : aKey;
  const otherMeta = PLANET_META[otherKey] || { name: otherKey, glyph: "" };
  const circuit = aspectCircuitLabel(moonAspect?.type || moonAspect?.aspect);
  const structure = moonResonanceText || `月と${otherMeta.name}が${label}でつながり、${circuit}が動く。`;

  return {
    dateLabel,
    header: "月の共鳴",
    subLabel: "moon resonance",
    lineA: planetLine({ glyph: aMeta.glyph, name: aMeta.name, sign: aSign }),
    lineB: planetLine({ glyph: bMeta.glyph, name: bMeta.name, sign: bSign }),
    aspectLine: aspectLineFull || aspectLine || label,
    deepLine: "",
    structure,
    bodyAKey: aKey,
    bodyBKey: bKey,
  };
}

function buildMoonEventCarouselSlides({
  story,
  event,
  dateLocal,
  withCta,
  dict,
  summaryText,
  moonPlacementText,
  sunMoonText,
  moonResonanceText,
  moonResonanceAspect,
}) {
  const placement = buildMoonEventPlacementBlock({
    story,
    event,
    dateLocal,
    dict,
    summaryText,
    moonPlacementText,
  });
  const slide1 = placement.coverSlide;
  const slide3 = placement.placementSlide;
  const slide6 = placement.climateSlide;
  const slide7 = placement.ctaSlide;

  const slide4 = buildMoonEventRelationBlock({
    dateLabel: placement.dateLabel,
    event,
    sunSign: placement.sunSign,
    moonSign: placement.moonSign,
    sunMoonText,
  });

  const slide5 = buildMoonEventResonanceBlock({
    story,
    dateLabel: placement.dateLabel,
    transit: placement.transit,
    moonSign: placement.moonSign,
    dict,
    moonResonanceText,
    moonResonanceAspect,
  });

  return {
    slides: [
      { kind: "cover", data: slide1 },
      { kind: "moon", data: slide3 },
      { kind: "resonance", data: slide4 },
      { kind: "resonance", data: slide5 },
      { kind: "placements", data: slide6 },
      ...(withCta ? [{ kind: "cta", data: slide7 }] : []),
    ],
    slideSet: "moon_event",
  };
}

module.exports = {
  formatElementCounts,
  formatModeCounts,
  pickAirFeel,
  buildMoonAirSummary,
  buildMoonPlacementObservation,
  buildMoonEventCarouselSlides,
};
