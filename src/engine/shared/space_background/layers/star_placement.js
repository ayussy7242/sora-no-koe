"use strict";

const { clamp } = require("../utils");
const { sampleEllipseRegionPoint } = require("../regions");
const { sampleStarPoint } = require("./sampleStarPoint");

function isInVoid(voids, x, y) {
  if (!voids || !voids.length) return false;
  return voids.some((v) => {
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
}

function isInRect(rect, x, y) {
  if (!rect) return false;
  return x > rect.x && x < rect.x + rect.w && y > rect.y && y < rect.y + rect.h;
}

function placeRandomSparse({ rand, width, height, densityAt, voids, avoidRect, avoidMask, preferLowDensity = false }) {
  for (let t = 0; t < 14; t++) {
    const x = rand() * width;
    const y = rand() * height;
    if (isInRect(avoidRect, x, y)) continue;
    if (isInVoid(voids, x, y)) continue;
    if (avoidMask && avoidMask(x, y) > 0.6) continue;
    if (densityAt) {
      const d = clamp(densityAt(x, y), 0.05, 1);
      if (preferLowDensity && d > 0.55 && rand() < 0.75) continue;
      if (rand() > Math.pow(d, 0.85)) continue;
    }
    return { x, y, source: "random" };
  }
  return { x: rand() * width, y: rand() * height, source: "random" };
}

function placeInDeepField({ rand, regions, width, height, voids, avoidRect, avoidMask }) {
  if (regions && regions.length) {
    for (let t = 0; t < 10; t++) {
      const region = regions[Math.floor(rand() * regions.length)];
      const pos = sampleEllipseRegionPoint(region, rand);
      if (!pos) continue;
      if (pos.x < 0 || pos.x > width || pos.y < 0 || pos.y > height) continue;
      if (isInRect(avoidRect, pos.x, pos.y)) continue;
      if (isInVoid(voids, pos.x, pos.y)) continue;
      if (avoidMask && avoidMask(pos.x, pos.y) > 0.6) continue;
      return { x: pos.x, y: pos.y, source: "deep" };
    }
  }
  return placeRandomSparse({ rand, width, height, voids, avoidRect, avoidMask });
}

function placeInCluster({ rand, clusters, width, height, voids, avoidRect, avoidMask, returnRegion = false }) {
  if (clusters && clusters.length) {
    for (let t = 0; t < 10; t++) {
      const region = clusters[Math.floor(rand() * clusters.length)];
      const pos = sampleEllipseRegionPoint(region, rand);
      if (!pos) continue;
      if (pos.x < 0 || pos.x > width || pos.y < 0 || pos.y > height) continue;
      if (isInRect(avoidRect, pos.x, pos.y)) continue;
      if (isInVoid(voids, pos.x, pos.y)) continue;
      if (avoidMask && avoidMask(pos.x, pos.y) > 0.6) continue;
      if (returnRegion) {
        return { x: pos.x, y: pos.y, source: "cluster", region };
      }
      return { x: pos.x, y: pos.y, source: "cluster" };
    }
  }
  return placeRandomSparse({ rand, width, height, voids, avoidRect, avoidMask });
}

function placeAlongStream({
  rand,
  width,
  height,
  stream,
  streamNodes,
  streamGaps,
  sphereClusters,
  voids,
  avoidCenter,
  avoidCircles,
  avoidRect,
  bias,
  avoidMask,
}) {
  for (let t = 0; t < 14; t++) {
    const pos = sampleStarPoint({
      rand,
      width,
      height,
      stream,
      streamGaps,
      streamNodes,
      sphereClusters,
      bias: bias || { stream: 0.85, streamWidth: 1.1, cluster: 0.25, sphere: 0.08 },
      avoidCenter,
      avoidCircles,
      voids,
    });
    if (!pos) continue;
    if (isInRect(avoidRect, pos.x, pos.y)) continue;
    if (avoidMask && avoidMask(pos.x, pos.y) > 0.6) continue;
    return { x: pos.x, y: pos.y, source: "stream" };
  }
  return placeRandomSparse({ rand, width, height, voids, avoidRect, avoidMask });
}

module.exports = {
  placeRandomSparse,
  placeInDeepField,
  placeInCluster,
  placeAlongStream,
};
