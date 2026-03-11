"use strict";

const { clamp } = require("./shared/space_background/utils");

function hexToRgb(hex) {
  const raw = String(hex || "").replace("#", "").trim();
  if (!raw) return { r: 255, g: 255, b: 255 };
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16);
    const g = parseInt(raw[1] + raw[1], 16);
    const b = parseInt(raw[2] + raw[2], 16);
    return { r, g, b };
  }
  if (raw.length >= 6) {
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return { r, g, b };
  }
  return { r: 255, g: 255, b: 255 };
}

function rgbToHex({ r, g, b }) {
  const toHex = (v) => {
    const out = Math.round(clamp(v, 0, 255)).toString(16).toUpperCase();
    return out.length === 1 ? `0${out}` : out;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixColor(a, b, t) {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  const k = clamp(Number(t) || 0, 0, 1);
  return rgbToHex({
    r: c1.r + (c2.r - c1.r) * k,
    g: c1.g + (c2.g - c1.g) * k,
    b: c1.b + (c2.b - c1.b) * k,
  });
}

module.exports = {
  hexToRgb,
  rgbToHex,
  mixColor,
};
