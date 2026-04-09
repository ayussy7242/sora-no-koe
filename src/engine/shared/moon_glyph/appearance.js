"use strict";

const { clamp } = require("../../../utils/data/math");

function buildMoonAppearance({
  id,
  geometry,
  lightColor,
  darkColor,
  strokeColor,
  forceDark = false,
  withRim = true,
} = {}) {
  const r = geometry?.r || 0;
  const illum = geometry?.illum ?? 0.5;
  const stroke = strokeColor ? ` stroke="${strokeColor}" stroke-width="1"` : "";
  const gradId = `moonGrad-${id || "base"}`;

  const surfaceCore = clamp(0.86 + illum * 0.12, 0.86, 0.98);
  const surfaceMid = clamp(surfaceCore - 0.06, 0.72, 0.92);
  const surfaceEdge = clamp(surfaceMid - 0.08, 0.6, 0.86);

  const showDarkDisc = forceDark || illum <= 0.01;
  const showNewMoonRim = withRim && showDarkDisc;

  const defs = [
    `<radialGradient id="${gradId}" cx="42%" cy="38%" r="65%">`,
    `<stop offset="0%" stop-color="${lightColor}" stop-opacity="${surfaceCore.toFixed(3)}"/>`,
    `<stop offset="70%" stop-color="${lightColor}" stop-opacity="${surfaceMid.toFixed(3)}"/>`,
    `<stop offset="100%" stop-color="${lightColor}" stop-opacity="${surfaceEdge.toFixed(3)}"/>`,
    `</radialGradient>`,
  ];

  const darkDisc = `<circle cx="${r}" cy="${r}" r="${r}" fill="${darkColor}"/>`;
  const rim = showNewMoonRim
    ? [
      `<circle cx="${r}" cy="${r}" r="${(r * 0.988).toFixed(2)}" fill="none" stroke="${lightColor}" stroke-opacity="0.2" stroke-width="${(r * 0.01).toFixed(2)}"/>`,
      `<circle cx="${r}" cy="${r}" r="${(r * 0.992).toFixed(2)}" fill="none" stroke="${lightColor}" stroke-opacity="0.12" stroke-width="${(r * 0.02).toFixed(2)}"/>`,
    ].join("")
    : "";

  const litPath = geometry?.litPath
    ? `<path d="${geometry.litPath}" fill="url(#${gradId})"${stroke}/>`
    : "";

  return {
    defs,
    body: showDarkDisc
      ? [darkDisc, rim].filter(Boolean)
      : [darkDisc, litPath].filter(Boolean),
  };
}

module.exports = {
  buildMoonAppearance,
};
