"use strict";

const fs = require("fs");
const path = require("path");
const { renderInstagramCarousel, formatDateLabel } = require("../../engine/renderers/instagram/ig_carousel");
const { pickObservationLine, renderIGCaption } = require("../../presenters/format/ig_caption");
const { aspectInfo } = require("../../presenters/format/format/common");
const {
  buildMoonStatus,
  formatMoonEventDisplay,
  moonSignAtIso,
  buildNextMoonEvents,
  orderedMoonEvents,
} = require("../../domain/moon_info");
const { signIndexFromKey, houseNumberForSignIndex } = require("../../domain/astro_compute");
const { signGlyph } = require("../../presenters/shared/text/tokens");
const { selectNextMajorPhase } = require("../../domain/moon_phase");
const { toDateLocalJST, isYYYYMMDD } = require("../../utils/time");
const { pickPreferredResonanceAspect } = require("../../domain/resonance");
const { generateIgObservationText } = require("../../usecases/channels/instagram/ai/observation");
const { generateIgResonanceText } = require("../../usecases/channels/instagram/ai/resonance");
const { generateIgTsukijiStructureText } = require("../../usecases/channels/instagram/ai/tsukiji_structure");
const { generateIgSkyOverviewText } = require("../../usecases/channels/instagram/ai/sky_overview");
const { generateIgMoonText } = require("../../usecases/channels/instagram/ai/moon");
const {
  generateIgMoonEventPlacementText,
  generateIgMoonEventSunMoonText,
  generateIgMoonEventResonanceText,
  generateIgMoonEventCaptionText,
  generateIgMoonEventAirText,
} = require("../../usecases/channels/instagram/ai/moon_event");
const {
  generateIgCarouselCaptionText,
  generateIgCarouselObservationText,
} = require("../../usecases/channels/instagram/ai/carousel_caption");
const { ensureIgOutputs } = require("../../usecases/story/output_helpers");
const { buildPublicStorySnapshot } = require("../../usecases/story/store");
const { claimCronLock, markCronLockSuccess, markCronLockFailed } = require("../../usecases/cron/lock_utils");
const {
  createImageContainer,
  createCarouselContainer,
  publishMedia,
  waitForContainer,
} = require("../../integrations/instagram/graph");
const { createStorageClient } = require("../../utils/infra/gcs_storage");

function resolveBackgroundCache(env = {}) {
  const enabledRaw = String(env.IG_BG_CACHE ?? "true").toLowerCase();
  const enabled = !["0", "false", "off", "no"].includes(enabledRaw);
  if (!enabled) return null;
  const forceRaw = String(env.IG_BG_CACHE_REFRESH ?? "false").toLowerCase();
  const force = ["1", "true", "yes", "on"].includes(forceRaw);
  const dir = env.IG_BG_CACHE_DIR || path.join(process.cwd(), "tmp", "ig", "bg_cache");
  return { dir, force };
}

function buildAspectKey(aspect, { includeOrb = false } = {}) {
  if (!aspect) return "";
  const a = String(aspect?.a || "").toLowerCase();
  const b = String(aspect?.b || "").toLowerCase();
  const deg = Number.isFinite(Number(aspect?.aspect_deg)) ? Number(aspect.aspect_deg) : "";
  const orb = includeOrb && Number.isFinite(Number(aspect?.orb_deg))
    ? Number(aspect.orb_deg).toFixed(2)
    : "";
  return [a, b, deg, orb].filter(Boolean).join("|");
}

