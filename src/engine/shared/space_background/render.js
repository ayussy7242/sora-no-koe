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
const { isSpaceDebug } = require("./utils");
const { buildMilkyBandLayer } = require("./layers/base");
const { buildMilkyDustLayer } = require("./layers/dust");
const { buildClusterField } = require("./layers/stars");
const { renderStarSprite } = require("./layers/renderStarSprite");
const { mixColor } = require("../../color_utils");
const { BACKGROUND_COLORS } = require("./constants");
const { streamInfluenceAt, streamPoint } = require("./fields");

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

const SLICE_CACHE = new Map();

function buildAvoidKey(regions) {
  if (!Array.isArray(regions) || regions.length === 0) return "none";
  const raw = regions.map((r) => {
    const x = Math.round(Number(r?.x) || 0);
    const y = Math.round(Number(r?.y) || 0);
    const w = Math.round(Number(r?.w) || 0);
    const h = Math.round(Number(r?.h) || 0);
    const s = Math.round((Number.isFinite(Number(r?.weight)) ? Number(r.weight) : 1) * 100);
    const f = Math.round(Number(r?.feather) || 0);
    const k = r?.kind || "";
    return `${x},${y},${w},${h},${s},${f},${k}`;
  }).join("|");
  return hashString(raw);
}

function buildMiniHeroStars({ rand, cluster, count, width, height, avoidRect, voids = [], baseColor, glowColor }) {
  if (!cluster || count <= 0) return "";
  const stars = [];
  const isInAvoid = (x, y) =>
    avoidRect &&
    x > avoidRect.x &&
    x < avoidRect.x + avoidRect.w &&
    y > avoidRect.y &&
    y < avoidRect.y + avoidRect.h;
  const isInVoid = (x, y) =>
    voids.some((v) => {
      const dx = x - v.x;
      const dy = y - v.y;
      const cosR = Math.cos(-v.rot);
      const sinR = Math.sin(-v.rot);
      const rx = dx * cosR - dy * sinR;
      const ry = dx * sinR + dy * cosR;
      const nx = rx / v.rx;
      const ny = ry / v.ry;
      return nx * nx + ny * ny < 1;
    });
  const colorA = baseColor || "#FFFFFF";
  const colorB = glowColor || colorA;
  for (let i = 0; i < count; i++) {
    const jitterX = (rand() - 0.5) * cluster.rx * 0.18;
    const jitterY = (rand() - 0.5) * cluster.ry * 0.18;
    const x = cluster.x + jitterX;
    const y = cluster.y + jitterY;
    if (x < 0 || x > width || y < 0 || y > height) continue;
    if (isInAvoid(x, y)) continue;
    if (isInVoid(x, y)) continue;
    const radius = 2.8 + rand() * 2.2;
    const opacity = 0.78 + rand() * 0.22;
    const color = mixColor(colorA, colorB, 0.35 + rand() * 0.35);
    const kind = rand() < 0.45 ? "giant" : "bright";
    stars.push(renderStarSprite({
      x,
      y,
      radius,
      opacity,
      color,
      kind,
      haloScale: 1.35,
      bloomStrength: 1.45,
      spikeStrength: 1.35,
      chromaStrength: 1.1,
    }));
  }
  return stars.length ? `<g>${stars.join("")}</g>` : "";
}

function buildBloomGlows({ rand, width, height, positions, color }) {
  if (!Array.isArray(positions) || !positions.length) return "";
  const glows = positions.map((pos, idx) => {
    const x = clamp(pos.x, 0, width);
    const y = clamp(pos.y, 0, height);
    const r = 80 + rand() * 60;
    const opacity = 0.05 + rand() * 0.07;
    const glowId = `bloom-${idx}-${Math.round(x)}-${Math.round(y)}`;
    return `
      <radialGradient id="${glowId}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${color}" stop-opacity="${opacity.toFixed(3)}"/>
        <stop offset="65%" stop-color="${color}" stop-opacity="${(opacity * 0.45).toFixed(3)}"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </radialGradient>
      <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="url(#${glowId})"/>
    `.trim();
  });
  return glows.length ? `<g>${glows.join("")}</g>` : "";
}

