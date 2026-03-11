"use strict";

const { clamp, lerp, hashString, mulberry32 } = require("../utils");
const { hexToRgb, mixColor } = require("./star_temperature");
const { renderStarPSF } = require("./renderStarPSF");

const STAR_SPRITE_PROFILES = {
  dust:   { innerHalo: 0.1, outerHalo: 0.0, spikes: 0.0, chroma: 0.0, bloom: 0.0 },
  micro:  { innerHalo: 0.18, outerHalo: 0.02, spikes: 0.0, chroma: 0.02, bloom: 0.04 },
  small:  { innerHalo: 0.28, outerHalo: 0.08, spikes: 0.0, chroma: 0.04, bloom: 0.08 },
  medium: { innerHalo: 0.38, outerHalo: 0.16, spikes: 0.04, chroma: 0.07, bloom: 0.14 },
  bright: { innerHalo: 0.48, outerHalo: 0.30, spikes: 0.22, chroma: 0.12, bloom: 0.24 },
  giant:  { innerHalo: 0.56, outerHalo: 0.42, spikes: 0.34, chroma: 0.16, bloom: 0.32 },
  spark:  { innerHalo: 0.22, outerHalo: 0.06, spikes: 0.42, chroma: 0.05, bloom: 0.08 },
  red:    { innerHalo: 0.44, outerHalo: 0.24, spikes: 0.06, chroma: 0.10, bloom: 0.20 },
};

const DEPTH_MULTIPLIERS = {
  far: { halo: 0.45, spikes: 0.15, chroma: 0.25, bloom: 0.25 },
  mid: { halo: 0.75, spikes: 0.55, chroma: 0.7, bloom: 0.7 },
  near: { halo: 1.05, spikes: 1.0, chroma: 1.05, bloom: 1.05 },
  hero: { halo: 1.35, spikes: 1.45, chroma: 1.25, bloom: 1.45 },
};

function resolveStarSpriteProfile(kind, depth) {
  const base = STAR_SPRITE_PROFILES[kind] || STAR_SPRITE_PROFILES.small;
  const mult = DEPTH_MULTIPLIERS[depth] || null;
  if (!mult) return base;
  return {
    innerHalo: base.innerHalo * mult.halo,
    outerHalo: base.outerHalo * mult.halo,
    spikes: base.spikes * mult.spikes,
    chroma: base.chroma * mult.chroma,
    bloom: base.bloom * mult.bloom,
  };
}

function normalizeParams(args) {
  if (args && typeof args === "object" && Number.isFinite(args.x)) return args;
  const [x, y, radius, opacity, color, kind, flare, opts] = arguments;
  return {
    x,
    y,
    radius,
    opacity,
    color,
    kind,
    flare,
    ...(opts || {}),
  };
}

function buildStarSpriteContext(params, profile) {
  const radius = Number(params.radius) || 0.6;
  const opacity = clamp(Number(params.opacity) || 0.1, 0.05, 1);
  const kind = params.kind || "small";
  const haloScaleBase = clamp(params.haloScale ?? profile.innerHalo ?? 0.2, 0, 1.5);
  const bloomBase = clamp(params.bloomStrength ?? profile.bloom ?? 0, 0, 1.5);
  const spikeBase = clamp(params.spikeStrength ?? profile.spikes ?? 0, 0, 1.5);
  const chromaBase = clamp(params.chromaStrength ?? profile.chroma ?? 0, 0, 1.5);
  const minHalo = {
    dust: 0,
    micro: 0.08,
    small: 0.18,
    medium: 0.32,
    bright: 0.45,
    giant: 0.55,
    spark: 0.28,
    red: 0.36,
  };
  const minBloom = {
    bright: 0.12,
    giant: 0.22,
    spark: 0.1,
    red: 0.14,
  };
  const minSpikes = {
    bright: 0.18,
    giant: 0.28,
    spark: 0.3,
  };
  const haloScale = Math.max(minHalo[kind] || 0, haloScaleBase);
  const bloomStrength = Math.max(minBloom[kind] || 0, bloomBase);
  const spikeStrength = Math.max(minSpikes[kind] || 0, spikeBase);
  const chromaStrength = chromaBase;

  const innerHaloRadius = radius * lerp(1.3, 1.9, haloScale);
  const outerHaloRadius = radius * lerp(2.0, 3.6, haloScale + bloomStrength * 0.35);
  const bloomRadius = radius * lerp(2.8, 5.2, bloomStrength);
  const spikeLength = radius * lerp(2.0, 4.8, spikeStrength);
  const spikeWidth = clamp(0.35 + spikeStrength * 0.4, 0.3, 0.9);
  const chromaOffset = clamp(0.2 + radius * 0.12 + chromaStrength * 0.6, 0.2, 1.4);

  return {
    ...params,
    radius,
    opacity,
    haloScale,
    bloomStrength,
    spikeStrength,
    chromaStrength,
    innerHaloRadius,
    outerHaloRadius,
    bloomRadius,
    spikeLength,
    spikeWidth,
    chromaOffset,
  };
}

