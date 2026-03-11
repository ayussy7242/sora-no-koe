"use strict";

const { clamp } = require("./utils");
const { streamPoint } = require("./fields");

function buildDeepFieldRegions({ rand, width, height, stream, avoidRect }) {
  const regions = [];
  const total = 2 + Math.floor(rand() * 3);

  const pushRegion = (x, y, rx, ry) => {
    regions.push({
      x,
      y,
      rx,
      ry,
      rot: rand() * Math.PI * 2,
      fray: 0.18 + rand() * 0.25,
      weight: 0.65 + rand() * 0.45,
      type: "deep",
    });
  };

  const addAlongStream = (t) => {
    if (stream) {
      const along = (rand() - 0.5) * stream.thickness * 0.4;
      const across = (rand() - 0.5) * stream.thickness * 0.9;
      const p = streamPoint(stream, t, along, across);
      pushRegion(p.x, p.y, 180 + rand() * 180, 110 + rand() * 140);
      return;
    }
    const x = width * (0.18 + rand() * 0.64);
    const y = height * (0.18 + rand() * 0.64);
    pushRegion(x, y, 160 + rand() * 180, 100 + rand() * 140);
  };

  addAlongStream(0.18 + rand() * 0.08);
  addAlongStream(0.78 + rand() * 0.12);

  for (let i = regions.length; i < total; i++) {
    addAlongStream(0.32 + rand() * 0.46);
  }

  if (avoidRect) {
    return regions.filter(
      (r) =>
        r.x < avoidRect.x ||
        r.x > avoidRect.x + avoidRect.w ||
        r.y < avoidRect.y ||
        r.y > avoidRect.y + avoidRect.h
    );
  }

  return regions;
}

function buildAnchorClusters({ rand, width, height, stream, safeZones = [] }) {
  const clusters = [];
  const addClusterAtT = (t, biasAcross = 1) => {
    const along = (rand() - 0.5) * stream.thickness * 0.35;
    const across = (rand() - 0.5) * stream.thickness * 0.95 * biasAcross;
    const p = streamPoint(stream, t, along, across);
    const cluster = {
      x: p.x,
      y: p.y,
      rx: 200 + rand() * 180,
      ry: 120 + rand() * 140,
      rot: rand() * Math.PI * 2,
      fray: 0.22 + rand() * 0.22,
      weight: 0.75 + rand() * 0.45,
      boost: 1.8,
      laneShift: (rand() - 0.5) * 0.8,
      type: rand() < 0.55 ? "globular" : "open",
    };
    const blocked = safeZones.some(
      (z) =>
        cluster.x > z.x &&
        cluster.x < z.x + z.w &&
        cluster.y > z.y &&
        cluster.y < z.y + z.h
    );
    if (!blocked) clusters.push(cluster);
  };

  if (stream) {
    addClusterAtT(0.12 + rand() * 0.08, rand() < 0.5 ? -1 : 1);
    addClusterAtT(0.82 + rand() * 0.1, rand() < 0.5 ? -1 : 1);
    if (rand() < 0.6) {
      addClusterAtT(0.42 + rand() * 0.12, rand() < 0.5 ? -1 : 1);
    }
  }

  return clusters;
}

function sampleEllipseRegionPoint(region, rand) {
  const angle = rand() * Math.PI * 2;
  let radius = Math.pow(rand(), 0.6) * region.weight;
  if (rand() < region.fray) {
    radius *= 1.1 + rand() * 0.7;
  }
  const ax = region.rx * radius;
  const ay = region.ry * radius;
  const px = Math.cos(angle) * ax;
  const py = Math.sin(angle) * ay;
  const cosR = Math.cos(region.rot);
  const sinR = Math.sin(region.rot);
  const rx = px * cosR - py * sinR;
  const ry = px * sinR + py * cosR;
  return { x: region.x + rx, y: region.y + ry };
}

function buildHeroRegions({
  rand,
  width,
  height,
  slideCount,
  safeZones = [],
  mood,
}) {
  const count = Number.isFinite(Number(mood?.heroRegionCount))
    ? Math.max(1, Math.min(2, Math.round(Number(mood.heroRegionCount))))
    : 1;
  const types = Array.isArray(mood?.heroRegionType) && mood.heroRegionType.length
    ? mood.heroRegionType
    : ["cluster", "filament"];

  const variantOrder = slideCount >= 5
    ? ["slide1", "moon", "slide2", "slide3", "slide5"]
    : Array.from({ length: slideCount }).map(() => "slide1");

  const heroAnchors = {
    slide1: [
      { x: 0.82, y: 0.18 },
      { x: 0.16, y: 0.18 },
      { x: 0.86, y: 0.38 },
      { x: 0.14, y: 0.36 },
    ],
    moon: [
      { x: 0.76, y: 0.22 },
      { x: 0.84, y: 0.5 },
      { x: 0.72, y: 0.74 },
      { x: 0.18, y: 0.8 },
    ],
    slide2: [
      { x: 0.12, y: 0.18 },
      { x: 0.88, y: 0.18 },
      { x: 0.88, y: 0.82 },
      { x: 0.12, y: 0.82 },
    ],
    slide3: [
      { x: 0.82, y: 0.78 },
      { x: 0.18, y: 0.78 },
      { x: 0.86, y: 0.58 },
      { x: 0.14, y: 0.58 },
    ],
    slide5: [
      { x: 0.22, y: 0.86 },
      { x: 0.78, y: 0.86 },
      { x: 0.78, y: 0.2 },
      { x: 0.2, y: 0.2 },
    ],
  };

  const regions = [];
  for (let i = 0; i < slideCount; i++) {
    const variant = variantOrder[i] || "slide1";
    const anchors = heroAnchors[variant] || heroAnchors.slide1;
    for (let j = 0; j < count; j++) {
      const pick = anchors[Math.floor(rand() * anchors.length)];
      const jitter = 0.04 + rand() * 0.04;
      const rx = clamp(pick.x + (rand() - 0.5) * jitter, 0.05, 0.95);
      const ry = clamp(pick.y + (rand() - 0.5) * jitter, 0.05, 0.95);
      const offsetX = width * i;
      let x = offsetX + rx * width;
      let y = ry * height;
      const radius = width * (0.12 + rand() * 0.06);
      const safe = safeZones[i] || null;
      if (safe && x > safe.x && x < safe.x + safe.w && y > safe.y && y < safe.y + safe.h) {
        const cx = safe.x + safe.w / 2;
        const cy = safe.y + safe.h / 2;
        const dx = x - cx;
        const dy = y - cy;
        const len = Math.hypot(dx, dy) || 1;
        x = cx + (dx / len) * (safe.w * 0.65);
        y = cy + (dy / len) * (safe.h * 0.65);
      }
      regions.push({
        x,
        y,
        r: radius,
        slideIndex: i,
        variant,
        type: types[Math.floor(rand() * types.length)],
      });
    }
  }
  return regions;
}

module.exports = {
  buildDeepFieldRegions,
  buildAnchorClusters,
  sampleEllipseRegionPoint,
  buildHeroRegions,
};