function buildSpikeStars({ rand, count, width, height, avoidRect, voids = [], color }) {
  const stars = [];
  if (!count) return "";
  const isInAvoid = (x, y) =>
    avoidRect &&
    x > avoidRect.x &&
    x < avoidRect.x + avoidRect.w &&
    y > avoidRect.y &&
    y < avoidRect.y + avoidRect.h;
  const isInVoid = (x, y) =>
    voids.some((v) => {
      const dx = x - v.x;
      const dy = y - v.y;
      const cosR = Math.cos(-v.rot);
      const sinR = Math.sin(-v.rot);
      const rx = dx * cosR - dy * sinR;
      const ry = dx * sinR + dy * cosR;
      const nx = rx / v.rx;
      const ny = ry / v.ry;
      return nx * nx + ny * ny < 1;
    });
  let tries = 0;
  while (stars.length < count && tries < count * 20) {
    tries += 1;
    const x = rand() * width;
    const y = rand() * height;
    if (isInAvoid(x, y)) continue;
    if (isInVoid(x, y)) continue;
    stars.push(renderStarSprite({
      x,
      y,
      radius: 2.4 + rand() * 1.6,
      opacity: 0.8 + rand() * 0.15,
      color: color || "#FFFFFF",
      kind: "spark",
      haloScale: 0.9,
      bloomStrength: 0.35,
      spikeStrength: 1.6,
      chromaStrength: 0.25,
    }));
  }
  return stars.length ? `<g>${stars.join("")}</g>` : "";
}