function buildStarColors({ color, temperature, haloColor, outerHaloColor, haloBoost = 0, outerBoost = 0 }) {
  const baseColor = color || "#FFFFFF";
  const rgb = hexToRgb(baseColor);
  const warmBias = clamp((rgb.r - rgb.b) / 255, -1, 1);
  const tempBias = Number.isFinite(Number(temperature))
    ? clamp((Number(temperature) - 6500) / 4500, -1, 1)
    : 0;
  const warmFactor = clamp(0.35 + Math.max(0, warmBias) * 0.35 + Math.max(0, -tempBias) * 0.15, 0, 0.9);
  const coolFactor = clamp(0.35 + Math.max(0, -warmBias) * 0.35 + Math.max(0, tempBias) * 0.15, 0, 0.9);

  const haloWarm = haloColor || mixColor(baseColor, "#FFB46A", warmFactor);
  const haloCool = outerHaloColor || mixColor(baseColor, "#8FB9FF", coolFactor);
  const innerBase = mixColor(baseColor, "#FFFFFF", 0.72);
  const outerBase = mixColor(haloCool, "#FFFFFF", 0.55);
  const innerScatter = mixColor(innerBase, haloWarm, clamp(haloBoost, 0, 0.75));
  const outerScatter = mixColor(outerBase, haloCool, clamp(outerBoost, 0, 0.85));
  const ambientLift = mixColor(outerScatter, "#0B0E1A", 0.28);

  return {
    base: baseColor,
    core: mixColor(baseColor, "#FFFFFF", 0.32),
    haloWarm,
    haloCool,
    innerScatter,
    outerScatter,
    ambientLift,
    glow: mixColor(baseColor, "#FFFFFF", 0.2),
  };
}

function drawStarCore(ctx) {
  const cx = ctx.x.toFixed(2);
  const cy = ctx.y.toFixed(2);
  const kind = ctx.kind || "small";
  const boost = kind === "bright" || kind === "giant" ? 0.28 : kind === "medium" ? 0.12 : 0;
  const opacity = clamp(ctx.opacity * (0.9 + boost) + 0.1, 0.08, 1).toFixed(2);
  return `<circle cx="${cx}" cy="${cy}" r="${ctx.radius.toFixed(2)}" fill="${ctx.colors.core}" opacity="${opacity}"/>`;
}

function drawStarInnerHalo(ctx) {
  if (ctx.haloScale <= 0.01) return "";
  const cx = ctx.x.toFixed(2);
  const cy = ctx.y.toFixed(2);
  const op = (ctx.opacity * 0.22 * (0.6 + ctx.haloScale)).toFixed(3);
  return `<circle cx="${cx}" cy="${cy}" r="${ctx.innerHaloRadius.toFixed(2)}" fill="${ctx.colors.innerScatter}" opacity="${op}"/>`;
}

