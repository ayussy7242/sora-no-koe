"use strict";

const { clamp } = require("../utils");
const { sampleEllipseRegionPoint } = require("../regions");
const { renderStarSprite } = require("./renderStarSprite");
const { pickStarColorByTemperature, mixColor } = require("./star_temperature");
const { sampleStarSize, sampleStarPopulation } = require("./star_population");

function pickStarColorByWeights(rand, weights) {
  const w = weights || { white: 0.75, blue: 0.12, yellow: 0.08, red: 0.05 };
  const roll = rand();
  if (roll < w.white) return "#FFFFFF";
  if (roll < w.white + w.blue) return "#A8C7FF";
  if (roll < w.white + w.blue + w.yellow) return "#FFF1C2";
  return "#FFB0B0";
}

function buildClusterField({
  rand,
  width,
  height,
  clusters,
  colorWeights,
  avoidRect,
  voids = [],
  tone,
  clusterTightness = 0.5,
  clusterFragmentation = 0.45,
  textFieldMask = null,
  haloMix = 0.35,
  brightBoost = 1,
}) {
  if (!clusters || !clusters.length) return "";
  const dots = [];
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

  const sampleClusterPoint = (cluster, scale = 1) => {
    const angle = rand() * Math.PI * 2;
    const tightness = clamp(clusterTightness, 0.25, 0.95);
    let radius = Math.pow(rand(), 0.45 + (1 - tightness) * 0.35) * cluster.weight * scale;
    if (rand() < cluster.fray) radius *= 1.15 + rand() * 0.7;
    const ax = cluster.rx * radius;
    const ay = cluster.ry * radius;
    const px = Math.cos(angle) * ax;
    const py = Math.sin(angle) * ay;
    const cosR = Math.cos(cluster.rot);
    const sinR = Math.sin(cluster.rot);
    let rx = px * cosR - py * sinR;
    let ry = px * sinR + py * cosR;
    if (cluster.laneShift) {
      rx += cluster.laneShift * cluster.rx * 0.35;
      ry += cluster.laneShift * cluster.ry * 0.18;
    }
    return { x: cluster.x + rx, y: cluster.y + ry };
  };

  const addDots = (cluster, count, sizeMin, sizeMax, opMin, opMax, scale, withHalo = false, haloMixLocal = haloMix) => {
    for (let i = 0; i < count; i++) {
      const pos = sampleClusterPoint(cluster, scale);
      if (pos.x < 0 || pos.x > width || pos.y < 0 || pos.y > height) continue;
      if (isInAvoid(pos.x, pos.y)) continue;
      if (isInVoid(pos.x, pos.y)) continue;
      const textMask = textFieldMask ? clamp(textFieldMask(pos.x, pos.y), 0, 1) : 0;
      if (textMask > 0.6) continue;
      let centerBoost = 1;
      let haloBoost = 1;
      if (cluster.coreBoost) {
        const dx = pos.x - cluster.x;
        const dy = pos.y - cluster.y;
        const cosR = Math.cos(-cluster.rot);
        const sinR = Math.sin(-cluster.rot);
        const rx = dx * cosR - dy * sinR;
        const ry = dx * sinR + dy * cosR;
        const nx = rx / (cluster.rx || 1);
        const ny = ry / (cluster.ry || 1);
        const norm = Math.sqrt(nx * nx + ny * ny);
        const coreWeight = clamp(1 - norm, 0, 1);
        centerBoost = 1 + cluster.coreBoost * coreWeight;
        haloBoost = 1 + cluster.coreBoost * 0.5 * coreWeight;
      }
      const sizeJitter = 0.75 + rand() * 0.6;
      const r = sampleStarSize({ rand, min: sizeMin, max: sizeMax, power: -1.35 }) * sizeJitter;
      const opacity = (opMin + rand() * (opMax - opMin)) * clamp(1 - textMask * 0.9, 0.2, 1) * centerBoost;
      const color = pickStarColorByWeights(rand, colorWeights);
      if (withHalo) {
        const haloColor = tone?.haloBias ? mixColor(color, tone.haloBias, haloMixLocal) : color;
        const haloR = r * (1.8 + rand() * 0.6);
        dots.push(
          `<circle cx="${pos.x.toFixed(2)}" cy="${pos.y.toFixed(2)}" r="${haloR.toFixed(2)}" fill="${haloColor}" opacity="${(opacity * 0.18 * haloBoost).toFixed(3)}"/>`
        );
      }
      dots.push(`<circle cx="${pos.x.toFixed(2)}" cy="${pos.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" opacity="${opacity.toFixed(2)}"/>`);
    }
  };

  const buildSubclusters = (cluster) => {
    const subclusters = [];
    const frag = clamp(clusterFragmentation, 0.2, 0.95);
    const count = 1 + Math.floor(rand() * (2 + Math.round(frag * 3)));
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.max(cluster.rx, cluster.ry) * (0.25 + rand() * 0.5);
      subclusters.push({
        ...cluster,
        x: cluster.x + Math.cos(angle) * dist,
        y: cluster.y + Math.sin(angle) * dist,
        rx: cluster.rx * (0.25 + rand() * 0.35),
        ry: cluster.ry * (0.25 + rand() * 0.35),
        weight: cluster.weight * (0.45 + rand() * 0.35),
        fray: clamp(cluster.fray + 0.15 + rand() * 0.25, 0.2, 0.9),
        rot: rand() * Math.PI * 2,
      });
    }
    return subclusters;
  };

  clusters.forEach((cluster) => {
    const boost = cluster.boost || 1;
    const type = cluster.type || "open";
    const subclusters = buildSubclusters(cluster);
    if (type === "deep") {
      addDots(cluster, Math.round(170 * boost), 0.3, 0.55, 0.08, 0.18, 1.15);
      addDots(cluster, Math.round(110 * boost), 0.55, 0.85, 0.16, 0.32, 0.95);
      addDots(cluster, Math.round(20 * boost * brightBoost), 0.9, 1.2, 0.28, 0.45, 0.8, true);
      subclusters.forEach((sc) => {
        addDots(sc, Math.round(45 * boost), 0.3, 0.55, 0.08, 0.18, 0.9);
        addDots(sc, Math.round(20 * boost), 0.55, 0.85, 0.16, 0.28, 0.7);
      });
    } else if (type === "globular") {
      addDots(cluster, Math.round(220 * boost), 0.3, 0.55, 0.12, 0.24, 1.05);
      addDots(cluster, Math.round(140 * boost), 0.55, 0.95, 0.22, 0.42, 0.8);
      addDots(cluster, Math.round(55 * boost * brightBoost), 0.9, 1.35, 0.35, 0.58, 0.6, true);
      addDots(cluster, Math.round(12 * boost * brightBoost), 1.4, 1.9, 0.55, 0.75, 0.45, true);
      // dense core
      addDots(cluster, Math.round(70 * boost), 0.3, 0.5, 0.18, 0.3, 0.35);
      subclusters.forEach((sc) => {
        addDots(sc, Math.round(55 * boost), 0.35, 0.7, 0.12, 0.26, 0.85);
        addDots(sc, Math.round(18 * boost * brightBoost), 0.7, 1.05, 0.2, 0.35, 0.65);
      });
    } else {
      // open cluster
      addDots(cluster, Math.round(120 * boost), 0.3, 0.55, 0.1, 0.22, 1.15);
      addDots(cluster, Math.round(80 * boost), 0.55, 0.9, 0.2, 0.4, 0.95);
      addDots(cluster, Math.round(26 * boost * brightBoost), 0.9, 1.25, 0.32, 0.5, 0.75, true);
      addDots(cluster, Math.round(6 * boost * brightBoost), 1.3, 1.7, 0.5, 0.7, 0.6, true);
      subclusters.forEach((sc) => {
        addDots(sc, Math.round(42 * boost), 0.3, 0.6, 0.1, 0.24, 0.95);
        addDots(sc, Math.round(14 * boost * brightBoost), 0.6, 0.95, 0.2, 0.32, 0.7);
      });
    }

    const frag = clamp(clusterFragmentation, 0.2, 0.95);
    const scatterCount = Math.round((18 + frag * 26) * boost);
    addDots(cluster, scatterCount, 0.25, 0.55, 0.06, 0.18, 1.6 + frag * 0.5, false);

    if (rand() < 0.45 + frag * 0.3) {
      const sat = {
        ...cluster,
        x: cluster.x + (rand() - 0.5) * cluster.rx * (1.6 + frag),
        y: cluster.y + (rand() - 0.5) * cluster.ry * (1.6 + frag),
        rx: cluster.rx * 0.25,
        ry: cluster.ry * 0.25,
        weight: cluster.weight * 0.45,
        fray: 0.4,
      };
      addDots(sat, Math.round(24 * boost), 0.3, 0.6, 0.08, 0.2, 0.9);
    }
  });

  return `<g>${dots.join("")}</g>`;
}

