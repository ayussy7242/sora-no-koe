"use strict";

const { hashString, mulberry32, clamp, lerp } = require("./utils");
const { computeSpaceTheme, pickBaseColor, buildStarColorWeights, pickOpacityScale, pickMistColor } = require("./theme");
const {
  buildVoidMap,
  buildTextAvoidField,
  buildStreamAxis,
  buildStreamGaps,
  buildDensitySampler,
  buildStreamNodes,
  buildSphereClusters,
  buildFilamentField,
  buildRidgeField,
  buildExtinctionField,
  buildFlowField,
} = require("./fields");
const {
  buildDeepFieldRegions,
  buildAnchorClusters,
  buildHeroRegions,
} = require("./regions");
const {
  buildDeepSpaceLayer,
  buildBaseColorNoiseLayer,
  buildMilkyBandLayer,
  buildDarkLaneLayer,
} = require("./layers/base");
const {
  buildColorAtmosphereLayer,
} = require("./layers/gas");
const {
  buildCosmicDustLayer,
  buildMilkyDustLayer,
} = require("./layers/dust");
const {
  buildClusterField,
  buildDeepFieldLayer,
  buildMicroSharpLayer,
  buildStarLayers,
  buildHeroStars,
} = require("./layers/stars");
const { buildAspectLines } = require("./layers/overlays");
const { BACKGROUND_COLORS } = require("./constants");

const WORLD_CACHE = new Map();

function buildStarPopulationTheme({ theme, mood }) {
  const element = String(theme?.topElement || "mixed");
  const modality = String(theme?.modality || "mixed");
  const concentration = clamp(Number(theme?.concentration ?? 0.35), 0, 1);

  let densityBias = 0.92 + concentration * 0.28;
  let heroBoost = 0.06;
  let clusterTightness = 0.45;
  let clusterFragmentation = 0.35;
  let streamAdhesion = 0.45;
  let isolatedBrightBias = 0.16;
  let haloSoftness = 0.45;
  let extinctionStrength = 0.18;
  let todayColorMix = 0.22;

  if (element === "fire") {
    heroBoost += 0.08;
    clusterFragmentation += 0.08;
    haloSoftness -= 0.08;
    streamAdhesion += 0.08;
  } else if (element === "water") {
    densityBias += 0.05;
    haloSoftness += 0.15;
    todayColorMix += 0.06;
  } else if (element === "air") {
    isolatedBrightBias += 0.08;
    streamAdhesion += 0.1;
    haloSoftness += 0.05;
  } else if (element === "earth") {
    clusterTightness += 0.15;
    extinctionStrength += 0.18;
    haloSoftness -= 0.05;
  }

  if (modality === "fixed") {
    clusterTightness += 0.12;
    clusterFragmentation -= 0.05;
  } else if (modality === "mutable") {
    clusterFragmentation += 0.1;
    streamAdhesion += 0.08;
  } else if (modality === "cardinal") {
    streamAdhesion += 0.1;
    heroBoost += 0.03;
  }

  clusterTightness += clamp(mood?.clusterBias ?? 0.45, 0, 1) * 0.35;
  clusterFragmentation += clamp(mood?.turbulence ?? 0.5, 0, 1) * 0.35;
  streamAdhesion += clamp(mood?.filamentLevel ?? 0.5, 0, 1) * 0.35;
  isolatedBrightBias += clamp(mood?.silenceLevel ?? 0.45, 0, 1) * 0.2;
  heroBoost += clamp(mood?.glowLevel ?? 0.5, 0, 1) * 0.06;
  extinctionStrength += clamp(mood?.dustLevel ?? 0.4, 0, 1) * 0.25;
  todayColorMix += clamp(mood?.glowLevel ?? 0.5, 0, 1) * 0.08;

  return {
    densityBias: clamp(densityBias, 0.8, 1.35),
    heroBoost: clamp(heroBoost, 0.04, 0.22),
    clusterTightness: clamp(clusterTightness, 0.25, 0.95),
    clusterFragmentation: clamp(clusterFragmentation, 0.2, 0.95),
    streamAdhesion: clamp(streamAdhesion, 0.25, 0.95),
    isolatedBrightBias: clamp(isolatedBrightBias, 0.08, 0.45),
    haloSoftness: clamp(haloSoftness, 0.2, 0.9),
    extinctionStrength: clamp(extinctionStrength, 0.1, 0.6),
    todayColorMix: clamp(todayColorMix, 0.18, 0.5),
  };
}

