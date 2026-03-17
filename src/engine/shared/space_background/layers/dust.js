"use strict";

const { clamp } = require("../utils");
const { sampleAlongStreamPoint, streamInfluenceAt } = require("../fields");
const { sampleEllipseRegionPoint } = require("../regions");
const { pickStarColorByWeights } = require("./stars");

function buildStructureTintField({
  rand,
  width,
  height,
  stream,
  streamGaps,
  densityAt,
  clusters = [],
  deepFields = [],
  voids = [],
  avoidRect,
  palette,
  opacityScale = 1,
  textFieldMask = null,
}) {
  if (!palette) return "";
  const dots = [];
  const colors = [
    palette.primary.nebula[0],
    palette.secondary.nebula[0] || palette.primary.nebula[1],
    palette.glow,
  ].filter(Boolean);
  const pickColor = () => colors[Math.floor(rand() * colors.length)];

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

  const addDot = (x, y, sizeMin, sizeMax, opacityBase, weight = 1) => {
    if (x < 0 || x > width || y < 0 || y > height) return;
    if (isInAvoid(x, y)) return;
    if (isInVoid(x, y)) return;
    const textMask = textFieldMask ? clamp(textFieldMask(x, y), 0, 1) : 0;
    if (textMask > 0.65) return;
    const d = densityAt ? densityAt(x, y) : 0.5;
    const s = stream ? streamInfluenceAt(x, y, stream, streamGaps || []) : 0;
    const gate = Math.pow(clamp(d + s * 0.6, 0, 1), 0.7);
    if (rand() > gate) return;
    const r = sizeMin + rand() * (sizeMax - sizeMin);
    const opacity = clamp(opacityBase * (0.4 + gate * 0.8) * weight * opacityScale * clamp(1 - textMask * 0.9, 0.2, 1), 0.02, 0.16);
    const color = pickColor();
    dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" opacity="${opacity.toFixed(3)}"/>`);
  };

  const scale = (width * height) / (1080 * 1080);
  const spineCount = Math.round(310 * scale);
  const deepCount = Math.round(220 * scale);
  const clusterCount = Math.round(190 * scale);

  for (let i = 0; i < spineCount; i++) {
    const p = sampleAlongStreamPoint({ rand, stream, streamGaps, spread: 1.1 });
    addDot(p.x, p.y, 0.5, 1.4, 0.1, 1);
  }

  if (deepFields && deepFields.length) {
    for (let i = 0; i < deepCount; i++) {
      const region = deepFields[Math.floor(rand() * deepFields.length)];
      const pos = sampleEllipseRegionPoint(region, rand);
      addDot(pos.x, pos.y, 0.5, 1.2, 0.085, 1.1);
    }
  }

  if (clusters && clusters.length) {
    for (let i = 0; i < clusterCount; i++) {
      const cluster = clusters[Math.floor(rand() * clusters.length)];
      const pos = sampleEllipseRegionPoint(cluster, rand);
      addDot(pos.x, pos.y, 0.6, 1.6, 0.11, 1.3);
    }
  }

  return dots.length ? `<g>${dots.join("")}</g>` : "";
}

function buildCosmicDustLayer({ rand, width, height, count, densityAt, stream, streamGaps, voids = [], colorWeights, textFieldMask = null }) {
  const dots = [];
  if (!count || count <= 0) return "";
  const weights = colorWeights || { white: 0.8, blue: 0.12, yellow: 0.06, red: 0.02 };

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
    const useStream = stream && rand() < 0.45;
    let x;
    let y;
    if (useStream) {
      const p = sampleAlongStreamPoint({ rand, stream, streamGaps, spread: 1.2 });
      x = p.x;
      y = p.y;
    } else {
      x = rand() * width;
      y = rand() * height;
    }
    if (isInVoid(x, y)) continue;
    const textMask = textFieldMask ? clamp(textFieldMask(x, y), 0, 1) : 0;
    if (textMask > 0.6) continue;
    if (densityAt) {
      const d = clamp(densityAt(x, y), 0.05, 1);
      if (rand() > Math.pow(d, 0.75)) continue;
    }
    const r = 0.2 + rand() * 0.2;
    const opacity = (0.06 + rand() * 0.04) * clamp(1 - textMask * 0.9, 0.2, 1);
    const color = pickStarColorByWeights(rand, weights);
    dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" opacity="${opacity.toFixed(3)}"/>`);
  }

  return dots.length ? `<g>${dots.join("")}</g>` : "";
}

function buildMilkyDustLayer({
  rand,
  width,
  height,
  stream,
  streamGaps,
  densityAt,
  voids = [],
  color,
  countScale = 1,
  opacityScale = 1,
  spreadScale = 1,
  textFieldMask = null,
}) {
  if (!stream) return "";
  const dots = [];
  const count = Math.round((width * height) / (1080 * 1080) * 520 * countScale);

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
    const p = sampleAlongStreamPoint({ rand, stream, streamGaps, spread: 1.25 * spreadScale });
    const x = p.x;
    const y = p.y;
    if (isInVoid(x, y)) continue;
    const textMask = textFieldMask ? clamp(textFieldMask(x, y), 0, 1) : 0;
    if (textMask > 0.6) continue;
    if (densityAt) {
      const d = clamp(densityAt(x, y), 0.08, 1);
      if (rand() > Math.pow(d, 0.65)) continue;
    }
    const r = 0.2 + rand() * 0.3;
    const opacity = (0.06 + rand() * 0.06) * opacityScale * clamp(1 - textMask * 0.9, 0.2, 1);
    dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" opacity="${opacity.toFixed(3)}"/>`);
  }

  return dots.length ? `<g>${dots.join("")}</g>` : "";
}

