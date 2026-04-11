"use strict";

const { clamp, hashString, mulberry32 } = require("../utils");
const { streamPoint, sampleAlongStreamPoint } = require("../fields");

function nebulaNoiseFilter({ id, baseFrequency, numOctaves, seed, blur }) {
  return (
    `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${baseFrequency}" numOctaves="${numOctaves}" seed="${seed}" result="noise"/>` +
    `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="alpha"/>` +
    `<feGaussianBlur in="alpha" stdDeviation="${blur}"/>` +
    `</filter>`
  );
}

function buildGasCloudLayer({ rand, width, height, idPrefix, color, opacity = 0.05 }) {
  if (!color || opacity <= 0) return { defs: "", body: "" };
  const noiseSeed = hashString(`${idPrefix}-gas`);
  const noiseRand = mulberry32(noiseSeed);
  const noiseId = `${idPrefix}-gasNoise`;
  const maskId = `${idPrefix}-gasMask`;
  const freqX = (0.004 + noiseRand() * 0.006).toFixed(4);
  const freqY = (0.006 + noiseRand() * 0.008).toFixed(4);
  const alpha = (0.55 + noiseRand() * 0.25).toFixed(2);
  const blur = (22 + noiseRand() * 16).toFixed(1);

  const defs = [
    `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freqX} ${freqY}" numOctaves="3" seed="${noiseSeed % 10000}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha} 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="${blur}"/>` +
      `</filter>`,
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`,
  ].join("");

  const body = `<rect width="${width}" height="${height}" fill="${color}" opacity="${opacity.toFixed(3)}" mask="url(#${maskId})"/>`;
  return { defs, body };
}

function buildFarGasLayer({ rand, width, height, densityAt, stream, streamGaps, voids = [], color, opacity = 0.04, idPrefix }) {
  if (!color || opacity <= 0) return { defs: "", body: "" };
  const dots = [];
  const count = Math.round((width * height) / (1080 * 1080) * 28);
  const noiseSeed = hashString(`${idPrefix}-farGas`);
  const noiseRand = mulberry32(noiseSeed);
  const noiseId = `${idPrefix}-farGasNoise`;
  const maskId = `${idPrefix}-farGasMask`;
  const freqX = (0.004 + noiseRand() * 0.006).toFixed(4);
  const freqY = (0.006 + noiseRand() * 0.008).toFixed(4);
  const alpha = (0.48 + noiseRand() * 0.28).toFixed(2);
  const blur = (26 + noiseRand() * 18).toFixed(1);

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
    const useStream = stream && rand() < 0.35;
    let x;
    let y;
    if (useStream) {
      const p = sampleAlongStreamPoint({ rand, stream, streamGaps, spread: 1.25 });
      x = p.x;
      y = p.y;
    } else {
      x = rand() * width;
      y = rand() * height;
    }
    if (isInVoid(x, y)) continue;
    if (densityAt) {
      const d = clamp(densityAt(x, y), 0.05, 1);
      if (rand() > Math.pow(d, 0.55)) continue;
    }
    const r = 120 + rand() * 260;
    const o = opacity * (0.35 + rand() * 0.6);
    dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}" opacity="${o.toFixed(3)}"/>`);
  }

  const defs = [
    `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freqX} ${freqY}" numOctaves="3" seed="${noiseSeed % 10000}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha} 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="${blur}"/>` +
      `</filter>`,
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`,
  ].join("");

  const body = dots.length ? `<g mask="url(#${maskId})">${dots.join("")}</g>` : "";
  return { defs, body };
}

function buildAtmosphereTintLayer({ rand, width, height, idPrefix, color, opacity = 0.05 }) {
  if (!color || opacity <= 0) return { defs: "", body: "" };
  const noiseSeed = hashString(`${idPrefix}-atmo`);
  const noiseRand = mulberry32(noiseSeed);
  const noiseId = `${idPrefix}-atmoNoise`;
  const maskId = `${idPrefix}-atmoMask`;
  const freqX = (0.003 + noiseRand() * 0.004).toFixed(4);
  const freqY = (0.004 + noiseRand() * 0.004).toFixed(4);
  const alpha = (0.45 + noiseRand() * 0.25).toFixed(2);
  const blur = (26 + noiseRand() * 18).toFixed(1);

  const defs = [
    `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freqX} ${freqY}" numOctaves="2" seed="${noiseSeed % 10000}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha} 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="${blur}"/>` +
      `</filter>`,
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`,
  ].join("");

  const body = `<rect width="${width}" height="${height}" fill="${color}" opacity="${clamp(opacity, 0.02, 0.09).toFixed(3)}" mask="url(#${maskId})"/>`;
  return { defs, body };
}

