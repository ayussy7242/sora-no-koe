"use strict";

const dict = require("../../../content/dict");
const { buildRetrogradeMap } = require("../../../domain/astro/retrograde");
const {
  ELEMENT_PALETTES,
  ELEMENT_MIST_COLORS,
  ELEMENT_OPACITY_SCALE,
  ELEMENT_BASE_COLORS,
  LONG_THEME_COLORS,
  BACKGROUND_COLORS,
} = require("./constants");
const { clamp, hashString, mulberry32 } = require("./utils");
const { mixColor } = require("../../color_utils");

function pickPalette(topElement, secondaryElement, rand) {
  const primaryBase = ELEMENT_PALETTES[topElement] || ELEMENT_PALETTES.mixed;
  const secondaryBase = ELEMENT_PALETTES[secondaryElement] || primaryBase;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const p1 = pick(primaryBase.nebula);
  const p2 = pick(primaryBase.nebula);
  const s1 = pick(secondaryBase.nebula);
  const s2 = pick(secondaryBase.nebula);
  return {
    primary: {
      nebula: [p1, p2],
      glow: primaryBase.glow,
      star: primaryBase.star,
    },
    secondary: {
      nebula: [s1, s2],
      glow: secondaryBase.glow,
      star: secondaryBase.star,
    },
    glow: rand() < 0.65 ? p1 : s1,
  };
}

function buildLayerProfile(element, rand) {
  const elem = String(element || "mixed");
  const ranges = {
    fire: {
      atmosphere: [0.02, 0.05],
      mist: [0.16, 0.26],
      glow: [0.24, 0.36],
      dust: [0.16, 0.26],
      starHalo: [0.3, 0.42],
    },
    water: {
      atmosphere: [0.04, 0.07],
      mist: [0.18, 0.3],
      glow: [0.22, 0.34],
      dust: [0.1, 0.18],
      starHalo: [0.28, 0.4],
    },
    air: {
      atmosphere: [0.03, 0.06],
      mist: [0.16, 0.26],
      glow: [0.2, 0.3],
      dust: [0.1, 0.16],
      starHalo: [0.24, 0.36],
    },
    earth: {
      atmosphere: [0.02, 0.05],
      mist: [0.16, 0.26],
      glow: [0.18, 0.28],
      dust: [0.2, 0.32],
      starHalo: [0.26, 0.38],
    },
    mixed: {
      atmosphere: [0.03, 0.06],
      mist: [0.16, 0.26],
      glow: [0.2, 0.3],
      dust: [0.16, 0.26],
      starHalo: [0.26, 0.38],
    },
  };
  const pickRange = (range) => {
    const [a, b] = range || [0.05, 0.1];
    return clamp(a + (b - a) * rand(), 0.01, 0.3);
  };
  const base = ranges[elem] || ranges.mixed;
  return {
    atmosphere: { intensity: pickRange(base.atmosphere), coverage: 0.6 },
    mist: { intensity: pickRange(base.mist), coverage: 0.45 },
    glow: { intensity: pickRange(base.glow), coverage: 0.35 },
    dust: { intensity: pickRange(base.dust), coverage: 0.4 },
    starHalo: { intensity: pickRange(base.starHalo), coverage: 0.3 },
  };
}

