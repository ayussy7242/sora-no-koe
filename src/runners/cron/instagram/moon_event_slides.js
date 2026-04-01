"use strict";

const { formatDateLabel } = require("../../../engine/renderers/instagram/ig_carousel");
const { pickObservationLine } = require("../../../presenters/format/ig_caption");
const { aspectInfo } = require("../../../presenters/format/format/common");
const { buildMoonStatus, moonSignAtIso } = require("../../../domain/moon");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../../domain/astro/compute");
const { pickMoonResonanceAspect } = require("./moon_event");
const { aspectLabelJa } = require("./shared/aspects");
const { signLabelEnFromKey } = require("./shared/signs");
const { BODY_LABELS, BODY_GLYPHS } = require("./shared/bodies");

function planetLine({ glyph, name, sign }) {
  if (!glyph && !name) return "";
  const signPart = sign ? `（${sign}）` : "";
  return `${glyph || ""} ${name || ""}${signPart}`.trim();
}

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

function normalizeAspectType(raw) {
  const key = String(raw || "").toLowerCase().trim();
  if (!key) return "";
  return key.replace(/_\d+$/, "");
}

const ASPECT_CIRCUITS = {
  conjunction: "重なりの回路",
  opposition: "向かい合う回路",
  square: "摩擦と調整の回路",
  trine: "流れの回路",
  sextile: "接点の回路",
  quincunx: "噛み合わせの回路",
  inconjunct: "噛み合わせの回路",
  semisextile: "かすかな接点の回路",
  semi_sextile: "かすかな接点の回路",
  semisquare: "小さな引っかかりの回路",
  semi_square: "小さな引っかかりの回路",
  sesquisquare: "蓄積の摩擦の回路",
  quintile: "創造の回路",
  biquintile: "創造の回路",
  novile: "内側の熟成の回路",
  septile: "揺らぎの回路",
};

function aspectCircuitLabel(type) {
  const key = normalizeAspectType(type);
  return ASPECT_CIRCUITS[key] || "接続の回路";
}

const PLANET_META = Object.fromEntries(
  Object.entries(BODY_LABELS).map(([key, name]) => [
    key,
    { name, glyph: BODY_GLYPHS[key] || "" },
  ])
);

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
  const moonIllumination = Number.isFinite(Number(moonStatus?.illumination))
    ? Number(moonStatus.illumination)
    : (event?.kind === "full" ? 1 : 0.03);
  const moonWaxing = typeof moonStatus?.waxing === "boolean"
    ? moonStatus.waxing
    : event?.kind !== "full";

  const pressureLines = [
    formatElementCounts(elementCount),
    formatModeCounts(modeCount),
  ].filter(Boolean);
  const moonNameLine = (() => {
    if (event?.kind === "full") {
      return (event?.specialNameEn || event?.moonNameEn || "").trim();
    }
    if (event?.kind === "new") {
      const signEn = signLabelEnFromKey(moonKey);
      return signEn ? `New Moon in ${signEn}` : "New Moon";
    }
    return "";
  })();

  const slide1 = {
    dateLabel,
    brand: "ソラのこえ",
    tagline: "",
    subLabel: event?.dateLabel || "",
    sunLine: event?.phaseName || (event?.kind === "full" ? "満月" : "新月"),
    midLine: moonNameLine,
    moonLine: moonSign,
    observation: pressureLines.length ? "" : coverObservation,
    pressureLines,
    swipeLabel: "Swipe →",
  };

  const degreeLabel = moonDegLabel ? `度数 ${moonDegLabel}` : "";
  const houseInfoLabel = houseLabel ? `ハウス ${houseLabel}` : "";
  const slide3 = {
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

  const relationLabel = event?.kind === "full" ? "オポジション" : "コンジャンクション";
  const relationDeg = event?.kind === "full" ? 180 : 0;
  const relationLine = `${relationLabel} ${relationDeg}°`;
  const relationStructure = event?.kind === "full"
    ? "太陽と月が向かい合い、配置が二極で立ち上がる。"
    : "太陽と月が重なり、配置の核が一点に集まる。";
  const slide4 = {
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

  const moonAspect = moonResonanceAspect || pickMoonResonanceAspect(story);
  const slide5 = (() => {
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
  })();

  const slide6 = {
    dateLabel,
    header: "月の空気",
    subLabel: "moon climate",
    lines: [
      { label: summaryText || buildMoonAirSummary(elementCount, modeCount) },
    ],
    brand: "sora-no-koe",
  };

  const slide7 = {
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
