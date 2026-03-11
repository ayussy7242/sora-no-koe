"use strict";

const { clamp } = require("../utils");
const { streamPoint, streamDensityAt } = require("../fields");

function sampleStarPoint({
  rand,
  width,
  height,
  stream,
  streamGaps = [],
  streamNodes = [],
  sphereClusters = [],
  bias,
  avoidCenter = false,
  avoidCircles = [],
  voids = [],
}) {
  const safeZone = {
    x: width * 0.24,
    y: height * 0.22,
    w: width * 0.52,
    h: height * 0.46,
  };

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

  const nodes = Array.isArray(streamNodes) ? streamNodes : [];
  const spheres = Array.isArray(sphereClusters) ? sphereClusters : [];

  const sampleSphereCluster = (cluster) => {
    const angle = rand() * Math.PI * 2;
    let radius = Math.pow(rand(), 0.68) * cluster.spread * cluster.weight;
    if (rand() < cluster.fray) {
      radius *= 1.15 + rand() * 0.65;
    }
    const ax = radius * cluster.ellA;
    const ay = radius * cluster.ellB;
    const px = Math.cos(angle) * ax;
    const py = Math.sin(angle) * ay;
    const cosR = Math.cos(cluster.rot);
    const sinR = Math.sin(cluster.rot);
    const rx = px * cosR - py * sinR;
    const ry = px * sinR + py * cosR;
    const jitter = cluster.spread * 0.08;
    return {
      x: cluster.x + rx + (rand() - 0.5) * jitter,
      y: cluster.y + ry + (rand() - 0.5) * jitter,
    };
  };

  const sampleStreamNode = (node) => {
    if (!stream) {
      const angle = rand() * Math.PI * 2;
      const radius = Math.pow(rand(), 0.65) * node.spread;
      return {
        x: node.x + Math.cos(angle) * radius,
        y: node.y + Math.sin(angle) * radius,
      };
    }
    const along = (rand() - 0.5) * node.spread * (1.1 + rand() * 0.4);
    const across = (rand() - 0.5) * node.spread * 0.55;
    const t = clamp(((node.x - stream.x1) * stream.ux + (node.y - stream.y1) * stream.uy) / stream.len, 0, 1);
    const warped = streamPoint(stream, t, along, across);
    return { x: warped.x, y: warped.y };
  };

  const sampleAlongStream = (spreadScale = 1) => {
    if (!stream) {
      return { x: rand() * width, y: rand() * height };
    }
    for (let i = 0; i < 14; i++) {
      const t = rand();
      if (rand() > streamDensityAt(t, streamGaps)) continue;
      const across = (rand() - 0.5) * stream.thickness * spreadScale;
      const along = (rand() - 0.5) * stream.thickness * 0.6 * spreadScale;
      const warped = streamPoint(stream, t, along, across);
      return { x: warped.x, y: warped.y };
    }
    return { x: rand() * width, y: rand() * height };
  };

  for (let i = 0; i < 10; i++) {
    let x;
    let y;
    if (bias?.sphere && spheres.length && rand() < bias.sphere) {
      const c = spheres[Math.floor(rand() * spheres.length)];
      ({ x, y } = sampleSphereCluster(c));
    } else if (bias?.cluster && nodes.length && rand() < bias.cluster) {
      const n = nodes[Math.floor(rand() * nodes.length)];
      ({ x, y } = sampleStreamNode(n));
    } else if (bias?.stream && stream && rand() < bias.stream) {
      ({ x, y } = sampleAlongStream(bias.streamWidth || 0.9));
    } else {
      x = rand() * width;
      y = rand() * height;
    }

    if (avoidCenter && x > safeZone.x && x < safeZone.x + safeZone.w && y > safeZone.y && y < safeZone.y + safeZone.h) {
      continue;
    }
    if (isInVoid(x, y)) continue;
    if (avoidCircles && avoidCircles.length) {
      let blocked = false;
      for (const circle of avoidCircles) {
        if (!circle) continue;
        const dx = x - circle.x;
        const dy = y - circle.y;
        if (dx * dx + dy * dy < circle.r * circle.r) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
    }
    return { x, y };
  }

  return { x: rand() * width, y: rand() * height };
}

module.exports = {
  sampleStarPoint,
};