function buildElementPaletteVariants(element) {
  const elem = String(element || "mixed");
  const pickMixed = () => {
    const choices = ["fire", "water", "air", "earth"];
    const rand = mulberry32(hashString(`${elem}-mixed-pick`));
    return choices[Math.floor(rand() * choices.length)];
  };
  const mixedKey = elem === "mixed" ? pickMixed() : elem;
  const base = ELEMENT_PALETTES[mixedKey] || ELEMENT_PALETTES.mixed;
  const mistList = ELEMENT_MIST_COLORS[elem] || ELEMENT_MIST_COLORS.mixed;
  const presenceMap = {
    fire: 2.1,
    water: 1.95,
    air: 1.8,
    earth: 1.95,
    mixed: 1.85,
  };
  const colorPresence = presenceMap[elem] || 1.3;
  const variants = [];
  for (let i = 0; i < 10; i++) {
    const rand = mulberry32(hashString(`${elem}-variant-${i}`));
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const nebulaA = pick(base.nebula);
    const nebulaB = pick(base.nebula);
    const mistPick = pick(mistList);
    const baseBias = mixColor(BACKGROUND_COLORS.bgDeep, mistPick, 0.42 + rand() * 0.24);
    const glowBase = base.glow || nebulaA;
    const glowColor = mixColor(glowBase, nebulaA, 0.72 + rand() * 0.2);
    const dustTint = mixColor(nebulaB, mistPick, 0.7 + rand() * 0.2);
    const accentStarWarm = mixColor(base.star || "#FFFFFF", nebulaA, 0.3 + rand() * 0.16);
    const accentStarCool = mixColor(base.star || "#FFFFFF", nebulaB, 0.32 + rand() * 0.16);
    const gasColorA = mixColor(nebulaA, glowColor, 0.36 + rand() * 0.2);
    const gasColorB = mixColor(nebulaB, glowColor, 0.36 + rand() * 0.2);
    variants.push({
      baseBias,
      gasColorA,
      gasColorB,
      dustTint,
      glowColor,
      accentStarWarm,
      accentStarCool,
      layers: buildLayerProfile(elem, rand),
      colorPresence,
    });
  }
  return variants;
}

function buildTodayPalette({ palette, topElement, secondaryElement, rand }) {
  const rng = typeof rand === "function" ? rand : mulberry32(hashString("today-palette-default"));
  const primaryVariants = buildElementPaletteVariants(topElement);
  const secondaryVariants = buildElementPaletteVariants(secondaryElement || topElement);
  const pickVariant = (variants) => variants[Math.floor(rng() * variants.length)];
  const primary = pickVariant(primaryVariants);
  const secondary = topElement === secondaryElement ? primary : pickVariant(secondaryVariants);
  const mixSecondary = topElement !== secondaryElement && rng() < 0.4;
  const gasColorB = mixSecondary ? mixColor(primary.gasColorB, secondary.gasColorA, 0.6) : primary.gasColorB;
  const dustTint = mixSecondary ? mixColor(primary.dustTint, secondary.dustTint, 0.55) : primary.dustTint;
  const glowColor = mixSecondary ? mixColor(primary.glowColor, secondary.glowColor, 0.5) : primary.glowColor;

  return {
    baseBias: primary.baseBias,
    gasColorA: primary.gasColorA,
    gasColorB,
    dustTint,
    glowColor,
    accentStarWarm: primary.accentStarWarm,
    accentStarCool: primary.accentStarCool,
    layers: primary.layers,
    colorPresence: primary.colorPresence ?? 1,
  };
}

function pickMistColor(topElement, secondaryElement, rand) {
  const primaryMist = ELEMENT_MIST_COLORS[topElement] || ELEMENT_MIST_COLORS.mixed;
  const secondaryMist = ELEMENT_MIST_COLORS[secondaryElement] || primaryMist;
  const primaryPick = primaryMist[Math.floor(rand() * primaryMist.length)];
  const secondaryPick = secondaryMist[Math.floor(rand() * secondaryMist.length)];
  if (topElement === secondaryElement) return primaryPick;
  return rand() < 0.65 ? primaryPick : secondaryPick;
}

function pickOpacityScale(element) {
  const key = String(element || "mixed");
  return ELEMENT_OPACITY_SCALE[key] ?? 1.0;
}

