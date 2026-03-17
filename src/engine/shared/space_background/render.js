"use strict";

const {
  WORLD_CACHE,
  buildSpaceWorld,
  computeSpaceTheme,
  buildStarColorWeights,
  buildHeroStars,
  buildAspectLines,
  hashString,
  mulberry32,
  clamp,
} = require("./world");
const { buildMilkyBandLayer } = require("./layers/base");
const { buildMilkyDustLayer } = require("./layers/dust");
const { buildClusterField } = require("./layers/stars");
const { BACKGROUND_COLORS } = require("./constants");
const { mixColor } = require("../../color_utils");

function sliceAvoidRegions(avoidRegions, offsetX, width) {
  if (!Array.isArray(avoidRegions) || !avoidRegions.length) return [];
  const start = offsetX;
  const end = offsetX + width;
  return avoidRegions
    .map((region) => {
      if (!region) return null;
      const x = Number(region.x) || 0;
      const y = Number(region.y) || 0;
      const w = Number(region.w) || 0;
      const h = Number(region.h) || 0;
      if (w <= 0 || h <= 0) return null;
      if (x + w < start || x > end) return null;
      return {
        ...region,
        x: x - offsetX,
        y,
        w,
        h,
      };
    })
    .filter(Boolean);
}

function sliceClusters(clusters, offsetX, width) {
  if (!Array.isArray(clusters) || !clusters.length) return [];
  const start = offsetX;
  const end = offsetX + width;
  return clusters
    .map((cluster) => {
      if (!cluster) return null;
      const x = Number(cluster.x) || 0;
      const rx = Number(cluster.rx) || 0;
      if (x + rx < start || x - rx > end) return null;
      return { ...cluster, x: x - offsetX };
    })
    .filter(Boolean);
}

