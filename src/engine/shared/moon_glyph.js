"use strict";

const { clamp } = require("../../utils/data/math");
const { BACKGROUND_COLORS } = require("./space_background/constants");

function buildMoonPhaseGlyph({
  id,
  x,
  y,
  size = 160,
  illumination = 0.5,
  waxing = true,
  lightColor = "rgba(245,245,240,0.95)",
  darkColor = BACKGROUND_COLORS?.bgDeep || "#050816",
  strokeColor = null,
  forceDark = false,
} = {}) {
  const r = size / 2;
  const illum = clamp(Number(illumination), 0, 1);

  const glowStrong = clamp(0.04 + illum * 0.08, 0.03, 0.14);
  const glowWeak = clamp(0.025 + illum * 0.05, 0.018, 0.1);

  const surfaceCore = clamp(0.86 + illum * 0.12, 0.86, 0.98);
  const surfaceMid = clamp(surfaceCore - 0.06, 0.72, 0.92);
  const surfaceEdge = clamp(surfaceMid - 0.08, 0.6, 0.86);

  const circleArea = Math.PI * r * r;
  const overlapArea = (dist, r1, r2) => {
    const d = Math.max(0, dist);
    const rr1 = Math.max(0, r1);
    const rr2 = Math.max(0, r2);
    if (d >= rr1 + rr2) return 0;
    if (d <= Math.abs(rr1 - rr2)) {
      const minR = Math.min(rr1, rr2);
      return Math.PI * minR * minR;
    }
    const r1Sq = rr1 * rr1;
    const r2Sq = rr2 * rr2;
    const alpha = Math.acos((d * d + r1Sq - r2Sq) / (2 * d * rr1));
    const beta = Math.acos((d * d + r2Sq - r1Sq) / (2 * d * rr2));
    const area1 = r1Sq * alpha;
    const area2 = r2Sq * beta;
    const area3 = 0.5 * Math.sqrt(
      Math.max(0, (-d + rr1 + rr2) * (d + rr1 - rr2) * (d - rr1 + rr2) * (d + rr1 + rr2))
    );
    return area1 + area2 - area3;
  };
  const offsetForIllumination = (target, shadowRadius) => {
    const t = clamp(Number(target), 0, 1);
    let lo = 0;
    let hi = r + shadowRadius;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      const bright = 1 - overlapArea(mid, r, shadowRadius) / circleArea;
      if (bright < t) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };

  const showShadow = illum < 0.995;
  const showDarkDisc = forceDark || illum <= 0.01;
  const showNewMoonRim = showDarkDisc;
  const halfRange = 0.07;
  const halfBlendRaw = 1 - Math.min(1, Math.abs(illum - 0.5) / halfRange);
  const halfBlend = halfBlendRaw * halfBlendRaw * (3 - 2 * halfBlendRaw); // smoothstep
  const hugeRadius = r * 5;
  const shadowRadius = r + (hugeRadius - r) * halfBlend;
  const dx = offsetForIllumination(illum, shadowRadius);
  const shift = waxing ? -dx : dx;

  const stroke = strokeColor ? ` stroke="${strokeColor}" stroke-width="1"` : "";
  const blurId = `moonSoft-${id || "base"}`;
  const glowId = `moonGlow-${id || "base"}`;
  const gradId = `moonGrad-${id || "base"}`;
  const clipId = `moonClip-${id || "base"}`;
  const litMaskId = `moonLit-${id || "base"}`;

  return [
    `<g transform="translate(${x} ${y})">`,
    `<defs>`,
    `<clipPath id="${clipId}"><circle cx="${r}" cy="${r}" r="${r}"/></clipPath>`,
    `<mask id="${litMaskId}">`,
    `<rect width="100%" height="100%" fill="black"/>`,
    `<circle cx="${r}" cy="${r}" r="${r}" fill="white"/>`,
    showShadow
      ? `<circle cx="${r + shift}" cy="${r}" r="${shadowRadius.toFixed(2)}" fill="black"/>`
      : "",
    `</mask>`,
    `<radialGradient id="${gradId}" cx="42%" cy="38%" r="65%">`,
    `<stop offset="0%" stop-color="${lightColor}" stop-opacity="${surfaceCore.toFixed(3)}"/>`,
    `<stop offset="70%" stop-color="${lightColor}" stop-opacity="${surfaceMid.toFixed(3)}"/>`,
    `<stop offset="100%" stop-color="${lightColor}" stop-opacity="${surfaceEdge.toFixed(3)}"/>`,
    `</radialGradient>`,
    `<filter id="${blurId}" x="-10%" y="-10%" width="120%" height="120%">`,
    `<feGaussianBlur stdDeviation="0.3"/>`,
    `</filter>`,
    `<filter id="${glowId}" x="-50%" y="-50%" width="200%" height="200%">`,
    `<feGaussianBlur stdDeviation="8"/>`,
    `</filter>`,
    `</defs>`,
    // soft halo around the whole disc (screenshot-like)
    `<circle cx="${r}" cy="${r}" r="${(r * 1.152).toFixed(2)}" fill="${lightColor}" opacity="${glowStrong.toFixed(3)}" filter="url(#${glowId})"/>`,
    `<circle cx="${r}" cy="${r}" r="${(r * 1.35).toFixed(2)}" fill="${lightColor}" opacity="${glowWeak.toFixed(3)}" filter="url(#${glowId})"/>`,
    showDarkDisc
      ? [
        `<circle cx="${r}" cy="${r}" r="${r}" fill="${darkColor}"/>`,
        showNewMoonRim
          ? [
            `<circle cx="${r}" cy="${r}" r="${(r * 0.988).toFixed(2)}" fill="none" stroke="${lightColor}" stroke-opacity="0.2" stroke-width="${(r * 0.01).toFixed(2)}"/>`,
            `<circle cx="${r}" cy="${r}" r="${(r * 0.992).toFixed(2)}" fill="none" stroke="${lightColor}" stroke-opacity="0.12" stroke-width="${(r * 0.02).toFixed(2)}" filter="url(#${glowId})"/>`,
          ].join("")
          : "",
      ].join("")
      : [
        `<g filter="url(#${blurId})">`,
        `<circle cx="${r}" cy="${r}" r="${r}" fill="${darkColor}"/>`,
        `<circle cx="${r}" cy="${r}" r="${r}" fill="url(#${gradId})"${stroke} mask="url(#${litMaskId})"/>`,
        `</g>`,
      ].join(""),
    `</g>`,
  ].join("");
}

module.exports = {
  buildMoonPhaseGlyph,
};