function drawStarOuterHalo(ctx) {
  if (ctx.haloScale <= 0.03 && ctx.bloomStrength <= 0.05) return "";
  const cx = ctx.x.toFixed(2);
  const cy = ctx.y.toFixed(2);
  const kind = ctx.kind || "small";
  const kindScale = kind === "bright" || kind === "giant" ? 0.6 : 0.8;
  const op = (ctx.opacity * 0.035 * (0.4 + ctx.haloScale) * kindScale).toFixed(3);
  return `<circle cx="${cx}" cy="${cy}" r="${ctx.outerHaloRadius.toFixed(2)}" fill="${ctx.colors.outerScatter}" opacity="${op}"/>`;
}

function drawStarAiryRing(ctx) {
  const kind = ctx.kind || "small";
  if (kind !== "medium" && kind !== "bright" && kind !== "giant") return "";
  const ringR = ctx.radius * (kind === "medium" ? 2.1 : kind === "bright" ? 2.35 : 2.6);
  const ringOpacity = ctx.opacity * (kind === "medium" ? 0.035 : kind === "bright" ? 0.07 : 0.11);
  if (ringOpacity <= 0.01) return "";
  return `<circle cx="${ctx.x.toFixed(2)}" cy="${ctx.y.toFixed(2)}" r="${ringR.toFixed(2)}" fill="none" stroke="${ctx.colors.outerScatter}" stroke-opacity="${ringOpacity.toFixed(3)}" stroke-width="${(ctx.radius * 0.35).toFixed(2)}"/>`;
}

function drawStarBloom(ctx) {
  if (ctx.bloomStrength <= 0.02) return "";
  const cx = ctx.x.toFixed(2);
  const cy = ctx.y.toFixed(2);
  const kind = ctx.kind || "small";
  const kindScale = kind === "bright" || kind === "giant" ? 0.55 : 0.75;
  const op = (ctx.opacity * 0.025 * ctx.bloomStrength * kindScale).toFixed(3);
  return `<circle cx="${cx}" cy="${cy}" r="${ctx.bloomRadius.toFixed(2)}" fill="${ctx.colors.ambientLift}" opacity="${op}"/>`;
}

function drawDiffractionSpikes(ctx) {
  if (ctx.spikeStrength <= 0.04) return "";
  const cx = ctx.x.toFixed(2);
  const cy = ctx.y.toFixed(2);
  const length = ctx.spikeLength;
  const width = ctx.spikeWidth.toFixed(2);
  const op = (ctx.opacity * 0.12 * ctx.spikeStrength).toFixed(3);
  const lines = [
    `<line x1="${(ctx.x - length).toFixed(2)}" y1="${cy}" x2="${(ctx.x + length).toFixed(2)}" y2="${cy}" stroke="${ctx.colors.glow}" stroke-opacity="${op}" stroke-width="${width}"/>`,
    `<line x1="${cx}" y1="${(ctx.y - length).toFixed(2)}" x2="${cx}" y2="${(ctx.y + length).toFixed(2)}" stroke="${ctx.colors.glow}" stroke-opacity="${(op * 0.9).toFixed(3)}" stroke-width="${width}"/>`,
  ];
  if (ctx.flare || ctx.spikeStrength > 0.28) {
    const d = length * 0.75;
    lines.push(
      `<line x1="${(ctx.x - d).toFixed(2)}" y1="${(ctx.y - d).toFixed(2)}" x2="${(ctx.x + d).toFixed(2)}" y2="${(ctx.y + d).toFixed(2)}" stroke="${ctx.colors.glow}" stroke-opacity="${(op * 0.6).toFixed(3)}" stroke-width="${(width * 0.85).toFixed(2)}"/>`,
      `<line x1="${(ctx.x - d).toFixed(2)}" y1="${(ctx.y + d).toFixed(2)}" x2="${(ctx.x + d).toFixed(2)}" y2="${(ctx.y - d).toFixed(2)}" stroke="${ctx.colors.glow}" stroke-opacity="${(op * 0.55).toFixed(3)}" stroke-width="${(width * 0.85).toFixed(2)}"/>`
    );
  }
  return lines.join("");
}

