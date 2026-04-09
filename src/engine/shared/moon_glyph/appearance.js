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
  const glowGradId = `moonGlowGrad-${id || "base"}`;
  const glowEdgeGradId = `moonGlowEdgeGrad-${id || "base"}`;
  const glowFilterWideId = `moonGlowBlur-${id || "base"}`;
  const glowFilterEdgeId = `moonGlowBlurEdge-${id || "base"}`;
  const glowMaskWideId = `moonGlowMask-${id || "base"}`;
  const glowMaskEdgeId = `moonGlowMaskEdge-${id || "base"}`;
  const glowClipOuterId = `moonGlowClip-${id || "base"}`;
  const glowClipEdgeId = `moonGlowClipEdge-${id || "base"}`;

  const surfaceCore = clamp(0.86 + illum * 0.12, 0.86, 0.98);
  const surfaceMid = clamp(surfaceCore - 0.06, 0.72, 0.92);
  const surfaceEdge = clamp(surfaceMid - 0.08, 0.6, 0.86);

  const showDarkDisc = forceDark || illum <= 0.01;
  const showNewMoonRim = withRim && showDarkDisc;

  const glowSpreadWide = Math.max(0.5, r * 0.07);
  const glowBlurWide = Math.max(0.5, r * 0.11);
  const glowSpreadEdge = Math.max(0.3, r * 0.01);
  const glowBlurEdge = Math.max(0.3, r * 0.012);
  const glowOuterCap = r * 1.22;
  const glowEdgeCap = r * 1.04;
  const glowPad = Math.max(
    glowBlurWide * 3 + glowSpreadWide * 2,
    glowBlurEdge * 3 + glowSpreadEdge * 2
  );

  const defs = [
    `<radialGradient id="${gradId}" cx="42%" cy="38%" r="65%">`,
    `<stop offset="0%" stop-color="${lightColor}" stop-opacity="${surfaceCore.toFixed(3)}"/>`,
    `<stop offset="70%" stop-color="${lightColor}" stop-opacity="${surfaceMid.toFixed(3)}"/>`,
    `<stop offset="100%" stop-color="${lightColor}" stop-opacity="${surfaceEdge.toFixed(3)}"/>`,
    `</radialGradient>`,
    `<radialGradient id="${glowGradId}" cx="50%" cy="50%" r="80%">`,
    `<stop offset="0%" stop-color="rgb(210,245,255)" stop-opacity="0.20"/>`,
    `<stop offset="35%" stop-color="rgb(150,220,235)" stop-opacity="0.16"/>`,
    `<stop offset="70%" stop-color="rgb(120,170,220)" stop-opacity="0.08"/>`,
    `<stop offset="100%" stop-color="rgb(120,140,200)" stop-opacity="0.00"/>`,
    `</radialGradient>`,
    `<radialGradient id="${glowEdgeGradId}" cx="50%" cy="50%" r="65%">`,
    `<stop offset="0%" stop-color="rgb(245,252,255)" stop-opacity="0.38"/>`,
    `<stop offset="55%" stop-color="rgb(200,240,255)" stop-opacity="0.18"/>`,
    `<stop offset="100%" stop-color="rgb(170,210,245)" stop-opacity="0.00"/>`,
    `</radialGradient>`,
    `<filter id="${glowFilterWideId}" x="-80%" y="-80%" width="260%" height="260%">`,
    `<feMorphology in="SourceGraphic" operator="dilate" radius="${glowSpreadWide.toFixed(2)}" result="dilate"/>`,
    `<feGaussianBlur in="dilate" stdDeviation="${glowBlurWide.toFixed(2)}" result="blur"/>`,
    `</filter>`,
    `<filter id="${glowFilterEdgeId}" x="-40%" y="-40%" width="180%" height="180%">`,
    `<feMorphology in="SourceGraphic" operator="dilate" radius="${glowSpreadEdge.toFixed(2)}" result="dilate"/>`,
    `<feGaussianBlur in="dilate" stdDeviation="${glowBlurEdge.toFixed(2)}" result="blur"/>`,
    `</filter>`,
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

  const glowDefs = geometry?.litPath
    ? [
      `<clipPath id="${glowClipOuterId}">`,
      `<circle cx="${r}" cy="${r}" r="${glowOuterCap.toFixed(2)}"/>`,
      `</clipPath>`,
      `<clipPath id="${glowClipEdgeId}">`,
      `<circle cx="${r}" cy="${r}" r="${glowEdgeCap.toFixed(2)}"/>`,
      `</clipPath>`,
      `<mask id="${glowMaskWideId}" maskUnits="userSpaceOnUse" x="${(-glowPad).toFixed(2)}" y="${(-glowPad).toFixed(2)}" width="${(r * 2 + glowPad * 2).toFixed(2)}" height="${(r * 2 + glowPad * 2).toFixed(2)}">`,
      `<rect x="${(-glowPad).toFixed(2)}" y="${(-glowPad).toFixed(2)}" width="${(r * 2 + glowPad * 2).toFixed(2)}" height="${(r * 2 + glowPad * 2).toFixed(2)}" fill="black"/>`,
      `<path d="${geometry.litPath}" fill="white" filter="url(#${glowFilterWideId})"/>`,
      `<path d="${geometry.litPath}" fill="black"/>`,
      `</mask>`,
      `<mask id="${glowMaskEdgeId}" maskUnits="userSpaceOnUse" x="${(-glowPad).toFixed(2)}" y="${(-glowPad).toFixed(2)}" width="${(r * 2 + glowPad * 2).toFixed(2)}" height="${(r * 2 + glowPad * 2).toFixed(2)}">`,
      `<rect x="${(-glowPad).toFixed(2)}" y="${(-glowPad).toFixed(2)}" width="${(r * 2 + glowPad * 2).toFixed(2)}" height="${(r * 2 + glowPad * 2).toFixed(2)}" fill="black"/>`,
      `<path d="${geometry.litPath}" fill="white" filter="url(#${glowFilterEdgeId})"/>`,
      `<path d="${geometry.litPath}" fill="black"/>`,
      `</mask>`,
    ].join("")
    : "";

  if (glowDefs) defs.push(glowDefs);

  const glowWidePath = geometry?.litPath
    ? `<circle cx="${r}" cy="${r}" r="${glowOuterCap.toFixed(2)}" fill="url(#${glowGradId})" mask="url(#${glowMaskWideId})" clip-path="url(#${glowClipOuterId})"/>`
    : "";
  const glowEdgePath = geometry?.litPath
    ? `<circle cx="${r}" cy="${r}" r="${glowEdgeCap.toFixed(2)}" fill="url(#${glowEdgeGradId})" mask="url(#${glowMaskEdgeId})" clip-path="url(#${glowClipEdgeId})"/>`
    : "";

  return {
    defs,
    body: showDarkDisc
      ? [darkDisc, rim].filter(Boolean)
      : [darkDisc, glowWidePath, glowEdgePath, litPath].filter(Boolean),
  };
}

module.exports = {
  buildMoonAppearance,
};