function computeSpaceMoodProfile({ story, theme }) {
  const topElement = theme?.topElement || "mixed";
  const modality = theme?.modality || "mixed";
  const concentration = clamp(Number(theme?.concentration ?? 0.35), 0, 1);
  const aspect = theme?.aspect || null;
  const orb = Number.isFinite(Number(theme?.orb)) ? Number(theme?.orb) : null;

  const elementBase = {
    fire: { filament: 0.78, ridge: 0.55, dust: 0.32, glow: 0.7, silence: 0.2, turbulence: 0.65, cluster: 0.55 },
    earth: { filament: 0.45, ridge: 0.7, dust: 0.75, glow: 0.3, silence: 0.35, turbulence: 0.4, cluster: 0.6 },
    air: { filament: 0.38, ridge: 0.25, dust: 0.2, glow: 0.35, silence: 0.7, turbulence: 0.3, cluster: 0.35 },
    water: { filament: 0.5, ridge: 0.32, dust: 0.28, glow: 0.52, silence: 0.6, turbulence: 0.45, cluster: 0.4 },
    mixed: { filament: 0.55, ridge: 0.45, dust: 0.4, glow: 0.45, silence: 0.45, turbulence: 0.5, cluster: 0.45 },
  };
  const base = elementBase[topElement] || elementBase.mixed;

  let filament = base.filament;
  let ridge = base.ridge;
  let dust = base.dust;
  let glow = base.glow;
  let silence = base.silence;
  let turbulence = base.turbulence;
  let clusterBias = base.cluster;

  if (modality === "cardinal") {
    filament += 0.12;
    ridge += 0.06;
    turbulence += 0.12;
  } else if (modality === "fixed") {
    clusterBias += 0.18;
    dust += 0.08;
    ridge += 0.08;
    silence -= 0.08;
  } else if (modality === "mutable") {
    filament -= 0.05;
    dust -= 0.04;
    turbulence += 0.08;
    silence += 0.1;
  }

  if (aspect && orb != null) {
    const tight = clamp(1 - orb / 4, 0, 1);
    const type = String(aspect?.type || aspect?.aspect || "").toLowerCase();
    if (type.includes("conj")) glow += 0.12 * tight;
    if (type.includes("opp")) ridge += 0.15 * tight;
    if (type.includes("square")) ridge += 0.18 * tight;
    if (type.includes("trine")) filament += 0.1 * tight;
    if (type.includes("sextile")) filament += 0.05 * tight;
  }

  if (concentration > 0.5) {
    clusterBias += 0.1;
    filament -= 0.05;
  }

  const heroRegionCount = concentration > 0.55 ? 1 : 2;
  const flowType =
    modality === "cardinal" ? "single_stream" :
      modality === "fixed" ? "clustered_void" :
        modality === "mutable" ? "split_stream" :
          "single_stream";
  const aspectType = String(aspect?.type || aspect?.aspect || "").toLowerCase();
  const useBandCross = aspectType.includes("opp") || aspectType.includes("square");
  const resolvedFlowType = useBandCross ? "band_cross" : flowType;

  const heroRegionType = ["cluster", "filament"];
  if (dust > 0.6) heroRegionType.push("dustlane");

  return {
    densityClass: concentration > 0.6 ? "dense" : concentration < 0.3 ? "sparse" : "medium",
    turbulence: clamp(turbulence, 0, 1),
    structureEmphasis: clamp(ridge, 0, 1),
    clusterBias: clamp(clusterBias, 0, 1),
    dustLevel: clamp(dust, 0, 1),
    filamentLevel: clamp(filament, 0, 1),
    glowLevel: clamp(glow, 0, 1),
    silenceLevel: clamp(silence, 0, 1),
    heroRegionCount,
    heroRegionType,
    flowType: resolvedFlowType,
    contrastBudget: clamp(0.35 + (1 - silence) * 0.4, 0.2, 0.9),
  };
}

function signElement(signKey) {
  const key = String(signKey || "").toLowerCase();
  if (!key) return null;
  return (
    dict?.SIGNS_V2?.signs?.[key]?.element ||
    dict?.SIGNS_V1?.signs?.[key]?.element ||
    null
  );
}

function normalizeElementKey(value) {
  const key = String(value || "").toLowerCase();
  if (key === "fire" || key === "earth" || key === "air" || key === "water") return key;
  return "mixed";
}

function buildElementCountFromTransitSigns(transitSigns) {
  if (!transitSigns || typeof transitSigns !== "object") return {};
  const weights = {
    sun: 1.6,
    moon: 1.6,
    mercury: 1.0,
    venus: 1.0,
    mars: 1.0,
    jupiter: 0.9,
    saturn: 0.9,
    uranus: 0.7,
    neptune: 0.7,
    pluto: 0.6,
  };
  const counts = { fire: 0, earth: 0, air: 0, water: 0 };
  Object.entries(transitSigns).forEach(([body, info]) => {
    const signKey = info?.sign_key || info?.sign || info?.sign_id || info?.key;
    const element = signElement(signKey);
    if (!element) return;
    const weight = Number(weights[body]) || 1;
    counts[element] = (counts[element] || 0) + weight;
  });
  return counts;
}

