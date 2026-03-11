"use strict";

const { clamp, lerp, smoothstep, fbm2D, ridgedFbm2D, curlNoise2D } = require("./utils");

function smoothstepRange(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return smoothstep(t);
}

function textAvoidInfluenceAt(x, y, avoidRegions = []) {
  if (!Array.isArray(avoidRegions) || !avoidRegions.length) return 0;
  let max = 0;
  for (const field of avoidRegions) {
    const shape = String(field?.shape || "");
    if (shape === "circle" || Number.isFinite(Number(field?.r))) {
      const cx = Number.isFinite(Number(field?.cx))
        ? Number(field.cx)
        : Number.isFinite(Number(field?.x)) && Number.isFinite(Number(field?.w))
          ? Number(field.x) + Number(field.w) / 2
          : 0;
      const cy = Number.isFinite(Number(field?.cy))
        ? Number(field.cy)
        : Number.isFinite(Number(field?.y)) && Number.isFinite(Number(field?.h))
          ? Number(field.y) + Number(field.h) / 2
          : 0;
      const r = Number(field?.r) || 0;
      if (r <= 0) continue;
      const featherBase = Number.isFinite(Number(field?.feather)) ? Number(field.feather) : Math.max(18, r * 0.35);
      const feather = Math.max(8, featherBase);
      const weight = clamp(Number.isFinite(Number(field?.weight)) ? Number(field.weight) : 1, 0, 1);
      const dist = Math.hypot(x - cx, y - cy);
      const influence = dist <= r ? 1 : 1 - smoothstepRange(0, feather, dist - r);
      const scaled = clamp(influence * weight, 0, 1);
      if (scaled > max) max = scaled;
      continue;
    }
    const w = Number(field?.w) || 0;
    const h = Number(field?.h) || 0;
    if (w <= 0 || h <= 0) continue;
    const cx = Number(field?.x || 0) + w / 2;
    const cy = Number(field?.y || 0) + h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const dx = Math.abs(x - cx) - rx;
    const dy = Math.abs(y - cy) - ry;
    const outsideX = Math.max(dx, 0);
    const outsideY = Math.max(dy, 0);
    const dist = Math.hypot(outsideX, outsideY);
    const featherBase = Number.isFinite(Number(field?.feather)) ? Number(field.feather) : Math.max(18, Math.min(w, h) * 0.18);
    const feather = Math.max(8, featherBase);
    const weight = clamp(Number.isFinite(Number(field?.weight)) ? Number(field.weight) : 1, 0, 1);
    const inside = Math.max(dx, dy);
    let influence = 0;
    if (inside <= 0) {
      influence = 1;
    } else {
      influence = 1 - smoothstepRange(0, feather, dist);
    }
    influence = clamp(influence * weight, 0, 1);
    if (influence > max) max = influence;
  }
  return clamp(max, 0, 1);
}

function buildTextAvoidField({ avoidRegions }) {
  if (!Array.isArray(avoidRegions) || !avoidRegions.length) return null;
  return (x, y) => textAvoidInfluenceAt(x, y, avoidRegions);
}

function buildVoidMap({ rand, width, height }) {
  const count = 3 + Math.floor(rand() * 3);
  const voids = [];
  for (let i = 0; i < count; i++) {
    voids.push({
      x: width * (0.15 + rand() * 0.7),
      y: height * (0.15 + rand() * 0.7),
      rx: 260 + rand() * 380,
      ry: 160 + rand() * 260,
      soft: 0.45 + rand() * 0.4,
      rot: rand() * Math.PI * 2,
    });
  }
  return { voids };
}

function voidMaskAt(x, y, voids = []) {
  if (!voids.length) return 1;
  let mask = 1;
  for (const v of voids) {
    const dx = x - v.x;
    const dy = y - v.y;
    const cosR = Math.cos(-v.rot);
    const sinR = Math.sin(-v.rot);
    const rx = dx * cosR - dy * sinR;
    const ry = dx * sinR + dy * cosR;
    const nx = rx / v.rx;
    const ny = ry / v.ry;
    const d = Math.hypot(nx, ny);
    const falloff = clamp((d - 1) / v.soft, 0, 1);
    mask = Math.min(mask, falloff);
  }
  return clamp(mask, 0, 1);
}