function buildFilamentLayer({ rand, width, height, stream, idPrefix, color, opacity = 0.06 }) {
  if (!stream || !color || opacity <= 0) return { defs: "", body: "" };
  const angleBase = (Math.atan2(stream.y2 - stream.y1, stream.x2 - stream.x1) * 180) / Math.PI;
  const noiseId = `${idPrefix}-filNoise`;
  const maskId = `${idPrefix}-filMask`;
  const freqX = (0.02 + rand() * 0.02).toFixed(3);
  const freqY = (0.06 + rand() * 0.05).toFixed(3);
  const defs = [
    `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freqX} ${freqY}" numOctaves="2" seed="${Math.floor(rand() * 9000)}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.65 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="6"/>` +
      `</filter>`,
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`,
  ].join("");

  const count = 4 + Math.floor(rand() * 3);
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const t = rand();
    const along = (rand() - 0.5) * stream.thickness * 0.4;
    const across = (rand() - 0.5) * stream.thickness * 0.5;
    const p = streamPoint(stream, t, along, across);
    const len = 200 + rand() * 1000;
    const thick = 1 + rand() * 1.2;
    const angle = angleBase + (rand() - 0.5) * 10;
    pieces.push(
      `<rect x="${(p.x - len / 2).toFixed(2)}" y="${(p.y - thick / 2).toFixed(2)}" width="${len.toFixed(2)}" height="${thick.toFixed(2)}" fill="${color}" opacity="${(opacity * (0.6 + rand() * 0.6)).toFixed(3)}" transform="rotate(${angle.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})" mask="url(#${maskId})"/>`
    );
  }

  return { defs, body: pieces.join("") };
}

function buildNebulaSpreadOverlay({ width, height, id, color, intensity, pattern }) {
  let defs = "";
  let body = "";
  const safeIntensity = clamp(intensity, 0, 1);
  const strong = 0.45;
  const mid = 0.18;
  const noiseSeed = hashString(`${id}-spread-mask`);
  const noiseRand = mulberry32(noiseSeed);
  const noiseId = `${id}-noise`;
  const maskId = `${id}-mask`;
  const freqX = (0.01 + noiseRand() * 0.018).toFixed(3);
  const freqY = (0.02 + noiseRand() * 0.02).toFixed(3);
  const alpha = (0.45 + noiseRand() * 0.25).toFixed(2);
  const blur = (14 + noiseRand() * 12).toFixed(1);

  if (pattern === "leftTop") {
    defs =
      `<radialGradient id="${id}" cx="20%" cy="25%" r="65%">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="${strong}"/>` +
      `<stop offset="55%" stop-color="${color}" stop-opacity="${mid}"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</radialGradient>`;
  } else if (pattern === "rightBottom") {
    defs =
      `<radialGradient id="${id}" cx="78%" cy="72%" r="68%">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="${strong}"/>` +
      `<stop offset="55%" stop-color="${color}" stop-opacity="${mid}"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</radialGradient>`;
  } else if (pattern === "leftBottom") {
    defs =
      `<radialGradient id="${id}" cx="22%" cy="78%" r="64%">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="${strong}"/>` +
      `<stop offset="55%" stop-color="${color}" stop-opacity="${mid}"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</radialGradient>`;
  } else if (pattern === "diagonal") {
    defs =
      `<linearGradient id="${id}" x1="0%" y1="0%" x2="100%" y2="100%">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
      `<stop offset="35%" stop-color="${color}" stop-opacity="${mid}"/>` +
      `<stop offset="70%" stop-color="${color}" stop-opacity="${strong}"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</linearGradient>`;
  } else {
    defs =
      `<radialGradient id="${id}" cx="50%" cy="45%" r="60%">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="${strong}"/>` +
      `<stop offset="60%" stop-color="${color}" stop-opacity="${mid}"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</radialGradient>`;
  }

  defs +=
    `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freqX} ${freqY}" numOctaves="2" seed="${noiseSeed % 10000}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha} 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="${blur}"/>` +
      `</filter>` +
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`;

  body = `<rect width="${width}" height="${height}" fill="url(#${id})" opacity="${safeIntensity.toFixed(3)}" mask="url(#${maskId})"/>`;
  return { defs, body };
}

function buildFilamentFieldOverlay({
  rand,
  width,
  height,
  filamentAt,
  flowField,
  color,
  opacity = 0.08,
  idPrefix,
  avoidRect,
  avoidMask,
}) {
  if (!filamentAt || !color || opacity <= 0) return { defs: "", body: "" };
  const dots = [];
  const count = Math.round((width * height) / (1080 * 1080) * 160);
  const isInAvoid = (x, y) => {
    if (avoidRect && x > avoidRect.x && x < avoidRect.x + avoidRect.w && y > avoidRect.y && y < avoidRect.y + avoidRect.h) {
      return true;
    }
    if (avoidMask && avoidMask(x, y) > 0.6) return true;
    return false;
  };

  for (let i = 0; i < count; i++) {
    const x = rand() * width;
    const y = rand() * height;
    if (isInAvoid(x, y)) continue;
    const v = clamp(filamentAt(x, y), 0, 1);
    if (v < 0.35) continue;
    let flowAngle = rand() * Math.PI * 2;
    let flowStrength = 0;
    if (flowField) {
      const flow = flowField(x, y);
      if (flow && flow.strength > 0.02) {
        flowStrength = flow.strength;
        flowAngle = Math.atan2(flow.dy, flow.dx) + (rand() - 0.5) * 0.35;
      }
    }
    const len = (40 + v * 140 + rand() * 60) * (0.85 + flowStrength * 0.6);
    const thick = 0.5 + v * 1.1;
    const angle = flowAngle;
    const op = opacity * (0.4 + v * 0.8);
    dots.push(
      `<rect x="${(x - len / 2).toFixed(2)}" y="${(y - thick / 2).toFixed(2)}" width="${len.toFixed(2)}" height="${thick.toFixed(2)}" fill="${color}" opacity="${op.toFixed(3)}" transform="rotate(${(angle * 57.2958).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})"/>`
    );
  }
  return { defs: "", body: dots.join("") };
}

function buildRidgeFieldOverlay({
  rand,
  width,
  height,
  ridgeAt,
  color,
  opacity = 0.06,
  idPrefix,
  avoidRect,
  avoidMask,
}) {
  if (!ridgeAt || !color || opacity <= 0) return { defs: "", body: "" };
  const strokes = [];
  const count = Math.round((width * height) / (1080 * 1080) * 110);
  const isInAvoid = (x, y) => {
    if (avoidRect && x > avoidRect.x && x < avoidRect.x + avoidRect.w && y > avoidRect.y && y < avoidRect.y + avoidRect.h) {
      return true;
    }
    if (avoidMask && avoidMask(x, y) > 0.6) return true;
    return false;
  };

  for (let i = 0; i < count; i++) {
    const x = rand() * width;
    const y = rand() * height;
    if (isInAvoid(x, y)) continue;
    const v = clamp(ridgeAt(x, y), 0, 1);
    if (v < 0.4) continue;
    const len = 30 + v * 90 + rand() * 40;
    const thick = 0.4 + v * 0.7;
    const angle = rand() * Math.PI * 2;
    const op = opacity * (0.35 + v * 0.9);
    strokes.push(
      `<rect x="${(x - len / 2).toFixed(2)}" y="${(y - thick / 2).toFixed(2)}" width="${len.toFixed(2)}" height="${thick.toFixed(2)}" fill="${color}" opacity="${op.toFixed(3)}" transform="rotate(${(angle * 57.2958).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)})"/>`
    );
  }
  return { defs: "", body: strokes.join("") };
}

function buildHeroRegionGlow({ id, x, y, r, color, opacity = 0.18 }) {
  if (!color || opacity <= 0) return { defs: "", body: "" };
  const defs =
    `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0%" stop-color="${color}" stop-opacity="${opacity.toFixed(3)}"/>` +
    `<stop offset="60%" stop-color="${color}" stop-opacity="${(opacity * 0.4).toFixed(3)}"/>` +
    `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
    `</radialGradient>`;
  const body = `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="url(#${id})"/>`;
  return { defs, body };
}

function buildNebulaLayerFbm({
  rand,
  width,
  height,
  idPrefix,
  color,
  opacity,
  modality,
  intensityScale = 1,
  spreadPattern = "center",
  scale = 1,
  noiseScale = 1,
  spreadScale = 1,
}) {
  const octaves = 3 + Math.floor(rand() * 3);
  const seed = Math.floor(rand() * 9000) + 100;
  const safeNoise = clamp(Number.isFinite(Number(noiseScale)) ? Number(noiseScale) : 1, 0.6, 1.8);
  const safeScale = clamp(Number.isFinite(Number(scale)) ? Number(scale) : 1, 0.6, 1.8);
  const safeSpread = clamp(Number.isFinite(Number(spreadScale)) ? Number(spreadScale) : 1, 0.6, 1.8);
  const freqScale = 1 / safeNoise;
  const flow =
    modality === "cardinal"
      ? [0.008 + rand() * 0.006, 0.02 + rand() * 0.015]
      : modality === "fixed"
      ? [0.014 + rand() * 0.01, 0.014 + rand() * 0.01]
      : [0.01 + rand() * 0.008, 0.018 + rand() * 0.012];
  const blur = (modality === "fixed" ? 18 : modality === "mutable" ? 28 : 22) * safeScale;
  const filterId = `nebulaNoise-${idPrefix}`;
  const maskId = `nebulaMask-${idPrefix}`;

  const edgeSide = spreadPattern === "rightBottom" || spreadPattern === "rightTop" ? "right" : "left";
  const nebulaWidth = Math.min(width, width * 0.58 * safeSpread);
  const nebulaX = edgeSide === "right" ? width - nebulaWidth : 0;
  const gradId = `${idPrefix}-nebulaEdge`;

  const defs = [
    nebulaNoiseFilter({
      id: filterId,
      baseFrequency: `${(flow[0] * freqScale).toFixed(3)} ${(flow[1] * freqScale).toFixed(3)}`,
      numOctaves: octaves,
      seed,
      blur,
    }),
    `<linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">` +
      (edgeSide === "left"
        ? `<stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>` +
          `<stop offset="45%" stop-color="${color}" stop-opacity="0.12"/>` +
          `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>`
        : `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
          `<stop offset="55%" stop-color="${color}" stop-opacity="0.12"/>` +
          `<stop offset="100%" stop-color="${color}" stop-opacity="0.35"/>`) +
      `</linearGradient>`,
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect x="${nebulaX.toFixed(2)}" width="${nebulaWidth.toFixed(2)}" height="${height}" fill="white" filter="url(#${filterId})"/>` +
      `</mask>`,
  ].join("");

  const baseOpacity = clamp(opacity * intensityScale * 0.6 * (0.85 + safeScale * 0.25), 0.01, 0.12);
  const baseBody = `<rect x="${nebulaX.toFixed(2)}" width="${nebulaWidth.toFixed(2)}" height="${height}" fill="url(#${gradId})" opacity="${baseOpacity.toFixed(3)}" mask="url(#${maskId})"/>`;
  return { defs, body: baseBody };
}