function pickElementsFromCounts(counts, fallback = "mixed") {
  const entries = Object.entries(counts || {})
    .filter(([k, v]) => k !== "unknown" && Number(v) > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = entries[0]?.[0] || fallback;
  const secondary = entries[1]?.[0] || top;
  return { top, secondary, entries };
}

function pickLongThemeColor(longRow, topElement, rand) {
  const pickFrom = (val) => {
    if (Array.isArray(val)) {
      const rng = typeof rand === "function" ? rand : mulberry32(hashString(`${topElement || "mixed"}-long-theme`));
      const r = rng();
      return val[Math.floor(r * val.length)];
    }
    return val;
  };
  if (longRow) {
    const aElem = signElement(longRow?.a_sign_key);
    const bElem = signElement(longRow?.b_sign_key);
    const elem = aElem || bElem || topElement || "mixed";
    const list = LONG_THEME_COLORS[elem] || LONG_THEME_COLORS.mixed;
    return pickFrom(list);
  }
  const list = LONG_THEME_COLORS[topElement] || LONG_THEME_COLORS.mixed;
  return pickFrom(list);
}

function pickFogPattern(topElement, topHouse) {
  if (topHouse && Number(topHouse.count) >= 4) {
    const houseNo = Number(topHouse.house_no || 0);
    if (houseNo >= 1 && houseNo <= 3) return "rightTop";
    if (houseNo >= 4 && houseNo <= 6) return "leftBottom";
    if (houseNo >= 7 && houseNo <= 9) return "leftTop";
    if (houseNo >= 10 && houseNo <= 12) return "rightTop";
  }
  const elem = String(topElement || "mixed");
  if (elem === "fire") return "leftTop";
  if (elem === "water") return "center";
  if (elem === "air") return "diagonal";
  if (elem === "earth") return "rightBottom";
  return "center";
}

function pickBaseColor(_topElement, _secondaryElement, rand) {
  return BACKGROUND_COLORS.bgDeep;
}

function buildStarColorWeights(topElement, secondaryElement) {
  const base = { white: 0.6, blue: 0.25, yellow: 0.1, red: 0.05 };
  const clampWeight = (v) => Math.max(0.02, v);
  const boost = (elem, amount) => {
    const out = { ...base };
    if (elem === "fire") {
      out.yellow += amount * 0.85;
      out.red += amount * 0.55;
      out.white -= amount * 0.4;
      out.blue -= amount * 0.45;
    } else if (elem === "water") {
      out.white += amount * 0.55;
      out.blue += amount * 0.75;
      out.yellow -= amount * 0.55;
      out.red -= amount * 0.55;
    } else if (elem === "air") {
      out.white += amount * 0.45;
      out.blue += amount * 0.55;
      out.yellow += amount * 0.25;
      out.red -= amount * 0.55;
    } else if (elem === "earth") {
      out.white += amount * 0.35;
      out.yellow += amount * 0.8;
      out.blue -= amount * 0.55;
      out.red -= amount * 0.35;
    }
    out.white = clampWeight(out.white);
    out.blue = clampWeight(out.blue);
    out.yellow = clampWeight(out.yellow);
    out.red = clampWeight(out.red);
    const total = out.white + out.blue + out.yellow + out.red;
    out.white /= total;
    out.blue /= total;
    out.yellow /= total;
    out.red /= total;
    return out;
  };
  const primary = boost(topElement, 0.12);
  const secondary = boost(secondaryElement, 0.06);
  return {
    white: (primary.white + secondary.white) / 2,
    blue: (primary.blue + secondary.blue) / 2,
    yellow: (primary.yellow + secondary.yellow) / 2,
    red: (primary.red + secondary.red) / 2,
  };
}

function computeSpaceTheme({ story, dateLabel, seedLabel, variant = "slide1" }) {
  const dateSeed = String(seedLabel || story?.meta?.date_local || story?.public?.date_local || dateLabel || "");
  const skyStrata = story?.public?.sky_strata || story?.meta?.sky_strata || {};
  const elementCount = skyStrata?.element_count || {};
  const modality = skyStrata?.top_modality || "mixed";

  const transitSigns = story?.public?.transit_signs || story?.public?.sky_positions || {};
  const derivedCounts = buildElementCountFromTransitSigns(transitSigns);
  const hasElementCount = Object.values(elementCount || {}).some((v) => Number(v) > 0);
  const baseCounts = hasElementCount ? elementCount : derivedCounts;
  const { top: derivedTop, secondary: derivedSecondary } = pickElementsFromCounts(baseCounts, "mixed");

  const rawTop = normalizeElementKey(skyStrata?.top_element);
  const topElement = rawTop !== "mixed" ? rawTop : derivedTop;
  const secondaryElement = derivedSecondary || topElement;

  const seedStr = [
    dateSeed,
    `${topElement}-${secondaryElement}`,
    modality,
  ]
    .filter(Boolean)
    .join("_");
  const paletteSeed = hashString(`${seedStr}_palette`);
  const paletteRand = mulberry32(paletteSeed);
  const palette = pickPalette(topElement, secondaryElement, paletteRand);
  const todayPalette = buildTodayPalette({
    palette,
    topElement,
    secondaryElement,
    rand: paletteRand,
  });

  const houseFocus = story?.public?.house_focus || {};
  const topHouse = houseFocus?.top?.[0] || null;
  const totalBodies = Number(houseFocus?.total || 10);
  const concentration = topHouse && totalBodies > 0 ? Number(topHouse.count || 0) / totalBodies : 0.35;

  const aspectCount = Array.isArray(story?.public?.sky_all) ? story.public.sky_all.length : 0;

  const aspect = story?.public?.sky_top?.[0] || story?.public?.sky_all?.[0] || null;
  const orb = Number.isFinite(Number(aspect?.orb_deg)) ? Number(aspect.orb_deg) : null;

  const bodyOrder = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
  const retroMap = buildRetrogradeMap(story?.meta?.as_of || null, bodyOrder);
  const retroCount = Object.values(retroMap || {}).filter(Boolean).length;

  const aspectKey = aspect
    ? `${aspect?.a || ""}-${aspect?.b || ""}-${aspect?.type || aspect?.aspect || ""}-${aspect?.aspect_deg || ""}`
    : "";
  const houseKey = topHouse ? `h${topHouse.house_no}` : "h0";
  const kinjitsu = story?.public?.kinjitsu_short?.[0] || null;
  const kinjitsuKey = kinjitsu ? `${kinjitsu?.a || ""}-${kinjitsu?.b || ""}-${kinjitsu?.aspect || ""}` : "";
  const seedStrFull = [
    dateSeed,
    aspectKey,
    `${topElement}-${secondaryElement}`,
    modality,
    houseKey,
    kinjitsuKey,
  ]
    .filter(Boolean)
    .join("_");
  const seed = hashString(seedStrFull || "sora-no-koe");
  const longRow = story?.public?.kinjitsu_long?.[0] || null;

  const mood = computeSpaceMoodProfile({
    story,
    theme: {
      topElement,
      secondaryElement,
      modality,
      concentration: clamp(concentration, 0, 1),
      aspect,
      orb,
      retroCount,
      topHouse,
    },
  });

  return {
    seed,
    palette,
    todayPalette,
    modality,
    topElement,
    secondaryElement,
    concentration: clamp(concentration, 0, 1),
    aspectCount,
    topHouse,
    aspect,
    orb,
    retroCount,
    longThemeColor: pickLongThemeColor(longRow, topElement, paletteRand),
    fogPattern: pickFogPattern(topElement, topHouse),
    mood,
  };
}

module.exports = {
  pickPalette,
  buildTodayPalette,
  pickMistColor,
  pickOpacityScale,
  signElement,
  pickLongThemeColor,
  pickFogPattern,
  pickBaseColor,
  buildStarColorWeights,
  computeSpaceMoodProfile,
  computeSpaceTheme,
};