function buildStreamAxis({ rand, width, height, flowType = "single_stream" }) {
  const diagonal = rand() < 0.5 ? "bl-tr" : "tl-br";
  const makeStream = (diag, offset = 0, thicknessScale = 1) => {
    const x1 = -width * 0.08;
    const x2 = width * 1.08;
    const lowY = height * (0.72 + rand() * 0.18);
    const highY = height * (0.1 + rand() * 0.2);
    let y1 = diag === "bl-tr" ? lowY : highY;
    let y2 = diag === "bl-tr" ? highY : lowY;
    const thickness = height * (0.18 + rand() * 0.1) * thicknessScale;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -dy / len;
    const ny = dx / len;
    const shiftX = nx * offset;
    const shiftY = ny * offset;
    return {
      x1: x1 + shiftX,
      y1: y1 + shiftY,
      x2: x2 + shiftX,
      y2: y2 + shiftY,
      thickness,
      diagonal: diag,
      len,
      ux,
      uy,
      nx,
      ny,
      warpAmp: thickness * (0.08 + rand() * 0.06),
      warpFreq: 1.2 + rand() * 0.8,
      warpPhase: rand() * Math.PI * 2,
    };
  };

  const primary = makeStream(diagonal, 0, 1);
  if (flowType === "split_stream") {
    const offset = (primary.thickness * (0.45 + rand() * 0.15)) * (rand() < 0.5 ? -1 : 1);
    const alt = makeStream(diagonal, offset, 0.85);
    primary.alt = alt;
  } else if (flowType === "band_cross") {
    const alt = makeStream(diagonal === "bl-tr" ? "tl-br" : "bl-tr", 0, 0.9);
    primary.alt = alt;
  }
  primary.flowType = flowType;
  return primary;
}

function buildStreamGaps({ rand }) {
  const count = 2 + Math.floor(rand() * 2);
  return Array.from({ length: count }).map(() => ({
    t: 0.15 + rand() * 0.7,
    w: 0.08 + rand() * 0.12,
  }));
}

function streamDensityAt(t, gaps) {
  if (!gaps || !gaps.length) return 1;
  let density = 1;
  for (const gap of gaps) {
    const d = Math.abs(t - gap.t);
    if (d < gap.w) {
      const falloff = d / gap.w;
      density *= 0.15 + 0.85 * falloff;
    }
  }
  return clamp(density, 0.12, 1);
}

function streamWarpOffset(stream, t) {
  if (!stream) return 0;
  return Math.sin(t * Math.PI * 2 * stream.warpFreq + stream.warpPhase) * stream.warpAmp;
}

function streamPoint(stream, t, along = 0, across = 0) {
  const baseX = lerp(stream.x1, stream.x2, t);
  const baseY = lerp(stream.y1, stream.y2, t);
  const warp = streamWarpOffset(stream, t);
  return {
    x: baseX + stream.ux * along + stream.nx * (across + warp),
    y: baseY + stream.uy * along + stream.ny * (across + warp),
  };
}

function streamInfluenceAt(x, y, stream, gaps) {
  if (!stream) return 0;
  const influenceFor = (s, g) => {
    const dx = x - s.x1;
    const dy = y - s.y1;
    const proj = (dx * s.ux + dy * s.uy) / s.len;
    const t = clamp(proj, 0, 1);
    const base = streamPoint(s, t, 0, 0);
    const dist = Math.abs((x - base.x) * s.nx + (y - base.y) * s.ny);
    const band = 1 - clamp(dist / (s.thickness * 0.65), 0, 1);
    const gap = streamDensityAt(t, g);
    return clamp(band * gap, 0, 1);
  };
  const primary = influenceFor(stream, gaps || []);
  if (stream.alt) {
    const altGaps = stream.alt.gaps || gaps || [];
    const secondary = influenceFor(stream.alt, altGaps);
    return Math.max(primary, secondary);
  }
  return primary;
}

