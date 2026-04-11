"use strict";

const { clamp } = require("./utils");

function resolveUnderlayPreset(input) {
  if (!input) return null;
  if (typeof input === "object") return input;
  return null;
}

function buildUnderlayLayer({
  width,
  height,
  preset,
  idPrefix = "underlay",
  center = null,
  color = null,
} = {}) {
  const resolved = resolveUnderlayPreset(preset);
  if (!resolved || resolved.enabled === false) return { defs: "", body: "" };
  if (!width || !height) return { defs: "", body: "" };

  const minSide = Math.min(width, height);
  const opacity = clamp(Number(resolved.opacity ?? 0.2), 0, 0.6);
  const radius = clamp(Number(resolved.radius ?? 0.7), 0.2, 1.2);
  const spread = clamp(Number(resolved.spread ?? 1.5), 0.8, 2.4);
  const blur = Math.max(0, Number(resolved.blur ?? 56));
  const centerOpacity = clamp(Number(resolved.centerOpacity ?? 0.85), 0.2, 1);
  const midOpacity = clamp(Number(resolved.midOpacity ?? 0.25), 0.05, 0.6);
  const baseColor = String(resolved.color || color || "#0B0E1A");
  const cx = Number.isFinite(Number(center?.x)) ? Number(center.x) : width / 2;
  const cy = Number.isFinite(Number(center?.y)) ? Number(center.y) : height / 2;

  const baseR = minSide * radius;
  const r = baseR * spread;
  const aspectScale = Number.isFinite(Number(resolved.aspectScale))
    ? Number(resolved.aspectScale)
    : Math.max(1, width / height);
  const rx = r * clamp(aspectScale, 1, 1.6);
  const ry = r;
  const gradId = `${idPrefix}-grad`;
  const filterId = `${idPrefix}-blur`;
  const defs = [
    `<radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">`,
    `<stop offset="0%" stop-color="${baseColor}" stop-opacity="${centerOpacity.toFixed(3)}"/>`,
    `<stop offset="55%" stop-color="${baseColor}" stop-opacity="${midOpacity.toFixed(3)}"/>`,
    `<stop offset="100%" stop-color="${baseColor}" stop-opacity="0"/>`,
    `</radialGradient>`,
    blur > 0
      ? `<filter id="${filterId}" x="-60%" y="-60%" width="220%" height="220%">` +
        `<feGaussianBlur stdDeviation="${blur}"/>` +
        `</filter>`
      : "",
  ].join("");
  const filterAttr = blur > 0 ? ` filter="url(#${filterId})"` : "";
  const body = `<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" fill="url(#${gradId})" opacity="${opacity.toFixed(3)}"${filterAttr}/>`;

  return { defs, body };
}

module.exports = {
  buildUnderlayLayer,
  resolveUnderlayPreset,
};