function drawChromaticGlow(ctx) {
  if (ctx.chromaStrength <= 0.01) return "";
  const dx = ctx.chromaOffset;
  const dy = -ctx.chromaOffset * 0.6;
  const opOuter = (ctx.opacity * 0.06 * ctx.chromaStrength).toFixed(3);
  const opInner = (ctx.opacity * 0.08 * ctx.chromaStrength).toFixed(3);
  return [
    `<circle cx="${(ctx.x + dx).toFixed(2)}" cy="${(ctx.y + dy).toFixed(2)}" r="${(ctx.radius * 3.0).toFixed(2)}" fill="${ctx.colors.outerScatter}" opacity="${opOuter}"/>`,
    `<circle cx="${(ctx.x - dx).toFixed(2)}" cy="${(ctx.y - dy).toFixed(2)}" r="${(ctx.radius * 2.3).toFixed(2)}" fill="${ctx.colors.haloWarm}" opacity="${opInner}"/>`,
  ].join("");
}

function renderStarSprite() {
  const params = normalizeParams.apply(null, arguments);
  const kind = params.kind || "small";
  const profile = resolveStarSpriteProfile(kind, params.depth);
  const ctx = buildStarSpriteContext(params, profile);
  let haloBoost = Number.isFinite(Number(params.haloBoost)) ? Number(params.haloBoost) : 0;
  let outerBoost = Number.isFinite(Number(params.outerBoost)) ? Number(params.outerBoost) : 0;
  if (kind === "medium") {
    haloBoost = Math.max(haloBoost, 0.06);
    outerBoost = Math.max(outerBoost, 0.12);
  }
  if (kind === "bright") {
    haloBoost = Math.max(haloBoost, 0.14);
    outerBoost = Math.max(outerBoost, 0.22);
  }
  if (kind === "giant") {
    haloBoost = Math.max(haloBoost, 0.18);
    outerBoost = Math.max(outerBoost, 0.26);
  }
  ctx.colors = buildStarColors({ ...ctx, haloBoost, outerBoost });

  if (kind === "bright" || kind === "giant" || kind === "medium") {
    const seed = params.seed || hashString(`${params.x},${params.y},${kind}`);
    const rng = mulberry32(seed);
    const jitter = (rng() - 0.5) * (kind === "giant" ? 0.6 : 0.35);
    const psf = renderStarPSF({
      x: ctx.x + jitter,
      y: ctx.y - jitter * 0.5,
      radius: ctx.radius,
      brightness: ctx.opacity,
      color: ctx.colors.base,
      haloColor: ctx.colors.haloWarm,
      outerHaloColor: ctx.colors.outerScatter,
      seed,
      quality: kind === "medium" ? "medium" : "bright",
    });
    const bloom = drawStarBloom(ctx);
    const outer = drawStarOuterHalo(ctx);
    const chroma = drawChromaticGlow(ctx);
    return `<g>${psf}${outer}${chroma}${bloom}</g>`;
  }

  if (kind === "dust") {
    const cx = ctx.x.toFixed(2);
    const cy = ctx.y.toFixed(2);
    const op = (ctx.opacity * 0.45).toFixed(3);
    return `<circle cx="${cx}" cy="${cy}" r="${ctx.radius.toFixed(2)}" fill="${ctx.colors.base}" opacity="${op}"/>`;
  }

  return [
    drawStarBloom(ctx),
    drawStarOuterHalo(ctx),
    drawStarAiryRing(ctx),
    drawChromaticGlow(ctx),
    drawDiffractionSpikes(ctx),
    drawStarInnerHalo(ctx),
    drawStarCore(ctx),
  ].filter(Boolean).join("");
}

module.exports = {
  renderStarSprite,
  STAR_SPRITE_PROFILES,
  resolveStarSpriteProfile,
};