function buildDensitySampler({
  seed,
  width,
  height,
  voids,
  stream,
  gaps,
  nodes = [],
  hotspots = [],
  concentration = 0.5,
  textFieldMask = null,
}) {
  const scaleX = 0.00048;
  const scaleY = 0.00082;
  const contrast = 0.68;
  const bias = lerp(0.82, 1.08, clamp(concentration, 0, 1));

  return (x, y) => {
    const nx = x * scaleX;
    const ny = y * scaleY;
    const base = fbm2D(nx, ny, seed, 4);
    let density = clamp((base - 0.3) / contrast, 0, 1);
    density = Math.pow(density, 1.35);
    const sparseNoise = fbm2D(nx * 0.6, ny * 0.6, seed + 101, 3);
    if (sparseNoise < 0.42) {
      density *= lerp(0.25, 0.6, sparseNoise / 0.42);
    }
    const boosters = [];
    if (nodes && nodes.length) {
      boosters.push(...nodes.map((n) => ({
        x: n.x,
        y: n.y,
        r: n.spread * 1.2,
        w: 0.65,
      })));
    }
    if (hotspots && hotspots.length) {
      boosters.push(...hotspots.map((h) => ({
        x: h.x,
        y: h.y,
        r: Math.max(h.rx, h.ry) * 1.1,
        w: 0.8,
      })));
    }
    for (const b of boosters) {
      const dx = x - b.x;
      const dy = y - b.y;
      const d = Math.hypot(dx, dy);
      const influence = Math.exp(-(d * d) / (b.r * b.r));
      density = Math.max(density, influence * b.w);
    }
    density *= voidMaskAt(x, y, voids);
    const flow = streamInfluenceAt(x, y, stream, gaps);
    density = Math.max(density, flow * 0.7);
    if (textFieldMask) {
      const mask = clamp(textFieldMask(x, y), 0, 1);
      density *= clamp(1 - mask * 0.9, 0.12, 1);
    }
    density = clamp(density * bias, 0, 1);
    return density;
  };
}

function buildStreamNodes({ rand, stream, count }) {
  if (!stream) return [];
  const nodes = [];
  const total = Math.max(3, Math.min(6, Number(count) || 4));
  const tValues = Array.from({ length: total })
    .map((_, idx) => (idx + 0.2 + rand() * 0.6) / (total + 0.6))
    .sort((a, b) => a - b);

  tValues.forEach((t) => {
    const baseX = lerp(stream.x1, stream.x2, t);
    const baseY = lerp(stream.y1, stream.y2, t);
    const offset = (rand() - 0.5) * stream.thickness * 0.6;
    const spread = stream.thickness * (0.5 + rand() * 0.6);
    nodes.push({
      x: baseX + stream.nx * offset,
      y: baseY + stream.ny * offset,
      spread,
      weight: 0.35 + rand() * 0.4,
    });
  });

  return nodes;
}

function buildSphereClusters({ rand, width, height, safeZone, densityAt }) {
  const clusters = [];
  const countRoll = rand();
  const count = countRoll < 0.18 ? 2 : countRoll < 0.5 ? 1 : 0;
  for (let i = 0; i < count; i++) {
    let x = rand() * width;
    let y = rand() * height;
    const attempts = 12;
    if (safeZone) {
      for (let t = 0; t < attempts; t++) {
        x = rand() * width;
        y = rand() * height;
        if (x < safeZone.x || x > safeZone.x + safeZone.w || y < safeZone.y || y > safeZone.y + safeZone.h) {
          if (!densityAt || densityAt(x, y) > 0.45) break;
        }
      }
    } else if (densityAt) {
      for (let t = 0; t < attempts; t++) {
        x = rand() * width;
        y = rand() * height;
        if (densityAt(x, y) > 0.45) break;
      }
    }
    clusters.push({
      x,
      y,
      spread: 80 + rand() * 120,
      weight: 0.5 + rand() * 0.35,
      ellA: 0.85 + rand() * 0.5,
      ellB: 0.75 + rand() * 0.55,
      rot: rand() * Math.PI * 2,
      fray: 0.18 + rand() * 0.24,
    });
  }
  return clusters;
}

function sampleAlongStreamPoint({ rand, stream, streamGaps, spread = 1 }) {
  if (!stream) return { x: rand() * 1, y: rand() * 1 };
  const pickAlt = stream.alt && rand() < 0.45;
  const target = pickAlt ? stream.alt : stream;
  const gaps = pickAlt ? (stream.alt.gaps || streamGaps) : streamGaps;
  for (let i = 0; i < 16; i++) {
    const t = rand();
    if (gaps && rand() > streamDensityAt(t, gaps)) continue;
    const across = (rand() - 0.5) * target.thickness * spread;
    const along = (rand() - 0.5) * target.thickness * 0.6 * spread;
    return streamPoint(target, t, along, across);
  }
  return streamPoint(target, rand(), 0, 0);
}