async function maybeGenerateIgOutputs({ story, dict, env, asOfISO, useAi, forceAi }) {
  if (!useAi) return story;
  const apiKey = String(env.OPENAI_API_KEY || "").trim();
  if (!apiKey) return story;

  const igOut = ensureIgOutputs(story);
  const openai = {
    apiKey,
    baseUrl: env.OPENAI_BASE_URL,
    model: env.OPENAI_MODEL,
  };

  if (forceAi || !igOut.parts.observation) {
    const obs = await generateIgObservationText({ story, dict, openai });
    if (obs?.ok && obs.text) {
      igOut.parts.observation = obs.text;
      igOut.rendered.carousel.slide1_observation = obs.text;
    }
  }

  if (forceAi || !igOut.parts.moon) {
    const moon = await generateIgMoonText({ story, dict, openai, asOfISO });
    if (moon?.ok && moon.text) {
      igOut.parts.moon = moon.text;
      igOut.rendered.carousel.slide2_text = moon.text;
    }
  }

  const currentResonanceKey = igOut.source?.resonance_aspect_key || "";
  const usedResonanceKey = igOut.source?.resonance_aspect_key_used || "";
  const needsResonance =
    forceAi ||
    !igOut.parts.resonance ||
    !usedResonanceKey ||
    (currentResonanceKey && currentResonanceKey !== usedResonanceKey);

  if (needsResonance) {
    const res = await generateIgResonanceText({ story, dict, openai });
    if (res?.ok && res.text) {
      igOut.parts.resonance = res.text;
      igOut.rendered.carousel.slide3_text = res.text;
      igOut.source.resonance_aspect_key_used = currentResonanceKey || "";
      igOut.source.resonance_aspect_used = igOut.source?.resonance_aspect || null;
    }
  }

  if (forceAi || !igOut.parts.tsukiji_structure) {
    const ts = await generateIgTsukijiStructureText({ story, dict, openai });
    if (ts?.ok && ts.text) {
      igOut.parts.tsukiji_structure = ts.text;
      igOut.rendered.carousel.slide4_structure = ts.text;
    }
  }

  if (forceAi || !igOut.parts.sky_overview) {
    const sky = await generateIgSkyOverviewText({ story, dict, openai });
    if (sky?.ok && sky.text) {
      igOut.parts.sky_overview = sky.text;
      igOut.sky_overview_text = sky.text;
    }
  }

  if (forceAi || !igOut.parts.caption_center) {
    const cap = await generateIgCarouselCaptionText({ story, dict, openai, asOfISO });
    if (cap?.ok && cap.text) {
      igOut.parts.caption_center = cap.text;
    }
  }

  if (forceAi || !igOut.parts.caption_observation) {
    const obs = await generateIgCarouselObservationText({ story, dict, openai });
    if (obs?.ok && obs.text) {
      igOut.parts.caption_observation = obs.text;
    }
  }

  return story;
}

function planetLine({ glyph, name, sign }) {
  if (!glyph && !name) return "";
  const signPart = sign ? `（${sign}）` : "";
  return `${glyph || ""} ${name || ""}${signPart}`.trim();
}

function aspectLabelJa(type, deg) {
  const key = String(type || "").toLowerCase();
  const map = {
    conjunction: "コンジャンクション",
    conj: "コンジャンクション",
    opposition: "オポジション",
    opp: "オポジション",
    square: "スクエア",
    trine: "トライン",
    sextile: "セクスタイル",
    quincunx: "クインカンクス",
    inconjunct: "クインカンクス",
    quintile: "クインタイル",
    biquintile: "バイ・クインタイル",
    novile: "ノヴィル",
    septile: "セプタイル",
    semisextile: "セミセクスタイル",
    semisquare: "セミスクエア",
    sesquisquare: "セスキスクエア",
  };
  if (map[key]) return map[key];
  if (Number.isFinite(Number(deg))) return `${deg}°`;
  return String(type || "").toUpperCase();
}

function plainMoonSymbol(kind) {
  if (kind === "new") return "●";
  if (kind === "full") return "○";
  return "◑";
}