function buildNebulaGrainLayer({ rand, width, height, densityAt, stream, streamGaps, clusters = [], deepFields = [], voids = [], palette, textFieldMask = null }) {
  if (!palette) return "";
  const dots = [];
  const colors = [
    palette.primary.nebula[0],
    palette.secondary.nebula[0] || palette.primary.nebula[1],
    palette.glow,
  ].filter(Boolean);
  const pickColor = () => colors[Math.floor(rand() * colors.length)];

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

  const scale = (width * height) / (1080 * 1080);
  const count = Math.round(420 * scale);

  for (let i = 0; i < count; i++) {
    let x;
    let y;
    if (clusters.length && rand() < 0.45) {
      const region = clusters[Math.floor(rand() * clusters.length)];
      const pos = sampleEllipseRegionPoint(region, rand);
      x = pos.x;
      y = pos.y;
    } else if (deepFields.length && rand() < 0.35) {
      const region = deepFields[Math.floor(rand() * deepFields.length)];
      const pos = sampleEllipseRegionPoint(region, rand);
      x = pos.x;
      y = pos.y;
    } else if (stream && rand() < 0.4) {
      const p = sampleAlongStreamPoint({ rand, stream, streamGaps, spread: 1.05 });
      x = p.x;
      y = p.y;
    } else {
      x = rand() * width;
      y = rand() * height;
    }
    if (isInVoid(x, y)) continue;
    const textMask = textFieldMask ? clamp(textFieldMask(x, y), 0, 1) : 0;
    if (textMask > 0.6) continue;
    if (densityAt) {
      const d = clamp(densityAt(x, y), 0.06, 1);
      if (rand() > Math.pow(d, 0.7)) continue;
    }
    const r = 0.35 + rand() * 0.55;
    const opacity = (0.035 + rand() * 0.035) * clamp(1 - textMask * 0.9, 0.2, 1);
    const color = pickColor();
    dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" opacity="${opacity.toFixed(3)}"/>`);
  }

  return dots.length ? `<g>${dots.join("")}</g>` : "";
}

function buildDustTintLayer({ rand, width, height, densityAt, stream, streamGaps, voids = [], color, opacity = 0.08, textFieldMask = null }) {
  if (!color || opacity <= 0) return "";
  const dots = [];
  const count = Math.round((width * height) / (1080 * 1080) * 620);

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
    const useStream = stream && rand() < 0.5;
    let x;
    let y;
    if (useStream) {
      const p = sampleAlongStreamPoint({ rand, stream, streamGaps, spread: 1.15 });
      x = p.x;
      y = p.y;
    } else {
      x = rand() * width;
      y = rand() * height;
    }
    if (isInVoid(x, y)) continue;
    const textMask = textFieldMask ? clamp(textFieldMask(x, y), 0, 1) : 0;
    if (textMask > 0.6) continue;
    if (densityAt) {
      const d = clamp(densityAt(x, y), 0.06, 1);
      if (rand() > Math.pow(d, 0.7)) continue;
    }
    const r = 0.2 + rand() * 0.35;
    const o = opacity * (0.6 + rand() * 0.8) * clamp(1 - textMask * 0.9, 0.2, 1);
    dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" opacity="${o.toFixed(3)}"/>`);
  }

  return dots.length ? `<g>${dots.join("")}</g>` : "";
}

function buildMicroGlowLayer({ rand, width, height, clusters = [], deepFields = [], voids = [], color, opacity = 0.035, textFieldMask = null }) {
  if (!color || opacity <= 0) return "";
  const dots = [];
  const regions = [...clusters, ...deepFields];
  if (!regions.length) return "";

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

  const count = Math.min(18, regions.length * 4);
  for (let i = 0; i < count; i++) {
    const region = regions[Math.floor(rand() * regions.length)];
    const pos = sampleEllipseRegionPoint(region, rand);
    if (isInVoid(pos.x, pos.y)) continue;
    const textMask = textFieldMask ? clamp(textFieldMask(pos.x, pos.y), 0, 1) : 0;
    if (textMask > 0.6) continue;
    const r = 12 + rand() * 36;
    const o = opacity * (0.6 + rand() * 0.6) * clamp(1 - textMask * 0.9, 0.2, 1);
    dots.push(`<circle cx="${pos.x.toFixed(2)}" cy="${pos.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" opacity="${o.toFixed(3)}"/>`);
  }

  return dots.length ? `<g>${dots.join("")}</g>` : "";
}

module.exports = {
  buildStructureTintField,
  buildCosmicDustLayer,
  buildMilkyDustLayer,
  buildNebulaGrainLayer,
  buildDustTintLayer,
  buildMicroGlowLayer,
};