function buildHeroStars({
  rand,
  width,
  height,
  densityAt,
  voids = [],
  avoidRect,
  colorWeights,
  countOverride,
  tone,
  textFieldMask = null,
  sizeMin = 2.6,
  sizeMax = 3.8,
  bloomStrength = 1.1,
  spikeStrength = 1.1,
  chromaStrength = 1.0,
} = {}) {
  const stars = [];
  const count =
    Number.isFinite(Number(countOverride))
      ? Math.max(0, Math.round(Number(countOverride)))
      : 5 + Math.floor(rand() * 8);
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

  for (let i = 0; i < count; i++) {
    for (let t = 0; t < 18; t++) {
      const x = rand() * width;
      const y = rand() * height;
      if (isInAvoid(x, y)) continue;
      if (isInVoid(x, y)) continue;
      const textMask = textFieldMask ? clamp(textFieldMask(x, y), 0, 1) : 0;
      if (textMask > 0.3) continue;
      const d = densityAt ? densityAt(x, y) : 0.5;
      if (rand() > Math.pow(clamp(d, 0.1, 1), 1.1)) continue;
      const r = sampleStarSize({ rand, min: sizeMin, max: sizeMax, power: -0.6 });
      const pick = pickStarColorByTemperature(rand, colorWeights, tone);
      stars.push(
        renderStarSprite(x, y, r, 0.95, pick.color, "giant", true, {
          temperature: pick.temp,
          haloColor: pick.haloColor,
          outerHaloColor: pick.outerHaloColor,
          depth: "hero",
          bloomStrength,
          spikeStrength,
          chromaStrength,
        })
      );
      break;
    }
  }

  return stars.length ? `<g>${stars.join("")}</g>` : "";
}