function buildFilamentField({ seed, width, height, stream, gaps, strength = 0.6 }) {
  const scale = 0.0016;
  const curlScale = 0.0011;
  const strengthClamped = clamp(strength, 0, 1);
  return (x, y) => {
    const nx = x * scale;
    const ny = y * scale;
    const ridge = ridgedFbm2D(nx, ny, seed, 4);
    const flow = stream ? streamInfluenceAt(x, y, stream, gaps) : 0.4;
    const curl = curlNoise2D(x * curlScale, y * curlScale, seed + 91);
    const curlMag = clamp(Math.hypot(curl.x, curl.y) * 0.8, 0, 1);
    const base = clamp(ridge * 0.6 + flow * 0.3 + curlMag * 0.25, 0, 1);
    return clamp(Math.pow(base, 1.8) * strengthClamped, 0, 1);
  };
}

function buildRidgeField({ seed, width, height, stream, gaps, strength = 0.5 }) {
  const scale = 0.0024;
  const strengthClamped = clamp(strength, 0, 1);
  return (x, y) => {
    const nx = x * scale;
    const ny = y * scale;
    const ridge = ridgedFbm2D(nx, ny, seed, 5);
    const flow = stream ? streamInfluenceAt(x, y, stream, gaps) : 0.3;
    const base = clamp(ridge * 0.75 + flow * 0.2, 0, 1);
    return clamp(Math.pow(base, 2.1) * strengthClamped, 0, 1);
  };
}

function buildExtinctionField({ filamentAt, ridgeAt, strength = 0.6 }) {
  const k = clamp(strength, 0, 1);
  return (x, y) => {
    const f = filamentAt ? filamentAt(x, y) : 0;
    const r = ridgeAt ? ridgeAt(x, y) : 0;
    const v = clamp(f * 0.7 + r * 0.9, 0, 1);
    return clamp(v * k, 0, 1);
  };
}

function buildFlowField({
  seed,
  width,
  height,
  stream,
  gaps,
  strength = 1,
  curlStrength = 0.4,
  safeZones = [],
  textFieldMask = null,
}) {
  const baseScale = 0.0012;
  const curlScale = 0.001;
  const k = clamp(strength, 0, 1);
  const curlK = clamp(curlStrength, 0, 1);

  return (x, y) => {
    const primaryInfluence = stream ? streamInfluenceAt(x, y, stream, gaps) : 0;
    let dirX = stream ? stream.ux * primaryInfluence : 0;
    let dirY = stream ? stream.uy * primaryInfluence : 0;
    let maxInfluence = primaryInfluence;

    if (stream?.alt) {
      const altGaps = stream.alt.gaps || gaps || [];
      const altInfluence = streamInfluenceAt(x, y, stream.alt, altGaps);
      dirX += (stream.alt.ux || 0) * altInfluence;
      dirY += (stream.alt.uy || 0) * altInfluence;
      maxInfluence = Math.max(maxInfluence, altInfluence);
    }

    const curl = curlNoise2D(x * curlScale, y * curlScale, seed + 131);
    dirX += curl.x * curlK;
    dirY += curl.y * curlK;

    const len = Math.hypot(dirX, dirY) || 1;
    let strengthAt = clamp(maxInfluence * 0.85 + Math.abs(curl.x + curl.y) * 0.15, 0, 1) * k;

    if (safeZones && safeZones.length) {
      const inSafe = safeZones.some(
        (z) => x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h
      );
      if (inSafe) strengthAt = 0;
    }
    if (textFieldMask) {
      const mask = clamp(textFieldMask(x, y), 0, 1);
      strengthAt *= clamp(1 - mask * 0.95, 0, 1);
    }

    return {
      dx: dirX / len,
      dy: dirY / len,
      strength: strengthAt,
    };
  };
}

module.exports = {
  buildVoidMap,
  voidMaskAt,
  buildTextAvoidField,
  textAvoidInfluenceAt,
  buildStreamAxis,
  buildStreamGaps,
  streamDensityAt,
  streamWarpOffset,
  streamPoint,
  streamInfluenceAt,
  buildDensitySampler,
  buildStreamNodes,
  buildSphereClusters,
  sampleAlongStreamPoint,
  buildFilamentField,
  buildRidgeField,
  buildExtinctionField,
  buildFlowField,
};
