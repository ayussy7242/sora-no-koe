"use strict";

const { formatDateLabel } = require("../../../engine/renderers/instagram/ig_carousel");
const { pickObservationLine } = require("../../../presenters/format/ig_caption");
const { aspectInfo } = require("../../../presenters/format/format/common");
const {
  buildMoonStatus,
  formatMoonEventDisplay,
  moonSignAtIso,
} = require("../../../domain/moon");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../../domain/astro/compute");
const { signGlyph } = require("../../../presenters/shared/text/tokens");
const { selectNextMajorPhase } = require("../../../domain/moon/phase_select");
const { pickMoonResonanceAspect } = require("./moon_event");
const { aspectLabelJa } = require("./shared/aspects");
const { signLabelEnFromKey } = require("./shared/signs");
const { BODY_LABELS, BODY_GLYPHS } = require("./shared/bodies");

function planetLine({ glyph, name, sign }) {
  if (!glyph && !name) return "";
  const signPart = sign ? `（${sign}）` : "";
  return `${glyph || ""} ${name || ""}${signPart}`.trim();
}

function plainMoonSymbol(kind) {
  if (kind === "new") return "●";
  if (kind === "full") return "○";
  return "◑";
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

function pickMoonAspect(story) {
  const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const pool = [...skyTop, ...skyAll];
  if (!pool.length) return null;

  const moonHits = pool.filter((row) => {
    const aKey = String(row?.a || "").toLowerCase();
    const bKey = String(row?.b || "").toLowerCase();
    return aKey === "moon" || bKey === "moon";
  });
  if (!moonHits.length) return null;

  const majors = new Set(["conjunction", "sextile", "square", "trine", "opposition"]);
  const majorHits = moonHits.filter((row) => majors.has(normalizeAspectType(row?.type || row?.aspect)));
  const target = majorHits.length ? majorHits : moonHits;
  return target
    .map((row) => ({ row, orb: Number(row?.orb_deg) }))
    .filter((item) => Number.isFinite(item.orb))
    .sort((a, b) => a.orb - b.orb)[0]?.row || target[0] || null;
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

function buildMoonSlide({ story, dateLabel, dateLocal, dict }) {
  const asOfISO = `${dateLocal}T12:00:00+09:00`;
  const igOut = story?.outputs?.ig || {};
  const parts = igOut?.parts || {};
  const renderedCarousel = igOut?.rendered?.carousel || igOut?.carousel || {};
  const moonStatus = buildMoonStatus({ asOfISO, story, dict });
  const phaseLabelBase = String(moonStatus?.phaseLabel || "").trim();
  const moonSign = String(moonStatus?.signJa || "").trim();
  const phaseSymbol = moonStatus?.phaseSymbol || "🌙";

  const moonAgeLabel = Number.isFinite(Number(moonStatus?.moonAge))
    ? `月齢 ${Number(moonStatus.moonAge).toFixed(1)}`
    : "";
  const illuminationLabel = Number.isFinite(Number(moonStatus?.illumination))
    ? `照度 ${Math.round(Number(moonStatus.illumination) * 100)}%`
    : "";

  const phasePick = selectNextMajorPhase({ asOfISO, story, dict });
  const next = phasePick?.next || null;
  const nextDisplay = next ? formatMoonEventDisplay({ kind: next.kind, date: next.date, signJa: next.signJa, dict }) : null;
  const nextSymbol = next ? plainMoonSymbol(next.kind) : "";
  const nextPhaseLabel = nextDisplay?.label || "";
  const nextMoonName = "";
  const nextDate = nextDisplay?.dateLabel || "";

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
    moonIllumination: Number.isFinite(Number(moonStatus?.illumination)) ? Number(moonStatus.illumination) : 0.5,
    moonWaxing: typeof phasePick?.waxing === "boolean"
      ? phasePick.waxing
      : Number.isFinite(Number(moonStatus?.moonAge))
        ? Number(moonStatus.moonAge) < 14.765
        : true,
    moonSize: 160,
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
    const bodies = [
      { key: "sun", label: "太陽", glyph: "☉" },
      { key: "moon", label: "月", glyph: "☽" },
      { key: "mercury", label: "水星", glyph: "☿" },
      { key: "venus", label: "金星", glyph: "♀" },
      { key: "mars", label: "火星", glyph: "♂" },
      { key: "jupiter", label: "木星", glyph: "♃" },
      { key: "saturn", label: "土星", glyph: "♄" },
      { key: "uranus", label: "天王星", glyph: "♅" },
      { key: "neptune", label: "海王星", glyph: "♆" },
      { key: "pluto", label: "冥王星", glyph: "♇" },
      { key: "lilith", label: "リリス", glyph: "⚸" },
      { key: "chiron", label: "キロン", glyph: "⚷" },
    ];
    return bodies.map((body) => {
      const signKey = transit?.[body.key]?.sign_key || "";
      const signJa = transit?.[body.key]?.sign_ja || "—";
      const signIndex = signIndexFromKey(dict, signKey);
      const houseNo = Number.isFinite(signIndex) && Number.isFinite(ascIndex)
        ? houseNumberForSignIndex(signIndex, ascIndex)
        : null;
      const houseLabel = houseNo ? `${houseNo}H` : "—";
      return {
        glyph: body.glyph,
        label: body.label,
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
  const planetMap = {
    sun: { name: "太陽", glyph: "☉" },
    moon: { name: "月", glyph: "☽" },
    mercury: { name: "水星", glyph: "☿" },
    venus: { name: "金星", glyph: "♀" },
    mars: { name: "火星", glyph: "♂" },
    jupiter: { name: "木星", glyph: "♃" },
    saturn: { name: "土星", glyph: "♄" },
    uranus: { name: "天王星", glyph: "♅" },
    neptune: { name: "海王星", glyph: "♆" },
    pluto: { name: "冥王星", glyph: "♇" },
    lilith: { name: "リリス", glyph: "⚸" },
    chiron: { name: "キロン", glyph: "⚷" },
    north_node: { name: "北ノード", glyph: "☊" },
    south_node: { name: "南ノード", glyph: "☋" },
  };

  const aKey = topAspect?.a || "moon";
  const bKey = topAspect?.b || "lilith";
  const aMeta = planetMap[aKey] || { name: aKey, glyph: "" };
  const bMeta = planetMap[bKey] || { name: bKey, glyph: "" };

  const aSign = story?.public?.transit_signs?.[aKey]?.sign_ja || "乙女座";
  const bSign = story?.public?.transit_signs?.[bKey]?.sign_ja || "射手座";

  const { aspectLine, deepLine } = (() => {
    if (!topAspect) return { aspectLine: "スクエア 90°　orb 0.30°", deepLine: "" };
    const info = aspectInfo(dict, topAspect.type || topAspect.aspect, topAspect.aspect_deg);
    const label = info?.label_ja || aspectLabelJa(topAspect.type, topAspect.aspect_deg);
    const deg = Number.isFinite(Number(info?.deg)) ? Number(info.deg) : Number(topAspect.aspect_deg);
    const degLabel = Number.isFinite(deg) ? `${deg}°` : "";
    const head = label && label.includes("°") ? label : [label, degLabel].filter(Boolean).join(" ");
    const orbLabel = Number.isFinite(Number(topAspect.orb_deg)) ? `orb ${Number(topAspect.orb_deg).toFixed(2)}°` : "";
    const line = [head, orbLabel].filter(Boolean).join("　").trim();

    return { aspectLine: line, deepLine: "" };
  })();

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
  planetLine,
  aspectLabelJa,
  plainMoonSymbol,
  formatElementCounts,
  formatModeCounts,
  pickAirFeel,
  buildMoonAirSummary,
  buildMoonPlacementObservation,
  buildMoonSlide,
  buildCarouselSlides,
  buildMoonEventCarouselSlides,
};