function buildDeepFieldLayer({
  rand,
  width,
  height,
  regions,
  counts,
  colorWeights,
  avoidRect,
  voids = [],
  tone,
  textFieldMask = null,
}) {
  if (!regions || !regions.length) return "";
  const dots = [];
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

  const addDots = (count, sizeMin, sizeMax, opMin, opMax) => {
    for (let i = 0; i < count; i++) {
      const region = regions[Math.floor(rand() * regions.length)];
      const pos = sampleEllipseRegionPoint(region, rand);
      if (pos.x < 0 || pos.x > width || pos.y < 0 || pos.y > height) continue;
      if (isInAvoid(pos.x, pos.y)) continue;
      if (isInVoid(pos.x, pos.y)) continue;
      const textMask = textFieldMask ? clamp(textFieldMask(pos.x, pos.y), 0, 1) : 0;
      if (textMask > 0.6) continue;
      const r = sampleStarSize({ rand, min: sizeMin, max: sizeMax, power: -1.3 });
      const opacity = (opMin + rand() * (opMax - opMin)) * clamp(1 - textMask * 0.9, 0.2, 1);
      const color = pickStarColorByWeights(rand, colorWeights);
      dots.push(`<circle cx="${pos.x.toFixed(2)}" cy="${pos.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" opacity="${opacity.toFixed(2)}"/>`);
    }
  };

  addDots(counts.dust || 0, 0.3, 0.55, 0.08, 0.18);
  addDots(counts.micro || 0, 0.55, 0.85, 0.18, 0.35);
  addDots(counts.small || 0, 0.9, 1.2, 0.35, 0.55);

  return `<g>${dots.join("")}</g>`;
}

function buildMicroSharpLayer({
  rand,
  width,
  height,
  count = 220,
  densityAt,
  voids = [],
  colorWeights,
  textFieldMask = null,
}) {
  const dots = [];
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

  for (let i = 0; i < count; i++) {
    const x = rand() * width;
    const y = rand() * height;
    if (isInVoid(x, y)) continue;
    const textMask = textFieldMask ? clamp(textFieldMask(x, y), 0, 1) : 0;
    if (textMask > 0.75) continue;
    if (densityAt && rand() > Math.pow(clamp(densityAt(x, y), 0.1, 1), 0.9)) continue;
    const r = 0.35 + rand() * 0.35;
    const opacity = (0.35 + rand() * 0.35) * clamp(1 - textMask * 0.7, 0.2, 1);
    const color = pickStarColorByWeights(rand, colorWeights);
    dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" opacity="${opacity.toFixed(2)}"/>`);
  }
  return `<g>${dots.join("")}</g>`;
}

function buildStarLayers({
  rand,
  width,
  height,
  theme,
  retroCount,
  avoidCenter = true,
  avoidCircles = [],
  intensityScale = 1,
  colorWeights,
  tone,
  stream,
  streamNodes = [],
  streamGaps = [],
  sphereClusters = [],
  densityAt,
  colorFieldAt,
  extinctionAt,
  flowField,
  populationTheme,
  voids = [],
  regions,
  heroRegions,
  safeZone,
  densityScale = 1,
  textFieldMask = null,
}) {
  const seeds = sampleStarPopulation({
    rand,
    theme,
    width,
    height,
    densityAt,
    colorFieldAt,
    extinctionAt,
    flowField,
    populationTheme,
    stream,
    streamNodes,
    streamGaps,
    sphereClusters,
    regions,
    heroRegions,
    voids,
    textFieldMask,
    avoidCenter,
    avoidCircles,
    safeZone,
    colorWeights,
    tone,
    densityScale,
    retroCount,
  });

  const parts = seeds.map((seed) =>
    renderStarSprite({
      x: seed.x,
      y: seed.y,
      radius: seed.size,
      opacity: seed.brightness * intensityScale,
      temperature: seed.temp,
      color: seed.color,
      haloColor: seed.haloColor,
      outerHaloColor: seed.outerHaloColor,
      kind: seed.profile,
      depth: seed.depth,
      spikeStrength: seed.spikeStrength,
      chromaStrength: seed.chromaStrength,
      bloomStrength: seed.bloomStrength,
    })
  );

  return `<g>${parts.join("")}</g>`;
}

module.exports = {
  pickStarColorByWeights,
  buildClusterField,
  buildHeroStars,
  buildDeepFieldLayer,
  buildMicroSharpLayer,
  buildStarLayers,
};