function addDaysToDateLocalJST(dateLocal, offsetDays) {
  if (!isYYYYMMDD(dateLocal)) return dateLocal;
  const base = new Date(`${dateLocal}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return dateLocal;
  const shiftMs = Number(offsetDays) * 86400000;
  if (!Number.isFinite(shiftMs) || shiftMs === 0) return dateLocal;
  const shifted = new Date(base.getTime() + shiftMs);
  return toDateLocalJST(shifted);
}

function safeCount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toBool(v, fallback = false) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v !== "string") return fallback;
  const t = v.trim().toLowerCase();
  if (!t) return fallback;
  return ["1", "true", "yes", "on"].includes(t);
}

function ensureDir(dir) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
}

function writeLocalCarousel({ buffers, outDir, prefix = "slide" } = {}) {
  if (!Array.isArray(buffers) || !buffers.length) return [];
  ensureDir(outDir);
  const paths = [];
  for (let i = 0; i < buffers.length; i++) {
    const filename = `${prefix}-${i + 1}.png`;
    const full = path.join(outDir, filename);
    fs.writeFileSync(full, buffers[i]);
    paths.push(full);
  }
  return paths;
}

function writeLocalJson({ data, outDir, filename = "ig_post.json" } = {}) {
  if (!outDir) return null;
  ensureDir(outDir);
  const full = path.join(outDir, filename);
  fs.writeFileSync(full, JSON.stringify(data, null, 2), "utf8");
  return full;
}

function detectMoonEventLocal({ dateLocal, asOfISO, dict, forceNext = false, eventKind = "" }) {
  const events = buildNextMoonEvents(asOfISO, dict);
  const candidates = [events?.new, events?.full].filter((ev) => ev?.date instanceof Date);
  const normalizedKind = String(eventKind || "").toLowerCase();

  if (normalizedKind === "new" || normalizedKind === "full") {
    const picked = events?.[normalizedKind];
    if (!picked?.date) return null;
    if (forceNext) return formatMoonEventDisplay(picked);
    if (!dateLocal) return null;
    return toDateLocalJST(picked.date) === dateLocal ? formatMoonEventDisplay(picked) : null;
  }

  if (dateLocal) {
    for (const ev of candidates) {
      const evDateLocal = toDateLocalJST(ev.date);
      if (evDateLocal === dateLocal) {
        return formatMoonEventDisplay(ev);
      }
    }
  }

  if (forceNext) {
    const ordered = orderedMoonEvents(events);
    if (ordered.length) return formatMoonEventDisplay(ordered[0]);
  }

  return null;
}

function resolveMoonEventSpaceConfig(event) {
  if (!event || !event.kind) return null;
  if (event.kind === "full") {
    return {
      starDensityScale: 0.38,
      milkyIntensityScale: 0.6,
      milkyThicknessScale: 0.75,
      milkyDustScale: 0.6,
      whiteMix: 0.45,
      moonEventKind: "full",
      moonEventStyle: "halo",
      moonEventCenter: "center",
      moonEventIntensity: 1.35,
    };
  }
  if (event.kind === "new") {
    return {
      starDensityScale: 2.1,
      milkyIntensityScale: 1.55,
      milkyThicknessScale: 1.25,
      milkyDustScale: 1.6,
      whiteMix: 0.45,
      moonEventKind: "new",
      moonEventStyle: "eclipse",
      moonEventCenter: "center",
      moonEventIntensity: 1.15,
    };
  }
  return null;
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

function pickMoonResonanceAspect(story) {
  const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
  const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
  const pool = [...skyTop, ...skyAll];
  if (!pool.length) return null;

  const moonHits = pool.filter((row) => {
    const aKey = String(row?.a || "").toLowerCase();
    const bKey = String(row?.b || "").toLowerCase();
    if (!(aKey === "moon" || bKey === "moon")) return false;
    const other = aKey === "moon" ? bKey : aKey;
    return other && other !== "sun";
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

const PLANET_META = {
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

function buildMoonEventCaption(event) {
  if (!event) return "";
  const line1 = event.line1 || event.label || event.phaseName || "";
  const line2 = event.dateLabel || event.line2 || "";
  return [line1, line2].filter(Boolean).join("\n").trim();
}

function signLabelEnFromKey(key) {
  if (!key) return "";
  const map = {
    aries: "Aries",
    taurus: "Taurus",
    gemini: "Gemini",
    cancer: "Cancer",
    leo: "Leo",
    virgo: "Virgo",
    libra: "Libra",
    scorpio: "Scorpio",
    sagittarius: "Sagittarius",
    capricorn: "Capricorn",
    aquarius: "Aquarius",
    pisces: "Pisces",
  };
  return map[String(key).toLowerCase()] || "";
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


async function uploadCarouselSlides({
  storage,
  bucketName,
  dateLocal,
  buffers,
  expiresDays = 7,
} = {}) {
  if (!storage) throw new Error("storage missing");
  if (!bucketName) throw new Error("bucket missing");
  if (!Array.isArray(buffers) || buffers.length === 0) throw new Error("buffers missing");

  const bucket = storage.bucket(bucketName);
  const urls = [];
  const paths = [];
  const expiresMs = Math.max(1, Number(expiresDays) || 7) * 24 * 60 * 60 * 1000;

  for (let i = 0; i < buffers.length; i++) {
    const index = i + 1;
    const relPath = path.posix.join("ig", "carousel", String(dateLocal), `slide-${index}.png`);
    const file = bucket.file(relPath);
    await file.save(buffers[i], {
      contentType: "image/png",
      resumable: false,
      metadata: { cacheControl: "private, max-age=0, no-transform" },
    });
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + expiresMs,
      version: "v4",
    });
    urls.push(url);
    paths.push(relPath);
  }

  return { ok: true, urls, paths, bucket: bucketName };
}

async function uploadCarouselSlide({
  storage,
  bucketName,
  dateLocal,
  buffer,
  index,
  expiresDays = 7,
} = {}) {
  const t0 = Date.now();
  if (!storage) throw new Error("storage missing");
  if (!bucketName) throw new Error("bucket missing");
  if (!buffer) throw new Error("buffer missing");
  const bucket = storage.bucket(bucketName);
  const expiresMs = Math.max(1, Number(expiresDays) || 7) * 24 * 60 * 60 * 1000;
  const relPath = path.posix.join("ig", "carousel", String(dateLocal), `slide-${index}.png`);
  const file = bucket.file(relPath);
  await file.save(buffer, {
    contentType: "image/png",
    resumable: false,
    metadata: { cacheControl: "private, max-age=0, no-transform" },
  });
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresMs,
    version: "v4",
  });
  console.log("[cron/ig/post] upload_slide", {
    index,
    ms: Date.now() - t0,
    bytes: buffer?.length || 0,
  });
  return { url, path: relPath };
}

async function renderAndUploadCarouselSlides({
  storage,
  bucketName,
  dateLocal,
  carousel,
  expiresDays = 7,
  backgroundCache = null,
} = {}) {
  if (!carousel) throw new Error("carousel missing");
  const t0 = Date.now();
  const urls = [];
  const paths = [];
  console.log("[cron/ig/post] render_start");
  await renderInstagramCarousel({
    ...carousel,
    backgroundCache,
    onSlide: async ({ index, buffer }) => {
      const uploaded = await uploadCarouselSlide({
        storage,
        bucketName,
        dateLocal,
        buffer,
        index: index + 1,
        expiresDays,
      });
      urls.push(uploaded.url);
      paths.push(uploaded.path);
    },
  });
  console.log("[cron/ig/post] render_done", { ms: Date.now() - t0 });
  return { ok: true, urls, paths, bucket: bucketName };
}

async function runIgPost(deps, opts = {}) {
  const env = deps?.env || {};
  const env2 = { ...(env || {}), ...(process.env || {}) };
  const storyService = deps?.storyService;
  const storage = deps?.storage;
  const storageClient = await createStorageClient({ storage, env: env2 });
  const db = deps?.db;
  const admin = deps?.admin;
  const dict = deps?.dict || require("../../content/dict");

  if (!storyService?.buildStoryForUser) throw new Error("storyService missing");

  const now = opts.asOfISO ? new Date(opts.asOfISO) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("invalid as_of");
  const asOfISO = opts.asOfISO || now.toISOString();
  const dateLocal = opts.dateLocal || toDateLocalJST(now);
  const useAi = opts.useAi !== false;
  const withCta = opts.withCta !== false;
  const dryRun = opts.dryRun === true || env2.IG_POST_DRY_RUN === true;
  const localOnly = toBool(
    opts.local ?? opts.localOnly ?? opts.local_only ?? env2.IG_POST_LOCAL_ONLY,
    false
  );
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.IG_POST_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "ig", "post", dateLocal)
  );
  const backgroundCache = resolveBackgroundCache(env2);
  const force =
    opts.force === true ||
    opts.force_lock === true ||
    opts.forceLock === true ||
    env2.IG_POST_FORCE === true;

  const lockTtlMin = Number(env2.IG_POST_LOCK_TTL_MIN || 30);
  const lockTtlMs = Number.isFinite(lockTtlMin) ? Math.max(1, lockTtlMin) * 60 * 1000 : 30 * 60 * 1000;
  let lockRef = null;

  if (!dryRun && !localOnly && db && !force) {
    const lock = await claimCronLock({ db, admin, id: `ig_post_${dateLocal}`, ttlMs: lockTtlMs });
    if (!lock.ok) {
      return {
        ok: true,
        skipped: true,
        reason: lock.reason || "already_posted",
        date_local: dateLocal,
        as_of: asOfISO,
      };
    }
    lockRef = lock.ref;
  }

  let story;
  try {
    const tStory = Date.now();
    story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;
    console.log("[cron/ig/post] story_built", { ms: Date.now() - tStory });

    const igOut = ensureIgOutputs(story);
    const preferredAspect = pickPreferredResonanceAspect(story, { resonanceMode: opts.resonanceMode });
    if (preferredAspect) {
      igOut.source.resonance_aspect = preferredAspect;
      igOut.source.resonance_aspect_key = buildAspectKey(preferredAspect, { includeOrb: true });
    } else {
      igOut.source.resonance_aspect_key = "";
    }

    const tAi = Date.now();
    story = await maybeGenerateIgOutputs({ story, dict, env: env2, asOfISO, useAi, forceAi: opts.forceAi });
    console.log("[cron/ig/post] ai_done", { ms: Date.now() - tAi, useAi });

    const carousel = buildCarouselSlides({ story, dateLocal, withCta, dict });
    const topAspect = igOut?.source?.resonance_aspect || story?.public?.sky_top?.[0] || story?.public?.sky_all?.[0] || null;
    const caption = renderIGCaption(story);

    if (localOnly) {
      const buffers = await renderInstagramCarousel({ ...carousel, backgroundCache });
      const localPaths = writeLocalCarousel({ buffers, outDir: localOutDir, prefix: "slide" });
      const jsonPath = writeLocalJson({
        data: {
          ok: true,
          dry_run: true,
          local_only: true,
          date_local: dateLocal,
          as_of: asOfISO,
          resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
          resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
          resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
          slide3_display_aspect: topAspect || null,
          caption,
          carousel,
        },
        outDir: localOutDir,
        filename: "ig_post.json",
      });
      return {
        ok: true,
        dry_run: true,
        local_only: true,
        date_local: dateLocal,
        as_of: asOfISO,
        resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
        resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
        resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
        slide3_display_aspect: topAspect || null,
        ai_input_aspect: story?.outputs?.ig?.source?.resonance_aspect || null,
        caption,
        local_dir: localOutDir,
        local_paths: localPaths,
        local_json: jsonPath,
      };
    }

    const accessToken = env2.IG_ACCESS_TOKEN;
    const igUserId = env2.IG_USER_ID;
    const graphVersion = env2.IG_GRAPH_VERSION || "v19.0";
    if (!accessToken) throw new Error("IG_ACCESS_TOKEN missing");
    if (!igUserId) throw new Error("IG_USER_ID missing");
    if (!storageClient) throw new Error("storage missing");

    const bucketName = env2.IG_GCS_BUCKET || env2.GCS_BUCKET_SORA || env2.GCS_BUCKET_BLUEPRINTS;
    const tRender = Date.now();
    const upload = await renderAndUploadCarouselSlides({
      storage: storageClient,
      bucketName,
      dateLocal,
      carousel,
      expiresDays: env2.IG_IMAGE_URL_EXPIRES_DAYS,
      backgroundCache,
    });
    console.log("[cron/ig/post] render_upload_done", { ms: Date.now() - tRender });

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        date_local: dateLocal,
        as_of: asOfISO,
        resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
        resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
        resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
        slide3_display_aspect: topAspect || null,
        ai_input_aspect: story?.outputs?.ig?.source?.resonance_aspect || null,
        caption,
        image_urls: upload.urls,
        gcs_paths: upload.paths,
      };
    }

    const childIds = [];
    for (const imageUrl of upload.urls) {
      const created = await createImageContainer({
        igUserId,
        imageUrl,
        accessToken,
        version: graphVersion,
      });
      const childId = created?.id;
      if (!childId) throw new Error("child container id missing");
      const wait = await waitForContainer({ creationId: childId, accessToken, version: graphVersion });
      if (!wait.ok) throw new Error(`child container not ready: ${childId}`);
      childIds.push(childId);
    }

    const carouselContainer = await createCarouselContainer({
      igUserId,
      children: childIds,
      caption,
      accessToken,
      version: graphVersion,
    });
    const creationId = carouselContainer?.id;
    if (!creationId) throw new Error("carousel container id missing");

    const tWait = Date.now();
    const waitCarousel = await waitForContainer({ creationId, accessToken, version: graphVersion });
    console.log("[cron/ig/post] wait_carousel_done", { ms: Date.now() - tWait, ok: waitCarousel?.ok });
    if (!waitCarousel.ok) throw new Error(`carousel container not ready: ${creationId}`);

    const published = await publishMedia({
      igUserId,
      creationId,
      accessToken,
      version: graphVersion,
    });

    const result = {
      ok: true,
      date_local: dateLocal,
      as_of: asOfISO,
      resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
      resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
      resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
      slide3_display_aspect: topAspect || null,
      ai_input_aspect: story?.outputs?.ig?.source?.resonance_aspect || null,
      caption,
      image_urls: upload.urls,
      gcs_paths: upload.paths,
      carousel_container_id: creationId,
      media_id: published?.id || null,
      child_container_ids: childIds,
    };

    if (lockRef) {
      await markCronLockSuccess({
        ref: lockRef,
        admin,
        extra: { date_local: dateLocal, media_id: result.media_id || null },
      });
    }

    return result;
  } catch (e) {
    if (lockRef) {
      await markCronLockFailed({ ref: lockRef, admin, error: e?.message || String(e) });
    }
    throw e;
  }
}

async function runIgMoonEventPost(deps, opts = {}) {
  const env = deps?.env || {};
  const env2 = { ...(env || {}), ...(process.env || {}) };
  const storyService = deps?.storyService;
  const dict = deps?.dict || require("../../content/dict");

  if (!storyService?.buildStoryForUser) throw new Error("storyService missing");

  const now = opts.asOfISO ? new Date(opts.asOfISO) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("invalid as_of");
  const asOfISO = opts.asOfISO || now.toISOString();

  const baseDateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST(now);
  const offsetRaw = opts.dateOffsetDays ?? opts.date_offset_days ?? opts.dateOffset ?? opts.date_offset;
  const offsetDays = Number.isFinite(Number(offsetRaw))
    ? Number(offsetRaw)
    : Number.isFinite(Number(env2.IG_MOON_EVENT_DATE_OFFSET_DAYS))
      ? Number(env2.IG_MOON_EVENT_DATE_OFFSET_DAYS)
      : 1;
  const targetDateLocal = addDaysToDateLocalJST(baseDateLocal, offsetDays);
  const withCta = opts.withCta !== false;
  const dryRun = opts.dryRun === true || env2.IG_POST_DRY_RUN === true;
  const useAi = opts.useAi !== false;
  const forceAi = opts.forceAi === true;
  const backgroundCache = resolveBackgroundCache(env2);
  const localOnly = toBool(
    opts.local ?? opts.localOnly ?? opts.local_only ?? env2.IG_MOON_EVENT_LOCAL_ONLY,
    false
  );
  const forceNext = toBool(
    opts.forceNext ?? opts.force_next ?? opts.useNext ?? opts.use_next ?? env2.IG_MOON_EVENT_FORCE_NEXT,
    false
  );
  const eventKindRaw = opts.eventKind ?? opts.event_kind ?? opts.moonEventKind ?? opts.moon_event_kind ?? opts.kind;
  const fullFlag = toBool(opts.full ?? opts.full_moon ?? opts.fullMoon ?? opts.moon_full, false);
  const newFlag = toBool(opts.new ?? opts.new_moon ?? opts.newMoon ?? opts.moon_new, false);
  const eventKind = eventKindRaw
    ? String(eventKindRaw)
    : (fullFlag && !newFlag)
      ? "full"
      : (!fullFlag && newFlag)
        ? "new"
        : "";

  const event = detectMoonEventLocal({
    dateLocal: targetDateLocal,
    asOfISO,
    dict,
    forceNext,
    eventKind,
  });

  if (!event) {
    return {
      ok: true,
      dry_run: dryRun,
      date_local: targetDateLocal,
      as_of: asOfISO,
      skipped: true,
      reason: "moon_event_missing",
      date_offset_days: offsetDays,
    };
  }

  const isFullMoonEvent = event?.kind === "full";
  const isNewMoonEvent = event?.kind === "new";
  const eventDateLocal = toDateLocalJST(event.date);
  const eventAsOfISO = event?.date instanceof Date ? event.date.toISOString() : asOfISO;

  const story = (await buildPublicStorySnapshot({ storyService, dateLocal: eventDateLocal, asOfISO: eventAsOfISO, save: false })).story;

  let summaryText = "";
  let moonPlacementText = "";
  let sunMoonText = "";
  let moonResonanceText = "";
  let caption = buildMoonEventCaption(event);
  const moonResonanceAspect = pickMoonResonanceAspect(story);
  if (useAi) {
    const apiKey = String(env2.OPENAI_API_KEY || "").trim();
    if (apiKey) {
      try {
        const openai = { apiKey, baseUrl: env2.OPENAI_BASE_URL, model: env2.OPENAI_MODEL };
        const placementRes = await generateIgMoonEventPlacementText({ story, dict, event, openai, forceAi });
        if (placementRes?.ok && placementRes.text) moonPlacementText = placementRes.text;

        const sunMoonRes = await generateIgMoonEventSunMoonText({ story, dict, event, openai, forceAi });
        if (sunMoonRes?.ok && sunMoonRes.text) sunMoonText = sunMoonRes.text;

        if (moonResonanceAspect) {
          const resonanceRes = await generateIgMoonEventResonanceText({
            story,
            dict,
            aspect: moonResonanceAspect,
            openai,
            forceAi,
          });
          if (resonanceRes?.ok && resonanceRes.text) moonResonanceText = resonanceRes.text;
        }

        const airRes = await generateIgMoonEventAirText({
          story,
          dict,
          event,
          resonanceAspect: moonResonanceAspect,
          openai,
          forceAi,
        });
        if (airRes?.ok && airRes.text) summaryText = airRes.text;

        const captionRes = await generateIgMoonEventCaptionText({
          story,
          dict,
          event,
          resonanceAspect: moonResonanceAspect,
          openai,
          forceAi,
        });
        if (captionRes?.ok && captionRes.text) caption = captionRes.text;
      } catch (_err) {
        summaryText = "";
      }
    }
  }

  const carousel = buildMoonEventCarouselSlides({
    story,
    event,
    dateLocal: eventDateLocal,
    withCta,
    dict,
    summaryText,
    moonPlacementText,
    sunMoonText,
    moonResonanceText,
    moonResonanceAspect,
  });
  carousel.seedVariant = "moon_event";
  carousel.spaceConfig = resolveMoonEventSpaceConfig(event);

  if (localOnly) {
    const buffers = await renderInstagramCarousel({ ...carousel, backgroundCache });
    const localOutDir = String(
      opts.localOutDir ||
      opts.local_out_dir ||
      env2.IG_MOON_EVENT_LOCAL_OUT_DIR ||
      path.join(process.cwd(), "tmp", "ig-moon-event", eventDateLocal)
    );
    const localPaths = writeLocalCarousel({ buffers, outDir: localOutDir, prefix: "slide" });
    writeLocalJson({
      data: {
        ok: true,
        dry_run: true,
        local_only: true,
        date_local: eventDateLocal,
        as_of: asOfISO,
        event: {
          kind: event.kind,
          is_full: isFullMoonEvent,
          is_new: isNewMoonEvent,
          label: event.label,
          date_label: event.dateLabel,
        },
        caption,
        carousel,
      },
      outDir: localOutDir,
      filename: "ig_post.json",
    });
    return {
      ok: true,
      dry_run: true,
      local_only: true,
      date_local: eventDateLocal,
      as_of: asOfISO,
      event: {
        kind: event.kind,
        is_full: isFullMoonEvent,
        is_new: isNewMoonEvent,
        label: event.label,
        date_label: event.dateLabel,
      },
      caption,
      local_dir: localOutDir,
      local_paths: localPaths,
    };
  }

  const storage = deps?.storage;
  const storageClient = await createStorageClient({ storage, env: env2 });
  const accessToken = env2.IG_ACCESS_TOKEN;
  const igUserId = env2.IG_USER_ID;
  const graphVersion = env2.IG_GRAPH_VERSION || "v19.0";
  if (!storageClient) throw new Error("storage missing");
  if (!accessToken) throw new Error("IG_ACCESS_TOKEN missing");
  if (!igUserId) throw new Error("IG_USER_ID missing");

  const bucketName = env2.IG_GCS_BUCKET || env2.GCS_BUCKET_SORA || env2.GCS_BUCKET_BLUEPRINTS;
  const upload = await renderAndUploadCarouselSlides({
    storage: storageClient,
    bucketName,
    dateLocal: eventDateLocal,
    carousel,
    expiresDays: env2.IG_IMAGE_URL_EXPIRES_DAYS,
    backgroundCache,
  });

  // caption already resolved (AI or fallback)

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      date_local: eventDateLocal,
      as_of: asOfISO,
      event: {
        kind: event.kind,
        is_full: isFullMoonEvent,
        is_new: isNewMoonEvent,
        label: event.label,
        date_label: event.dateLabel,
      },
      caption,
      image_urls: upload.urls,
      gcs_paths: upload.paths,
    };
  }

  const childIds = [];
  for (const imageUrl of upload.urls) {
    const created = await createImageContainer({
      igUserId,
      imageUrl,
      accessToken,
      version: graphVersion,
    });
    const childId = created?.id;
    if (!childId) throw new Error("child container id missing");
    const wait = await waitForContainer({ creationId: childId, accessToken, version: graphVersion });
    if (!wait.ok) throw new Error(`child container not ready: ${childId}`);
    childIds.push(childId);
  }

  const carouselContainer = await createCarouselContainer({
    igUserId,
    children: childIds,
    caption,
    accessToken,
    version: graphVersion,
  });
  const creationId = carouselContainer?.id;
  if (!creationId) throw new Error("carousel container id missing");

  const waitCarousel = await waitForContainer({ creationId, accessToken, version: graphVersion });
  if (!waitCarousel.ok) throw new Error(`carousel container not ready: ${creationId}`);

  const published = await publishMedia({
    igUserId,
    creationId,
    accessToken,
    version: graphVersion,
  });

  return {
    ok: true,
    date_local: eventDateLocal,
    as_of: asOfISO,
    event: {
      kind: event.kind,
      label: event.label,
      date_label: event.dateLabel,
    },
    caption,
    image_urls: upload.urls,
    gcs_paths: upload.paths,
    carousel_container_id: creationId,
    media_id: published?.id || null,
    child_container_ids: childIds,
  };
}

module.exports = { runIgPost, runIgMoonEventPost };