function buildTextVeilLayer({ regions, width, height, idPrefix, color, rand }) {
  if (!Array.isArray(regions) || !regions.length) return { defs: "", body: "" };
  const rng = typeof rand === "function" ? rand : mulberry32(hashString(String(idPrefix || "space-veil")));
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
    const freqX = (0.014 + rng() * 0.02).toFixed(3);
    const freqY = (0.02 + rng() * 0.02).toFixed(3);
    const blur = clamp(Math.max(rx, ry) * 0.12, 12, 32).toFixed(1);
    defs.push(
      `<radialGradient id="${gradId}" cx="${(cx / width).toFixed(3)}" cy="${(cy / height).toFixed(3)}" r="${(Math.max(rx, ry) / Math.max(width, height)).toFixed(3)}">` +
        `<stop offset="0%" stop-color="${color}" stop-opacity="${baseOpacity.toFixed(3)}"/>` +
        `<stop offset="55%" stop-color="${color}" stop-opacity="${(baseOpacity * 0.55).toFixed(3)}"/>` +
        `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</radialGradient>` +
      `<filter id="${noiseId}" x="-40%" y="-40%" width="180%" height="180%">` +
        `<feTurbulence type="fractalNoise" baseFrequency="${freqX} ${freqY}" numOctaves="2" seed="${Math.floor(rng() * 9000)}" result="noise"/>` +
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
  const spaceConfig = world?.spaceConfig || {};
  const milkyThicknessScale = Number(spaceConfig?.milkyThicknessScale) || 1;
  const milkyDustScale = Number(spaceConfig?.milkyDustScale) || 1;
  const milkyDustOpacityScale = clamp(0.75 + milkyDustScale * 0.45, 0.6, 1.8);
  const milkyDustSpreadScale = clamp(1 + (milkyDustScale - 1) * 0.2, 0.8, 1.4);
  const variantStrengthMap = {
    slide1: 1.0,
    moon: 0.5,
    slide2: 0.35,
    slide3: 0.7,
    slide4: 0.5,
    slide5: 0.28,
    story_today: 0.62,
    story_resonance: 0.68,
    story_tomorrow: 0.6,
  };
  const colorStrength = variantStrengthMap[variant] ?? 0.55;
  const slide1Safe = {
    x: width * 0.06,
    y: height * 0.22,
    w: width * 0.78,
    h: height * 0.4,
  };
  const storySafe = {
    x: width * 0.12,
    y: height * 0.22,
    w: width * 0.76,
    h: height * 0.48,
  };
  const isStory = variant && variant.startsWith("story_");
  const storyProfileMap = {
    story_today: {
      milkyScale: 2.2,
      thickness: 2.05,
      dustScale: 1.55,
      clusterBoost: 1.7,
      brightBoost: 2.05,
      spikeCount: 2,
      heroCount: 7,
      bloomCount: 1,
    },
    story_resonance: {
      milkyScale: 2.6,
      thickness: 2.25,
      dustScale: 1.75,
      clusterBoost: 2.15,
      brightBoost: 2.55,
      spikeCount: 4,
      heroCount: 9,
      bloomCount: 2,
    },
    story_tomorrow: {
      milkyScale: 2.1,
      thickness: 1.95,
      dustScale: 1.45,
      clusterBoost: 1.6,
      brightBoost: 1.95,
      spikeCount: 2,
      heroCount: 6,
      bloomCount: 1,
    },
  };
  const storyProfile = storyProfileMap[variant] || storyProfileMap.story_today;

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

  if (world.stream) {
    const palette = world.todayPalette || world.theme?.todayPalette || {};
    const milkyColor = palette.glowColor || palette.gasColorA || world.theme?.palette?.primary?.nebula?.[0] || BACKGROUND_COLORS.bgDeep;
    const flowScale = variant === "slide1" ? 1.6 : 1.45;
    const flowBand = buildMilkyBandLayer({
      rand: mulberry32(hashString(`${slideId}-milky-flow`)),
      width,
      height,
      idPrefix: `${slideId}-milky-flow`,
      color: milkyColor,
      intensity: Number.isFinite(Number(world.milkyIntensity)) ? world.milkyIntensity : 0.18,
      intensityScale: flowScale,
      thicknessScale: 1.6 * milkyThicknessScale,
      stream: {
        ...world.stream,
        x1: world.stream.x1 - offsetX,
        x2: world.stream.x2 - offsetX,
      },
    });
    defs.push(flowBand.defs || "");
    if (flowBand.body) overlay.push(`<g>${flowBand.body}</g>`);
  }

  if (isStory && world.stream) {
    const palette = world.todayPalette || world.theme?.todayPalette || {};
    const milkyColor = palette.glowColor || palette.gasColorA || world.theme?.palette?.primary?.nebula?.[0] || BACKGROUND_COLORS.bgDeep;
    const safeRegion = localAvoidRegions[0] || storySafe;
    const storyMilky = buildMilkyBandLayer({
      rand: mulberry32(hashString(`${slideId}-story-milky`)),
      width,
      height,
      idPrefix: `${slideId}-story-milky`,
      color: milkyColor,
      intensity: Number.isFinite(Number(world.milkyIntensity)) ? world.milkyIntensity : 0.18,
      intensityScale: storyProfile.milkyScale,
      thicknessScale: storyProfile.thickness * milkyThicknessScale,
      stream: {
        ...world.stream,
        x1: world.stream.x1 - offsetX,
        x2: world.stream.x2 - offsetX,
      },
    });
    defs.push(storyMilky.defs || "");
    if (storyMilky.body) overlay.push(`<g>${storyMilky.body}</g>`);

    const storyDust = buildMilkyDustLayer({
      rand: mulberry32(hashString(`${slideId}-story-dust`)),
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
      countScale: storyProfile.dustScale * milkyDustScale,
      opacityScale: 1.2 * milkyDustOpacityScale,
      spreadScale: 1.2 * milkyDustSpreadScale,
      textFieldMask: world.textAvoidField,
    });
    if (storyDust) overlay.push(`<g>${storyDust}</g>`);

    const clusterSlice = sliceClusters(world.anchors, offsetX, width);
    if (clusterSlice.length) {
      const boostedClusters = clusterSlice.map((cluster) => {
        const gx = cluster.x + offsetX;
        const gy = cluster.y;
        const streamBias = streamInfluenceAt(gx, gy, world.stream, world.streamGaps || []) || 0;
        const streamBoost = 0.9 + streamBias * 0.6;
        return {
          ...cluster,
          boost: (cluster.boost || 1) * storyProfile.clusterBoost * streamBoost,
          coreBoost: (cluster.coreBoost || 0.1) * (1.35 + streamBias * 0.8),
          weight: (cluster.weight || 1) * (1.1 + streamBias * 0.25),
          laneShift: (cluster.laneShift || 0) + (streamBias - 0.25) * 0.2,
        };
      });
      const clusterLayer = buildClusterField({
        rand: mulberry32(hashString(`${slideId}-story-cluster`)),
        width,
        height,
        clusters: boostedClusters,
        colorWeights: buildStarColorWeights(world.theme.topElement, world.theme.secondaryElement),
        avoidRect: safeRegion,
        voids: world.voids,
        tone: world.tone,
        clusterTightness: world.theme?.mood?.clusterBias ? clamp(0.48 + world.theme.mood.clusterBias * 0.4, 0.25, 0.98) : 0.6,
        clusterFragmentation: world.theme?.mood?.turbulence ? clamp(0.32 + world.theme.mood.turbulence * 0.3, 0.2, 0.98) : 0.36,
        textFieldMask: world.textAvoidField,
        haloMix: 1.1,
        brightBoost: storyProfile.brightBoost,
      });
      if (clusterLayer) overlay.push(`<g>${clusterLayer}</g>`);
    }

    const storySpike = buildSpikeStars({
      rand: mulberry32(hashString(`${slideId}-story-spike`)),
      count: storyProfile.spikeCount,
      width,
      height,
      avoidRect: safeRegion,
      voids: world.voids,
      color: "#FFFFFF",
    });
    if (storySpike) overlay.push(storySpike);

    const storyHero = buildHeroStars({
      rand: mulberry32(hashString(`${slideId}-story-hero`)),
      width,
      height,
      densityAt: world.densityAt,
      voids: world.voids,
      avoidRect: safeRegion,
      colorWeights: buildStarColorWeights(world.theme.topElement, world.theme.secondaryElement),
      countOverride: storyProfile.heroCount,
      textFieldMask: world.textAvoidField,
      sizeMin: 2.6,
      sizeMax: 4.8,
      bloomStrength: 1.4,
      spikeStrength: 1.35,
      chromaStrength: 1.1,
    });
    if (storyHero) overlay.push(`<g>${storyHero}</g>`);

    if (storyProfile.bloomCount) {
      const bloomColor = palette.glowColor || palette.gasColorA || world.theme?.palette?.primary?.nebula?.[0] || BACKGROUND_COLORS.bgDeep;
      const bloomRand = mulberry32(hashString(`${slideId}-story-bloom`));
      const positions = [];
      if (storyProfile.bloomCount >= 1) positions.push({ x: width * (0.16 + bloomRand() * 0.2), y: height * (0.18 + bloomRand() * 0.2) });
      if (storyProfile.bloomCount >= 2) positions.push({ x: width * (0.72 + bloomRand() * 0.2), y: height * (0.68 + bloomRand() * 0.2) });
      const bloomLayer = buildBloomGlows({ rand: bloomRand, width, height, positions, color: bloomColor });
      if (bloomLayer) overlay.push(bloomLayer);
    }
  }

  if (variant === "slide1" && world.densityAt) {
    const palette = world.todayPalette || world.theme?.todayPalette || {};
    const bloomColor = palette.glowColor || palette.gasColorA || world.theme?.palette?.primary?.nebula?.[0] || BACKGROUND_COLORS.bgDeep;
    const bloomRand = mulberry32(hashString(`${slideId}-bloom`));
    const bloomLayer = buildBloomGlows({
      rand: bloomRand,
      width,
      height,
      positions: [
        { x: width * 0.18, y: height * 0.22 },
        { x: width * 0.82, y: height * 0.78 },
      ],
      color: bloomColor,
    });
    if (bloomLayer) overlay.push(bloomLayer);

    const spikeLayer = buildSpikeStars({
      rand: mulberry32(hashString(`${slideId}-spike-stars`)),
      count: 3,
      width,
      height,
      avoidRect: slide1Safe,
      voids: world.voids,
      color: "#FFFFFF",
    });
    if (spikeLayer) overlay.push(spikeLayer);

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
      thicknessScale: 1.25 * milkyThicknessScale,
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
      countScale: 1.25 * milkyDustScale,
      opacityScale: 1.15 * milkyDustOpacityScale,
      spreadScale: 1.15 * milkyDustSpreadScale,
      textFieldMask: world.textAvoidField,
    });
    if (milkyDustBoost) overlay.push(`<g>${milkyDustBoost}</g>`);

    const clusterSlice = sliceClusters(world.anchors, offsetX, width);
    if (clusterSlice.length) {
      const boostedClusters = clusterSlice.map((cluster) => {
        const gx = cluster.x + offsetX;
        const gy = cluster.y;
        const streamBias = streamInfluenceAt(gx, gy, world.stream, world.streamGaps || []) || 0;
        const streamBoost = 0.85 + streamBias * 0.55;
        return {
          ...cluster,
        boost: (cluster.boost || 1) * 1.65 * streamBoost,
        coreBoost: (cluster.coreBoost || 0.1) * (1.55 + streamBias * 0.7),
        weight: (cluster.weight || 1) * (1.15 + streamBias * 0.2),
          laneShift: (cluster.laneShift || 0) + (streamBias - 0.3) * 0.18,
        };
      });
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
        haloMix: 0.95,
        brightBoost: 2.25,
      });
      if (clusterBoostLayer) overlay.push(`<g>${clusterBoostLayer}</g>`);

      const pickRand = mulberry32(hashString(`${slideId}-mini-hero-pick`));
      const shuffled = clusterSlice.slice().sort(() => pickRand() - 0.5);
      const miniTargets = shuffled.slice(0, Math.min(2, shuffled.length));
      if (miniTargets.length) {
        const miniRand = mulberry32(hashString(`${slideId}-mini-hero`));
        const miniHero = buildMiniHeroStars({
          rand: miniRand,
          cluster: miniTargets[0],
          count: 1,
          width,
          height,
          avoidRect: slide1Safe,
          voids: world.voids,
          baseColor: "#FFFFFF",
          glowColor: world.theme?.palette?.glow,
        });
        if (miniHero) overlay.push(miniHero);
        if (miniTargets[1]) {
          const miniHero2 = buildMiniHeroStars({
            rand: mulberry32(hashString(`${slideId}-mini-hero-2`)),
            cluster: miniTargets[1],
            count: 1,
            width,
            height,
            avoidRect: slide1Safe,
            voids: world.voids,
            baseColor: "#FFFFFF",
            glowColor: world.theme?.palette?.glow,
          });
          if (miniHero2) overlay.push(miniHero2);
        }
      }

      if (world.stream) {
        const ridgeRand = mulberry32(hashString(`${slideId}-ridge-cluster`));
        const ridgeT = 0.62 + ridgeRand() * 0.26;
        const ridgeAcross = (ridgeRand() - 0.5) * world.stream.thickness * 0.7;
        const ridgeAlong = (ridgeRand() - 0.5) * width * 0.16;
        const ridgePoint = streamPoint(world.stream, ridgeT, ridgeAlong, ridgeAcross);
        const ridgeCluster = {
          x: ridgePoint.x - offsetX,
          y: ridgePoint.y,
          rx: width * (0.065 + ridgeRand() * 0.04),
          ry: width * (0.04 + ridgeRand() * 0.03),
          rot: ridgeRand() * Math.PI * 2,
          fray: 0.18 + ridgeRand() * 0.12,
          weight: 0.9 + ridgeRand() * 0.25,
          boost: 2.4,
          laneShift: (ridgeRand() - 0.5) * 0.35,
          type: "open",
          coreBoost: 0.38 + ridgeRand() * 0.18,
        };
        if (ridgeCluster.x > -width * 0.2 && ridgeCluster.x < width * 1.2) {
          const ridgeLayer = buildClusterField({
            rand: mulberry32(hashString(`${slideId}-ridge-cluster-field`)),
            width,
            height,
            clusters: [ridgeCluster],
            colorWeights: buildStarColorWeights(world.theme.topElement, world.theme.secondaryElement),
            avoidRect: slide1Safe,
            voids: world.voids,
            tone: world.tone,
            clusterTightness: 0.72,
            clusterFragmentation: 0.2,
            textFieldMask: world.textAvoidField,
            haloMix: 1.05,
            brightBoost: 2.35,
          });
          if (ridgeLayer) overlay.push(`<g>${ridgeLayer}</g>`);
        }
      }
    }
  }
  return { defs: colorDefs + defs.join(""), body: worldGroup + colorGroup + veilLayer + overlay.join("") };
}