function buildSpaceWorld({ story, dateLabel, width, height, worldWidth, theme, avoidRegions = [] }) {
  const worldTheme = theme || computeSpaceTheme({ story, dateLabel, variant: "world" });
  const worldId = `world-${worldTheme.seed}`;
  const rand = mulberry32(worldTheme.seed);
  const streamRand = mulberry32(hashString(`${worldTheme.seed}_stream`));
  const nodeRand = mulberry32(hashString(`${worldTheme.seed}_nodes`));
  const voidRand = mulberry32(hashString(`${worldTheme.seed}_voids`));
  const defs = [];
  const body = [];

  const spreadPatterns = ["leftTop", "rightBottom", "diagonal", "leftBottom"];
  const spreadPattern = spreadPatterns[worldTheme.seed % spreadPatterns.length];
  const flowType = worldTheme?.mood?.flowType || "single_stream";
  const stream = buildStreamAxis({ rand: streamRand, width: worldWidth, height, flowType });
  const streamGaps = buildStreamGaps({ rand: streamRand });
  if (stream?.alt) {
    stream.alt.gaps = buildStreamGaps({ rand: mulberry32(hashString(`${worldTheme.seed}_stream_alt`)) });
  }
  const streamNodes = buildStreamNodes({ rand: nodeRand, stream, count: 3 + Math.floor(nodeRand() * 4) });
  const slideCount = Math.max(1, Math.round(worldWidth / width));
  const safeZone = null;
  const variantOrderFull = ["slide1", "slide2", "moon", "slide2", "slide3", "slide5"];
  const variantOrder = slideCount >= 2
    ? variantOrderFull.slice(0, slideCount)
    : Array.from({ length: slideCount }).map(() => "slide1");
  const buildSafeZoneForVariant = (variant, offsetX) => {
    if (variant === "moon") {
      return { x: offsetX + width * 0.08, y: height * 0.16, w: width * 0.7, h: height * 0.56 };
    }
    if (variant === "slide2") {
      return { x: offsetX + width * 0.12, y: height * 0.14, w: width * 0.76, h: height * 0.72 };
    }
    if (variant === "slide3") {
      return { x: offsetX + width * 0.08, y: height * 0.18, w: width * 0.8, h: height * 0.6 };
    }
    if (variant === "slide4") {
      return { x: offsetX + width * 0.1, y: height * 0.16, w: width * 0.8, h: height * 0.66 };
    }
    if (variant === "slide5") {
      return { x: offsetX + width * 0.12, y: height * 0.28, w: width * 0.76, h: height * 0.42 };
    }
    return { x: offsetX + width * 0.06, y: height * 0.22, w: width * 0.78, h: height * 0.4 };
  };
  const avoidRegionsBySlide = Array.from({ length: slideCount }).map(() => []);
  if (Array.isArray(avoidRegions) && avoidRegions.length) {
    avoidRegions.forEach((field) => {
      const w = Number(field?.w) || 0;
      const h = Number(field?.h) || 0;
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
      const idx = Number.isFinite(Number(field?.slideIndex))
        ? Number(field.slideIndex)
        : Math.floor(((Number(field?.x) || 0) + w * 0.5) / width);
      if (idx >= 0 && idx < slideCount) avoidRegionsBySlide[idx].push(field);
    });
  }

  const slideSafeZones = Array.from({ length: slideCount }).map((_, i) => {
    const fields = avoidRegionsBySlide[i] || [];
    if (fields.length) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      fields.forEach((f) => {
        const x = Number(f.x) || 0;
        const y = Number(f.y) || 0;
        const w = Number(f.w) || 0;
        const h = Number(f.h) || 0;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
      });
      const pad = 24;
      return {
        x: minX - pad,
        y: minY - pad,
        w: (maxX - minX) + pad * 2,
        h: (maxY - minY) + pad * 2,
      };
    }
    return buildSafeZoneForVariant(variantOrder[i], width * i);
  });

  const textAvoidField = buildTextAvoidField({ avoidRegions });
  const voidMap = buildVoidMap({ rand: voidRand, width: worldWidth, height });
  const anchorClusters = buildAnchorClusters({
    rand: nodeRand,
    width: worldWidth,
    height,
    stream,
    safeZones: slideSafeZones,
  });
  const deepFieldRegions = buildDeepFieldRegions({
    rand: nodeRand,
    width: worldWidth,
    height,
    stream,
    avoidRect: safeZone,
  });
  const heroRegions = buildHeroRegions({
    rand: mulberry32(hashString(`${worldTheme.seed}_heroRegions`)),
    width,
    height,
    slideCount,
    safeZones: slideSafeZones,
    mood: worldTheme.mood,
  });
  const slide1ExtraClusters = (() => {
    if (!slideCount) return [];
    const randExtra = mulberry32(hashString(`${worldTheme.seed}_slide1_extra_cluster`));
    const safe = slideSafeZones[0] || null;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const minR = Math.min(width, height) * 0.32;
    const maxR = Math.min(width, height) * 0.46;
    let x = centerX;
    let y = centerY;
    for (let t = 0; t < 28; t++) {
      const angle = randExtra() * Math.PI * 2;
      const radius = minR + randExtra() * (maxR - minR);
      x = centerX + Math.cos(angle) * radius;
      y = centerY + Math.sin(angle) * radius;
      if (safe && x > safe.x && x < safe.x + safe.w && y > safe.y && y < safe.y + safe.h) {
        continue;
      }
      break;
    }
    const baseR = width * (0.075 + randExtra() * 0.02);
    return [{
      x,
      y,
      rx: baseR * 1.05,
      ry: baseR * 0.72,
      rot: randExtra() * Math.PI * 2,
      fray: 0.24 + randExtra() * 0.12,
      weight: 0.7,
      boost: 1.02,
      laneShift: (randExtra() - 0.5) * 0.4,
      type: "open",
      coreBoost: 0.08 + randExtra() * 0.02,
    }];
  })();
  const heroClusterRegions = heroRegions
    .filter((r) => r.type === "cluster")
    .map((r) => ({
      x: r.x,
      y: r.y,
      rx: r.r * 1.2,
      ry: r.r * 0.8,
      rot: rand() * Math.PI * 2,
      fray: 0.2 + rand() * 0.2,
      weight: 0.9,
      boost: 1.9,
      laneShift: (rand() - 0.5) * 0.6,
      type: "hero",
    }));
  const anchorClustersAll = [...anchorClusters, ...heroClusterRegions];
  const densityAt = buildDensitySampler({
    seed: hashString(`${worldTheme.seed}_density`),
    width: worldWidth,
    height,
    voids: voidMap.voids,
    stream,
    gaps: streamGaps,
    nodes: streamNodes,
    hotspots: [...deepFieldRegions, ...anchorClustersAll],
    concentration: worldTheme.concentration,
    textFieldMask: textAvoidField,
  });
  const sphereClusters = buildSphereClusters({
    rand: nodeRand,
    width: worldWidth,
    height,
    safeZone,
    densityAt,
  });
  const baseColor = pickBaseColor(worldTheme.topElement, worldTheme.secondaryElement, rand);
  const mistColor = pickMistColor(worldTheme.topElement, worldTheme.secondaryElement, rand);
  const haloBias = worldTheme?.palette?.glow || baseColor;
  const mood = worldTheme.mood || {};
  const todayPalette = worldTheme.todayPalette || {
    baseBias: mistColor,
    gasColorA: worldTheme.palette?.primary?.nebula?.[0],
    gasColorB: worldTheme.palette?.secondary?.nebula?.[0] || worldTheme.palette?.primary?.nebula?.[1],
    dustTint: worldTheme.palette?.secondary?.nebula?.[1] || worldTheme.palette?.primary?.nebula?.[0],
    glowColor: worldTheme.palette?.glow || worldTheme.palette?.primary?.glow || worldTheme.palette?.primary?.nebula?.[0],
    accentStarWarm: worldTheme.palette?.primary?.star,
    accentStarCool: worldTheme.palette?.secondary?.star || worldTheme.palette?.primary?.star,
  };
  const populationTheme = buildStarPopulationTheme({ theme: worldTheme, mood });
  const layerProfile = todayPalette.layers || {};
  const colorPresence = clamp(Number(todayPalette.colorPresence ?? 1), 1, 2.6);
  const haloLayerMix = layerProfile.starHalo?.intensity ?? null;
  const baseMix = haloLayerMix != null
    ? clamp(haloLayerMix * colorPresence, 0.1, 0.55)
    : (populationTheme.todayColorMix ?? 0.24);
  const colorMix = clamp(baseMix * (0.9 + colorPresence * 0.55), 0.26, 0.98);
  const tone = {
    haloBias: todayPalette.glowColor || haloBias,
    mistColor: todayPalette.gasColorB || mistColor,
    mix: {
      core: clamp(0.06 + colorMix * 0.16, 0.06, 0.22),
      halo: clamp(0.34 + colorMix * 0.9, 0.34, 0.92),
      outer: clamp(0.62 + colorMix * 0.85, 0.62, 0.98),
    },
  };
  const filamentRaw = buildFilamentField({
    seed: hashString(`${worldTheme.seed}_filament`),
    width: worldWidth,
    height,
    stream,
    gaps: streamGaps,
    strength: mood.filamentLevel ?? 0.55,
  });
  const ridgeRaw = buildRidgeField({
    seed: hashString(`${worldTheme.seed}_ridge`),
    width: worldWidth,
    height,
    stream,
    gaps: streamGaps,
    strength: mood.structureEmphasis ?? 0.45,
  });
  const filamentAt = textAvoidField
    ? (x, y) => filamentRaw(x, y) * clamp(1 - textAvoidField(x, y) * 0.9, 0.05, 1)
    : filamentRaw;
  const ridgeAt = textAvoidField
    ? (x, y) => ridgeRaw(x, y) * clamp(1 - textAvoidField(x, y) * 0.9, 0.05, 1)
    : ridgeRaw;
  const extinctionRaw = buildExtinctionField({
    filamentAt,
    ridgeAt,
    strength: mood.dustLevel ?? 0.5,
  });
  const extinctionAt = textAvoidField
    ? (x, y) => extinctionRaw(x, y) * clamp(1 - textAvoidField(x, y) * 0.9, 0.05, 1)
    : extinctionRaw;
  const colorFieldAt = (x, y) => {
    const filament = filamentAt ? filamentAt(x, y) : 0;
    const ridge = ridgeAt ? ridgeAt(x, y) : 0;
    const density = densityAt ? clamp(densityAt(x, y), 0, 1) : 0;
    return clamp(filament * 0.7 + ridge * 0.55 + density * 0.25, 0, 1);
  };
  const flowField = buildFlowField({
    seed: hashString(`${worldTheme.seed}_flow`),
    width: worldWidth,
    height,
    stream,
    gaps: streamGaps,
    strength: clamp(0.55 + (mood.structureEmphasis ?? 0.5) * 0.55, 0.35, 1),
    curlStrength: clamp(0.25 + (mood.turbulence ?? 0.5) * 0.45, 0.2, 0.8),
    safeZones: slideSafeZones,
    textFieldMask: textAvoidField,
  });
  const primaryOpacityScale = pickOpacityScale(worldTheme.topElement);
  const secondaryOpacityScale = pickOpacityScale(worldTheme.secondaryElement);

  const deep = buildDeepSpaceLayer({
    rand,
    width: worldWidth,
    height,
    baseColor: BACKGROUND_COLORS.bgDeep,
    glowStrength: 0.08,
    idPrefix: worldId,
  });
  defs.push(deep.defs);
  body.push(deep.body);

  const baseNoise = buildBaseColorNoiseLayer({
    rand,
    width: worldWidth,
    height,
    idPrefix: `${worldId}-baseNoise`,
    color: BACKGROUND_COLORS.bg,
    opacity: 0.08,
  });
  defs.push(baseNoise.defs);
  body.push(baseNoise.body);

  const cosmicDust = buildCosmicDustLayer({
    rand: mulberry32(hashString(`${worldTheme.seed}_cosmicDust`)),
    width: worldWidth,
    height,
    count: Math.round((worldWidth * height) / (1080 * 1080) * 900),
    densityAt,
    stream,
    streamGaps,
    voids: voidMap.voids,
    colorWeights: buildStarColorWeights(worldTheme.topElement, worldTheme.secondaryElement),
    textFieldMask: textAvoidField,
  });
  body.push(cosmicDust);

  const deepFieldScale = (worldWidth * height) / (1080 * 1080);
  const deepFieldLayer = buildDeepFieldLayer({
    rand: mulberry32(hashString(`${worldTheme.seed}_deepField`)),
    width: worldWidth,
    height,
    regions: deepFieldRegions,
    counts: {
      dust: Math.round(120 * deepFieldScale),
      micro: Math.round(70 * deepFieldScale),
      small: Math.round(24 * deepFieldScale),
    },
    colorWeights: buildStarColorWeights(worldTheme.topElement, worldTheme.secondaryElement),
    avoidRect: safeZone,
    voids: voidMap.voids,
    textFieldMask: textAvoidField,
  });
  body.push(deepFieldLayer);

  const microSharpLayer = buildMicroSharpLayer({
    rand: mulberry32(hashString(`${worldTheme.seed}_microSharp`)),
    width: worldWidth,
    height,
    count: Math.round(260 * deepFieldScale),
    densityAt,
    voids: voidMap.voids,
    colorWeights: buildStarColorWeights(worldTheme.topElement, worldTheme.secondaryElement),
    textFieldMask: textAvoidField,
  });
  body.push(microSharpLayer);

  const clusterField = buildClusterField({
    rand: mulberry32(hashString(`${worldTheme.seed}_clusters`)),
    width: worldWidth,
    height,
    clusters: [
      ...anchorClustersAll,
      ...deepFieldRegions.map((r) => ({ ...r, boost: 1.1, laneShift: (nodeRand() - 0.5) * 0.6 })),
    ],
    colorWeights: buildStarColorWeights(worldTheme.topElement, worldTheme.secondaryElement),
    avoidRect: safeZone,
    voids: voidMap.voids,
    tone,
    clusterTightness: populationTheme.clusterTightness,
    clusterFragmentation: populationTheme.clusterFragmentation,
    textFieldMask: textAvoidField,
  });
  body.push(clusterField);
  if (slide1ExtraClusters.length) {
    const slide1ExtraClusterLayer = buildClusterField({
      rand: mulberry32(hashString(`${worldTheme.seed}_slide1_extra_cluster_field`)),
      width: worldWidth,
      height,
      clusters: slide1ExtraClusters,
      colorWeights: buildStarColorWeights(worldTheme.topElement, worldTheme.secondaryElement),
      avoidRect: safeZone,
      voids: voidMap.voids,
      tone,
      clusterTightness: populationTheme.clusterTightness,
      clusterFragmentation: populationTheme.clusterFragmentation,
      textFieldMask: textAvoidField,
      haloMix: 0.48,
    });
    body.push(slide1ExtraClusterLayer);
  }

  const glowLayerIntensity = layerProfile.glow?.intensity ?? 0.12;
  const milkyIntensity = clamp(0.12 + glowLayerIntensity * 0.6 + (mood.glowLevel ?? 0.5) * 0.05, 0.1, 0.32);
  const milky = buildMilkyBandLayer({
    rand: streamRand,
    width: worldWidth,
    height,
    idPrefix: `${worldId}-milky`,
    color: todayPalette.glowColor || worldTheme.palette.primary.nebula[0],
    intensity: milkyIntensity,
    stream,
  });
  defs.push(milky.defs);
  body.push(milky.body);

  const milkyDust = buildMilkyDustLayer({
    rand: streamRand,
    width: worldWidth,
    height,
    stream,
    streamGaps,
    densityAt,
    voids: voidMap.voids,
    color: todayPalette.dustTint || worldTheme.palette.secondary.nebula[0] || worldTheme.palette.primary.nebula[0],
    textFieldMask: textAvoidField,
  });
  body.push(milkyDust);

  const densityScale = worldWidth / width;

  body.push(
    buildStarLayers({
      rand,
      width: worldWidth,
      height,
      theme: worldTheme,
      retroCount: worldTheme.retroCount,
      avoidCenter: false,
      avoidCircles: [],
      intensityScale: 1,
      colorWeights: buildStarColorWeights(worldTheme.topElement, worldTheme.secondaryElement),
      tone,
      stream,
      streamNodes,
      streamGaps,
      sphereClusters,
      densityAt,
      colorFieldAt,
      flowField,
      extinctionAt,
      populationTheme,
      voids: voidMap.voids,
      regions: {
        deepFieldRegions,
        anchorClusters: anchorClustersAll,
      },
      heroRegions,
      safeZone,
      densityScale,
      textFieldMask: textAvoidField,
    })
  );

  const extraHero = buildHeroStars({
    rand: mulberry32(hashString(`${worldTheme.seed}_extraHero`)),
    width: worldWidth,
    height,
    densityAt,
    voids: voidMap.voids,
    colorWeights: buildStarColorWeights(worldTheme.topElement, worldTheme.secondaryElement),
    countOverride: 2,
    tone,
    textFieldMask: textAvoidField,
  });
  if (extraHero) body.push(extraHero);

  const darkLane = buildDarkLaneLayer({
    rand: streamRand,
    width: worldWidth,
    height,
    stream,
    idPrefix: `${worldId}-darkLane`,
    intensity: 0.24,
  });
  defs.push(darkLane.defs);
  body.push(darkLane.body);

  const colorAtmosphere = buildColorAtmosphereLayer({
    rand,
    width: worldWidth,
    height,
    stream,
    streamGaps,
    densityAt,
    filamentAt,
    ridgeAt,
    flowField,
    clusters: [...anchorClustersAll, ...deepFieldRegions],
    deepFields: deepFieldRegions,
    voids: voidMap.voids,
    palette: worldTheme.palette,
    todayPalette,
    primaryOpacityScale,
    secondaryOpacityScale,
    mistColor: (mistRand) => pickMistColor(worldTheme.topElement, worldTheme.secondaryElement, mistRand),
    fogPattern: worldTheme.fogPattern,
    spreadPattern,
    longThemeColor: worldTheme.longThemeColor,
    mood,
    heroRegions,
    safeZone,
    idPrefix: `${worldId}-color`,
    textFieldMask: textAvoidField,
  });

  return {
    worldId,
    theme: worldTheme,
    defs: defs.join(""),
    body: body.join(""),
    colorDefs: colorAtmosphere.defs,
    colorBody: colorAtmosphere.body,
    stream,
    streamGaps,
    densityAt,
    voids: voidMap.voids,
    anchors: anchorClustersAll,
    heroRegions,
    flowField,
    safeZones: slideSafeZones,
    avoidRegions,
    textAvoidField,
    todayPalette,
    tone,
    milkyIntensity,
  };
}

module.exports = {
  WORLD_CACHE,
  buildSpaceWorld,
  computeSpaceTheme,
  buildStarColorWeights,
  buildHeroStars,
  buildAspectLines,
  hashString,
  mulberry32,
  clamp,
};