function buildFilamentNebulaLayer({ rand, width, height, stream, idPrefix, color, opacity = 0.08 }) {
  if (!stream) return { defs: "", body: "" };
  const angle = (Math.atan2(stream.y2 - stream.y1, stream.x2 - stream.x1) * 180) / Math.PI;
  const bandLength = stream.len * 1.08;
  const bandHeight = stream.thickness * 0.55;
  const cx = (stream.x1 + stream.x2) / 2;
  const cy = (stream.y1 + stream.y2) / 2;
  const noiseId = `${idPrefix}-filamentNoise`;
  const maskId = `${idPrefix}-filamentMask`;
  const freqX = (0.02 + rand() * 0.01).toFixed(3);
  const freqY = (0.08 + rand() * 0.04).toFixed(3);

  const defs = [
    `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freqX} ${freqY}" numOctaves="2" seed="${Math.floor(rand() * 9000)}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="alpha"/>` +
      `<feComponentTransfer in="alpha">` +
        `<feFuncA type="gamma" amplitude="1" exponent="1.6" offset="0"/>` +
      `</feComponentTransfer>` +
      `<feGaussianBlur in="alpha" stdDeviation="6"/>` +
      `</filter>`,
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`,
  ].join("");

  const body = `<rect x="${(cx - bandLength / 2).toFixed(2)}" y="${(cy - bandHeight / 2).toFixed(2)}" width="${bandLength.toFixed(2)}" height="${bandHeight.toFixed(2)}" fill="${color}" opacity="${clamp(opacity, 0.04, 0.14).toFixed(3)}" mask="url(#${maskId})" transform="rotate(${angle.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`;
  return { defs, body };
}

function buildNebulaFogOverlay({ width, height, id, color, opacity = 0.08, pattern = "center", idPrefix = "" }) {
  const positions = {
    center: { cx: "50%", cy: "45%" },
    leftTop: { cx: "28%", cy: "28%" },
    rightBottom: { cx: "70%", cy: "62%" },
    leftBottom: { cx: "30%", cy: "70%" },
    rightTop: { cx: "70%", cy: "30%" },
    diagonal: { cx: "38%", cy: "58%" },
  };
  const pos = positions[pattern] || positions.center;
  const gradId = `${idPrefix}fog-${id}`;
  const noiseSeed = hashString(`${gradId}-mask`);
  const noiseRand = mulberry32(noiseSeed);
  const noiseId = `${gradId}-noise`;
  const maskId = `${gradId}-mask`;
  const freqX = (0.012 + noiseRand() * 0.016).toFixed(3);
  const freqY = (0.02 + noiseRand() * 0.02).toFixed(3);
  const alpha = (0.42 + noiseRand() * 0.28).toFixed(2);
  const blur = (16 + noiseRand() * 12).toFixed(1);
  const defs = `<radialGradient id="${gradId}" cx="${pos.cx}" cy="${pos.cy}" r="48%">` +
    `<stop offset="0%" stop-color="${color}" stop-opacity="${opacity.toFixed(2)}"/>` +
    `<stop offset="65%" stop-color="${color}" stop-opacity="${(opacity * 0.4).toFixed(2)}"/>` +
    `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${freqX} ${freqY}" numOctaves="2" seed="${noiseSeed % 10000}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha} 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="${blur}"/>` +
      `</filter>` +
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`;
  const body = `<rect width="${width}" height="${height}" fill="url(#${gradId})" mask="url(#${maskId})"/>`;
  return { defs, body };
}

function buildMilkyStreamTint({ rand, width, height, stream, idPrefix, color, opacity = 0.06 }) {
  if (!stream) return { defs: "", body: "" };
  const angle = (Math.atan2(stream.y2 - stream.y1, stream.x2 - stream.x1) * 180) / Math.PI;
  const bandLength = stream.len * 1.05;
  const bandHeight = stream.thickness * 0.7;
  const cx = (stream.x1 + stream.x2) / 2;
  const cy = (stream.y1 + stream.y2) / 2;
  const gradId = `${idPrefix}-milkyTint`;
  const noiseId = `${idPrefix}-milkyTintNoise`;
  const maskId = `${idPrefix}-milkyTintMask`;

  const defs = [
    `<linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
      `<stop offset="40%" stop-color="${color}" stop-opacity="0.22"/>` +
      `<stop offset="65%" stop-color="${color}" stop-opacity="0.18"/>` +
      `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
      `</linearGradient>`,
    `<filter id="${noiseId}" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feTurbulence type="fractalNoise" baseFrequency="0.03 0.12" numOctaves="2" seed="${Math.floor(rand() * 9000)}" result="noise"/>` +
      `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0" result="alpha"/>` +
      `<feGaussianBlur in="alpha" stdDeviation="9"/>` +
      `</filter>`,
    `<mask id="${maskId}" maskUnits="userSpaceOnUse">` +
      `<rect width="${width}" height="${height}" fill="white" filter="url(#${noiseId})"/>` +
      `</mask>`,
  ].join("");

  const body = `<rect x="${(cx - bandLength / 2).toFixed(2)}" y="${(cy - bandHeight / 2).toFixed(2)}" width="${bandLength.toFixed(2)}" height="${bandHeight.toFixed(2)}" fill="url(#${gradId})" opacity="${clamp(opacity, 0.03, 0.12).toFixed(3)}" mask="url(#${maskId})" transform="rotate(${angle.toFixed(2)} ${cx.toFixed(2)} ${cy.toFixed(2)})"/>`;

  return { defs, body };
}

module.exports = {
  nebulaNoiseFilter,
  buildAtmosphereTintLayer,
  buildGasCloudLayer,
  buildFarGasLayer,
  buildFilamentLayer,
  buildNebulaSpreadOverlay,
  buildFilamentFieldOverlay,
  buildRidgeFieldOverlay,
  buildHeroRegionGlow,
  buildNebulaLayerFbm,
  buildFilamentNebulaLayer,
  buildNebulaFogOverlay,
  buildMilkyStreamTint,
};