function buildTextVeilLayer({ regions, width, height, idPrefix, color, rand }) {
  if (!Array.isArray(regions) || !regions.length) return { defs: "", body: "" };
  const defs = [];
  const body = [];
  regions.forEach((region, idx) => {
    const w = Number(region.w) || 0;
    const h = Number(region.h) || 0;
    if (w <= 0 || h <= 0) return;
    const x = Number(region.x) || 0;
    const y = Number(region.y) || 0;
    const weight = clamp(Number.isFinite(Number(region.weight)) ? Number(region.weight) : 1, 0.4, 1.2);
    const feather = clamp(Number.isFinite(Number(region.feather)) ? Number(region.feather) : Math.max(16, Math.min(w, h) * 0.24), 12, 64);
    const pad = feather * 0.8;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2 + pad;
    const ry = h / 2 + pad;
    const gradId = `${idPrefix}-veil-${idx}`;
    const noiseId = `${gradId}-noise`;
    const maskId = `${gradId}-mask`;
    const baseOpacity = clamp(0.045 + weight * 0.05, 0.03, 0.12);
    const freqX = (0.014 + (rand ? rand() : Math.random()) * 0.02).toFixed(3);
    const freqY = (0.02 + (rand ? rand() : Math.random()) * 0.02).toFixed(3);
    const blur = clamp(Math.max(rx, ry) * 0.12, 12, 32).toFixed(1);
    defs.push(
      `<radialGradient id="${gradId}" cx="${(cx / width).toFixed(3)}" cy="${(cy / height).toFixed(3)}" r="${(Math.max(rx, ry) / Math.max(width, height)).toFixed(3)}">` +
        `<stop offset="0%" stop-color="${color}" stop-opacity="${baseOpacity.toFixed(3)}"/>` +
        `<stop offset="55%" stop-color="${color}" stop-opacity="${(baseOpacity * 0.55).toFixed(3)}"/>` +
        `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</radialGradient>` +
      `<filter id="${noiseId}" x="-40%" y="-40%" width="180%" height="180%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="${freqX} ${freqY}" numOctaves="2" seed="${Math.floor((rand ? rand() : Math.random()) * 9000)}" result="noise"/>` +
        `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0" result="alpha"/>` +
        `<feGaussianBlur in="alpha" stdDeviation="${blur}"/>` +
      `</filter>` +
      `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
        `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`
    );
    body.push(
      `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="url(#${gradId})" mask="url(#${maskId})"/>`
    );
  });
  return { defs: defs.join(""), body: body.join("") };
}

function renderSpaceSlice({ world, width, height, offsetX, variant, avoidRegions }) {
  const slideId = `${variant}-${world.worldId}-${offsetX}`;
  const defs = [];
  const overlay = [];
  const variantStrengthMap = {
    slide1: 1.0,
    moon: 0.5,
    slide2: 0.35,
    slide3: 0.7,
    slide4: 0.5,
    slide5: 0.28,
  };
  const colorStrength = variantStrengthMap[variant] ?? 0.55;
  const slide1Safe = {
    x: width * 0.06,
    y: height * 0.22,
    w: width * 0.78,
    h: height * 0.4,
  };

  // slide1 / slide5 are now driven by world-level anchors to keep continuity

  if (variant === "slide3") {
    const aspectLines = buildAspectLines({
      width,
      height,
      aspect: world.theme.aspect,
      orb: world.theme.orb,
      color: world.theme.palette.glow,
      idPrefix: slideId,
    });
    defs.push(aspectLines.defs || "");
    if (aspectLines.body) overlay.push(`<g>${aspectLines.body}</g>`);
  }

  const worldGroup = `<g transform="translate(${-offsetX} 0)">${world.body}</g>`;
  const colorGroup = world.colorBody
    ? `<g transform="translate(${-offsetX} 0)" opacity="${colorStrength.toFixed(3)}">${world.colorBody}</g>`
    : "";
  const colorDefs = world.colorDefs || "";

  const localAvoidRegions = sliceAvoidRegions(avoidRegions, offsetX, width);
  const palette = world.theme?.todayPalette || {};
  const tintSource = palette.baseBias || palette.glowColor || palette.gasColorA || BACKGROUND_COLORS.bgDeep;
  const veilColor = mixColor(BACKGROUND_COLORS.bgDeep, tintSource, 0.1);
  const veilRand = mulberry32(hashString(`${slideId}-veil`));
  const textVeil = buildTextVeilLayer({
    regions: localAvoidRegions,
    width,
    height,
    idPrefix: `${slideId}-textVeil`,
    color: veilColor,
    rand: veilRand,
  });
  if (textVeil.defs) defs.push(textVeil.defs);
  const veilLayer = textVeil.body ? `<g>${textVeil.body}</g>` : "";

  if (variant === "slide1" && world.densityAt) {
    const extraHero = buildHeroStars({
      rand: mulberry32(hashString(`${slideId}-hero-extra`)),
      width,
      height,
      densityAt: world.densityAt,
      voids: world.voids,
      avoidRect: slide1Safe,
      colorWeights: buildStarColorWeights(world.theme.topElement, world.theme.secondaryElement),
      countOverride: 10,
      textFieldMask: world.textAvoidField,
      sizeMin: 3.0,
      sizeMax: 5.2,
      bloomStrength: 1.35,
      spikeStrength: 1.25,
      chromaStrength: 1.08,
    });
    if (extraHero) overlay.push(`<g>${extraHero}</g>`);
  }

  if (variant === "slide1" && world.stream) {
    const palette = world.todayPalette || world.theme?.todayPalette || {};
    const milkyColor = palette.glowColor || palette.gasColorA || world.theme?.palette?.primary?.nebula?.[0] || BACKGROUND_COLORS.bgDeep;
    const milkyBoost = buildMilkyBandLayer({
      rand: mulberry32(hashString(`${slideId}-milky-boost`)),
      width,
      height,
      idPrefix: `${slideId}-milky-boost`,
      color: milkyColor,
      intensity: Number.isFinite(Number(world.milkyIntensity)) ? world.milkyIntensity : 0.18,
      intensityScale: 1.35,
      thicknessScale: 1.25,
      stream: {
        ...world.stream,
        x1: world.stream.x1 - offsetX,
        x2: world.stream.x2 - offsetX,
      },
    });
    defs.push(milkyBoost.defs || "");
    if (milkyBoost.body) overlay.push(`<g>${milkyBoost.body}</g>`);

    const milkyDustBoost = buildMilkyDustLayer({
      rand: mulberry32(hashString(`${slideId}-milky-dust-boost`)),
      width,
      height,
      stream: {
        ...world.stream,
        x1: world.stream.x1 - offsetX,
        x2: world.stream.x2 - offsetX,
      },
      streamGaps: world.streamGaps,
      densityAt: world.densityAt,
      voids: world.voids,
      color: palette.dustTint || world.theme?.palette?.secondary?.nebula?.[0] || world.theme?.palette?.primary?.nebula?.[0] || BACKGROUND_COLORS.bgDeep,
      countScale: 1.25,
      opacityScale: 1.15,
      spreadScale: 1.15,
      textFieldMask: world.textAvoidField,
    });
    if (milkyDustBoost) overlay.push(`<g>${milkyDustBoost}</g>`);

    const clusterSlice = sliceClusters(world.anchors, offsetX, width);
    if (clusterSlice.length) {
      const boostedClusters = clusterSlice.map((cluster) => ({
        ...cluster,
        boost: (cluster.boost || 1) * 1.35,
        coreBoost: (cluster.coreBoost || 0.1) * 1.25,
        weight: (cluster.weight || 1) * 1.05,
      }));
      const clusterBoostLayer = buildClusterField({
        rand: mulberry32(hashString(`${slideId}-cluster-boost`)),
        width,
        height,
        clusters: boostedClusters,
        colorWeights: buildStarColorWeights(world.theme.topElement, world.theme.secondaryElement),
        avoidRect: slide1Safe,
        voids: world.voids,
        tone: world.tone,
        clusterTightness: world.theme?.mood?.clusterBias ? clamp(0.45 + world.theme.mood.clusterBias * 0.4, 0.25, 0.95) : 0.55,
        clusterFragmentation: world.theme?.mood?.turbulence ? clamp(0.35 + world.theme.mood.turbulence * 0.3, 0.2, 0.95) : 0.4,
        textFieldMask: world.textAvoidField,
        haloMix: 0.62,
      });
      if (clusterBoostLayer) overlay.push(`<g>${clusterBoostLayer}</g>`);
    }
  }
  return { defs: colorDefs + defs.join(""), body: worldGroup + colorGroup + veilLayer + overlay.join("") };
}

function buildSpaceBackground({
  story,
  dateLabel,
  width,
  height,
  variant = "slide1",
  worldWidth: worldWidthInput,
  offsetX: offsetXInput,
  avoidRegions = [],
} = {}) {
  const worldWidth = Number.isFinite(Number(worldWidthInput)) ? Number(worldWidthInput) : width;
  const offsetX = clamp(offsetXInput || 0, 0, Math.max(0, worldWidth - width));
  const theme = computeSpaceTheme({ story, dateLabel, variant: "world" });
  const textKey = Array.isArray(avoidRegions) && avoidRegions.length
    ? hashString(avoidRegions.map((f) => {
        const x = Math.round(Number(f?.x) || 0);
        const y = Math.round(Number(f?.y) || 0);
        const w = Math.round(Number(f?.w) || 0);
        const h = Math.round(Number(f?.h) || 0);
        const s = Math.round((Number.isFinite(Number(f?.weight)) ? Number(f.weight) : 1) * 100);
        const feather = Math.round(Number(f?.feather) || 0);
        return `${x},${y},${w},${h},${s},${feather}`;
      }).join("|"))
    : 0;
  const worldKey = `${theme.seed}-${worldWidth}x${height}-${textKey}`;

  let world = WORLD_CACHE.get(worldKey);
  if (!world) {
    world = buildSpaceWorld({ story, dateLabel, width, height, worldWidth, theme, avoidRegions });
    WORLD_CACHE.set(worldKey, world);
  }

  const slice = renderSpaceSlice({ world, width, height, offsetX, variant, avoidRegions });
  const defs = `${world.defs}${slice.defs}`;
  return {
    defs,
    body: slice.body,
    theme: world.theme,
    todayPalette: world.theme?.todayPalette || null,
  };
}

module.exports = {
  renderSpaceSlice,
  buildSpaceBackground,
};