function buildSpaceBackground({
  story,
  dateLabel,
  seedLabel,
  width,
  height,
  variant = "slide1",
  worldWidth: worldWidthInput,
  offsetX: offsetXInput,
  avoidRegions = [],
  spaceConfig = null,
} = {}) {
  const worldWidth = Number.isFinite(Number(worldWidthInput)) ? Number(worldWidthInput) : width;
  const offsetX = clamp(offsetXInput || 0, 0, Math.max(0, worldWidth - width));
  const seedLog = String(seedLabel || "");
  const debug = isSpaceDebug();
  const spaceConfigKey = (() => {
    if (!spaceConfig || typeof spaceConfig !== "object") return "default";
    const entries = [
      ["starDensityScale", spaceConfig.starDensityScale],
      ["milkyIntensityScale", spaceConfig.milkyIntensityScale],
      ["milkyThicknessScale", spaceConfig.milkyThicknessScale],
      ["milkyDustScale", spaceConfig.milkyDustScale],
    ]
      .filter(([, v]) => Number.isFinite(Number(v)))
      .map(([k, v]) => `${k}:${Number(v).toFixed(3)}`);
    if (!entries.length) return "default";
    return hashString(entries.join("|"));
  })();
  if (debug) {
    console.log("[space] seed", {
      seedLabel: seedLog,
      variant,
      size: `${width}x${height}`,
      worldWidth,
      offsetX,
      spaceConfigKey,
    });
  }
  const theme = computeSpaceTheme({ story, dateLabel, seedLabel, variant: "world" });
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
  const worldKey = `${theme.seed}-${worldWidth}x${height}-${textKey}-${spaceConfigKey}`;

  let world = WORLD_CACHE.get(worldKey);
  if (debug) {
    console.log("[space] world_cache", { hit: !!world, key: worldKey, seedLabel: seedLog });
  }
  if (!world) {
    world = buildSpaceWorld({ story, dateLabel, width, height, worldWidth, theme, avoidRegions, spaceConfig });
    WORLD_CACHE.set(worldKey, world);
  }

  const localAvoidRegions = sliceAvoidRegions(avoidRegions, offsetX, width);
  const avoidKey = buildAvoidKey(localAvoidRegions);
  const sliceKey = `${worldKey}-${variant}-${width}x${height}-${Math.round(offsetX)}-${avoidKey}`;
  let slice = SLICE_CACHE.get(sliceKey);
  if (debug) {
    console.log("[space] slice_cache", { hit: !!slice, key: sliceKey, seedLabel: seedLog });
  }
  if (!slice) {
    slice = renderSpaceSlice({ world, width, height, offsetX, variant, avoidRegions });
    SLICE_CACHE.set(sliceKey, slice);
  }
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
