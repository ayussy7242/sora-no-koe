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
  const glowFarGradId = `moonGlowFarGrad-${id || "base"}`;
  const glowFilterWideId = `moonGlowBlur-${id || "base"}`;
  const glowFilterEdgeId = `moonGlowBlurEdge-${id || "base"}`;
  const glowFilterFarId = `moonGlowBlurFar-${id || "base"}`;
  const glowMaskWideId = `moonGlowMask-${id || "base"}`;
  const glowMaskEdgeId = `moonGlowMaskEdge-${id || "base"}`;
  const glowMaskFarId = `moonGlowMaskFar-${id || "base"}`;
  const glowClipOuterId = `moonGlowClip-${id || "base"}`;
  const glowClipEdgeId = `moonGlowClipEdge-${id || "base"}`;
  const glowClipFarId = `moonGlowClipFar-${id || "base"}`;

  const illumBoost = clamp((illum - 0.6) / 0.4, 0, 1);
  const surfaceCore = clamp(0.88 + illum * 0.10 + 0.04 * illumBoost, 0.86, 1);
  const surfaceMid = clamp(0.78 + illum * 0.08 + 0.03 * illumBoost, 0.7, 0.98);
  const surfaceEdge = clamp(0.68 + illum * 0.06 + 0.02 * illumBoost, 0.6, 0.95);
  const illumBoostWide = Math.pow(illumBoost, 1.3);
  const glowBoostInner = 1 + 0.8 * illumBoost;
  const glowBoostOuter = 1 + 0.6 * illumBoost;
  const glowBoostFar = 1 + 0.5 * illumBoost;
  const glowEdgeStops = {
    a: clamp(0.34 * glowBoostInner, 0, 0.75),
    b: clamp(0.18 * glowBoostInner, 0, 0.55),
  };
  const glowWideStops = {
    a: clamp(0.18 * glowBoostOuter, 0, 0.55),
    b: clamp(0.10 * glowBoostOuter, 0, 0.4),
    c: clamp(0.05 * glowBoostOuter, 0, 0.28),
  };
  const glowFarStops = {
    a: clamp(0.08 * glowBoostFar, 0, 0.35),
    b: clamp(0.04 * glowBoostFar, 0, 0.22),
  };

  const showDarkDisc = forceDark || illum <= 0.01;
  const showNewMoonRim = withRim && showDarkDisc;

  const glowSpreadWide = Math.max(0.6, r * (0.07 + 0.05 * illumBoost + 0.03 * illumBoostWide));
  const glowBlurWide = Math.max(0.6, r * (0.12 + 0.08 * illumBoost + 0.05 * illumBoostWide));
  const glowSpreadEdge = Math.max(0.4, r * (0.012 + 0.008 * illumBoost));
  const glowBlurEdge = Math.max(0.4, r * (0.014 + 0.01 * illumBoost));
  const glowSpreadFar = Math.max(0.8, r * (0.11 + 0.07 * illumBoost + 0.05 * illumBoostWide));
  const glowBlurFar = Math.max(0.8, r * (0.18 + 0.1 * illumBoost + 0.08 * illumBoostWide));
  const glowOuterCap = r * (1.30 + 0.10 * illumBoost + 0.08 * illumBoostWide);
  const glowEdgeCap = r * (1.06 + 0.03 * illumBoost);
  const glowFarCap = r * (1.60 + 0.16 * illumBoost + 0.20 * illumBoostWide);
  const glowPad = Math.max(
    glowBlurWide * 3 + glowSpreadWide * 2,
    glowBlurEdge * 3 + glowSpreadEdge * 2,
    glowBlurFar * 3 + glowSpreadFar * 2
  );

  const defs = [
    `<radialGradient id="${gradId}" cx="42%" cy="38%" r="65%">`,
    `<stop offset="0%" stop-color="#fffdf7" stop-opacity="${surfaceCore.toFixed(3)}"/>`,
    `<stop offset="70%" stop-color="#f3f0e6" stop-opacity="${surfaceMid.toFixed(3)}"/>`,
    `<stop offset="100%" stop-color="#e8eef7" stop-opacity="${surfaceEdge.toFixed(3)}"/>`,
    `</radialGradient>`,
    `<radialGradient id="${glowGradId}" cx="50%" cy="50%" r="80%">`,
    `<stop offset="0%" stop-color="rgb(190,225,255)" stop-opacity="${glowWideStops.a.toFixed(3)}"/>`,
    `<stop offset="35%" stop-color="rgb(190,225,255)" stop-opacity="${glowWideStops.b.toFixed(3)}"/>`,
    `<stop offset="70%" stop-color="rgb(170,210,255)" stop-opacity="${glowWideStops.c.toFixed(3)}"/>`,
    `<stop offset="100%" stop-color="rgb(120,140,200)" stop-opacity="0.00"/>`,
    `</radialGradient>`,
    `<radialGradient id="${glowEdgeGradId}" cx="50%" cy="50%" r="65%">`,
    `<stop offset="0%" stop-color="rgb(235,245,255)" stop-opacity="${glowEdgeStops.a.toFixed(3)}"/>`,
    `<stop offset="55%" stop-color="rgb(235,245,255)" stop-opacity="${glowEdgeStops.b.toFixed(3)}"/>`,
    `<stop offset="100%" stop-color="rgb(170,210,245)" stop-opacity="0.00"/>`,
    `</radialGradient>`,
    `<radialGradient id="${glowFarGradId}" cx="50%" cy="50%" r="90%">`,
    `<stop offset="0%" stop-color="rgb(170,210,255)" stop-opacity="${glowFarStops.a.toFixed(3)}"/>`,
    `<stop offset="60%" stop-color="rgb(170,210,255)" stop-opacity="${glowFarStops.b.toFixed(3)}"/>`,
    `<stop offset="100%" stop-color="rgb(140,180,230)" stop-opacity="0.00"/>`,
    `</radialGradient>`,
    `<filter id="${glowFilterWideId}" x="-80%" y="-80%" width="260%" height="260%">`,
    `<feMorphology in="SourceGraphic" operator="dilate" radius="${glowSpreadWide.toFixed(2)}" result="dilate"/>`,
    `<feGaussianBlur in="dilate" stdDeviation="${glowBlurWide.toFixed(2)}" result="blur"/>`,
    `</filter>`,
    `<filter id="${glowFilterEdgeId}" x="-40%" y="-40%" width="180%" height="180%">`,
    `<feMorphology in="SourceGraphic" operator="dilate" radius="${glowSpreadEdge.toFixed(2)}" result="dilate"/>`,
    `<feGaussianBlur in="dilate" stdDeviation="${glowBlurEdge.toFixed(2)}" result="blur"/>`,
    `</filter>`,
    `<filter id="${glowFilterFarId}" x="-120%" y="-120%" width="340%" height="340%">`,
    `<feMorphology in="SourceGraphic" operator="dilate" radius="${glowSpreadFar.toFixed(2)}" result="dilate"/>`,
    `<feGaussianBlur in="dilate" stdDeviation="${glowBlurFar.toFixed(2)}" result="blur"/>`,
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
      `<clipPath id="${glowClipFarId}">`,
      `<circle cx="${r}" cy="${r}" r="${glowFarCap.toFixed(2)}"/>`,
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
      `<mask id="${glowMaskFarId}" maskUnits="userSpaceOnUse" x="${(-glowPad).toFixed(2)}" y="${(-glowPad).toFixed(2)}" width="${(r * 2 + glowPad * 2).toFixed(2)}" height="${(r * 2 + glowPad * 2).toFixed(2)}">`,
      `<rect x="${(-glowPad).toFixed(2)}" y="${(-glowPad).toFixed(2)}" width="${(r * 2 + glowPad * 2).toFixed(2)}" height="${(r * 2 + glowPad * 2).toFixed(2)}" fill="black"/>`,
      `<path d="${geometry.litPath}" fill="white" filter="url(#${glowFilterFarId})"/>`,
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
  const glowFarPath = geometry?.litPath
    ? `<circle cx="${r}" cy="${r}" r="${glowFarCap.toFixed(2)}" fill="url(#${glowFarGradId})" mask="url(#${glowMaskFarId})" clip-path="url(#${glowClipFarId})"/>`
    : "";

  return {
    defs,
    body: showDarkDisc
      ? [darkDisc, rim].filter(Boolean)
      : [darkDisc, glowFarPath, glowWidePath, glowEdgePath, litPath].filter(Boolean),
  };
}

module.exports = {
  buildMoonAppearance,
};
