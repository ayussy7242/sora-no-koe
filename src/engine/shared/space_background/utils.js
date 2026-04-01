"use strict";

const { clamp } = require("../../../utils/data/math");

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  const v = clamp(t, 0, 1);
  return v * v * (3 - 2 * v);
}

function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function mulberry32(seed) {
  let t = Number(seed) || 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(x, y, seed) {
  const h = Math.sin((x * 127.1 + y * 311.7 + seed * 0.13) % 43758.5453) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise2D(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoothstep(xf);
  const v = smoothstep(yf);

  const n00 = hash2D(xi, yi, seed);
  const n10 = hash2D(xi + 1, yi, seed);
  const n01 = hash2D(xi, yi + 1, seed);
  const n11 = hash2D(xi + 1, yi + 1, seed);

  const x1 = lerp(n00, n10, u);
  const x2 = lerp(n01, n11, u);
  return lerp(x1, x2, v);
}

function fbm2D(x, y, seed, octaves = 4) {
  let value = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise2D(x * frequency, y * frequency, seed + i * 17) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return norm > 0 ? value / norm : value;
}

function ridgedFbm2D(x, y, seed, octaves = 4) {
  let value = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2D(x * frequency, y * frequency, seed + i * 19);
    const ridged = 1 - Math.abs(n * 2 - 1);
    value += ridged * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return norm > 0 ? value / norm : value;
}

function curlNoise2D(x, y, seed, eps = 0.001) {
  const n1 = valueNoise2D(x, y + eps, seed);
  const n2 = valueNoise2D(x, y - eps, seed);
  const a = (n1 - n2) / (2 * eps);
  const n3 = valueNoise2D(x + eps, y, seed);
  const n4 = valueNoise2D(x - eps, y, seed);
  const b = (n3 - n4) / (2 * eps);
  return { x: a, y: -b };
}

function isSpaceDebug(env = process.env) {
  const raw = String(env?.SPACE_BG_DEBUG || env?.DEBUG_SPACE_BG || "").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

module.exports = {
  clamp,
  lerp,
  smoothstep,
  hashString,
  mulberry32,
  hash2D,
  valueNoise2D,
  fbm2D,
  ridgedFbm2D,
  curlNoise2D,
  isSpaceDebug,
};
