"use strict";

const { normalizeAspectType } = require("../../../../domain/aspect/canonical");
const { clamp, hashString, mulberry32 } = require("../utils");
const { BACKGROUND_COLORS } = require("../constants");

function buildDailyColorOverlay({
  width,
  height,
  primary,
  secondary,
  patternIndex,
  radius = 0.2,
  opacityPrimary = 0.22,
  opacitySecondary = 0.12,
  idPrefix = "space",
}) {
  const patterns = [
    { cx: "18%", cy: "22%" },
    { cx: "82%", cy: "18%" },
    { cx: "20%", cy: "78%" },
    { cx: "78%", cy: "72%" },
  ];
  const pick = patterns[patternIndex % patterns.length];
  const r = clamp(radius, 0.16, 0.26);
  const idP = `${idPrefix}-dailyGlowP`;
  const idS = `${idPrefix}-dailyGlowS`;

  const defs =
    `<radialGradient id="${idP}" cx="${pick.cx}" cy="${pick.cy}" r="${Math.round(r * 100)}%">` +
    `<stop offset="0%" stop-color="${primary}" stop-opacity="0.9"/>` +
    `<stop offset="55%" stop-color="${primary}" stop-opacity="0.35"/>` +
    `<stop offset="100%" stop-color="${primary}" stop-opacity="0"/>` +
    `</radialGradient>` +
    `<radialGradient id="${idS}" cx="${pick.cx}" cy="${pick.cy}" r="${Math.round((r + 0.12) * 100)}%">` +
    `<stop offset="0%" stop-color="${secondary}" stop-opacity="0.65"/>` +
    `<stop offset="70%" stop-color="${secondary}" stop-opacity="0.25"/>` +
    `<stop offset="100%" stop-color="${secondary}" stop-opacity="0"/>` +
    `</radialGradient>`;

  const body = [
    `<rect width="${width}" height="${height}" fill="url(#${idP})" opacity="${clamp(opacityPrimary, 0.12, 0.3).toFixed(3)}"/>`,
    `<rect width="${width}" height="${height}" fill="url(#${idS})" opacity="${clamp(opacitySecondary, 0.08, 0.22).toFixed(3)}"/>`,
  ].join("");

  return { defs, body };
}

function buildAspectGlow({ rand, width, height, palette, aspect, orb, strengthScale = 1, idPrefix = "space" }) {
  if (!aspect) return { defs: "", body: "" };
  const type = normalizeAspectType(aspect?.type || aspect?.aspect || "", aspect?.aspect_deg);
  const orbVal = Number(orb || 0);
  let strength = 0.18;
  if (orbVal <= 0.5) strength = 0.55;
  else if (orbVal <= 1.2) strength = 0.35;
  else if (orbVal <= 2.5) strength = 0.22;
  const boost = 1.35;
  strength = clamp(strength * strengthScale * boost, 0.08, 0.7);
  const color = palette.glow || BACKGROUND_COLORS.accentBlue;

  const defs = [];
  let body = "";

  if (type === "conjunction") {
    const glowId = `${idPrefix}-aspectGlow`;
    defs.push(
      `<radialGradient id="${glowId}" cx="50%" cy="45%" r="35%">` +
        `<stop offset="0%" stop-color="${color}" stop-opacity="0.45"/>` +
        `<stop offset="70%" stop-color="${color}" stop-opacity="0.12"/>` +
        `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
        `</radialGradient>`
    );
    body = `<circle cx="${width * 0.5}" cy="${height * 0.42}" r="240" fill="url(#${glowId})" opacity="${strength}"/>`;
  } else if (type === "opposition") {
    const oppId = `${idPrefix}-aspectOpp`;
    defs.push(
      `<radialGradient id="${oppId}" cx="50%" cy="50%" r="55%">` +
        `<stop offset="0%" stop-color="${color}" stop-opacity="0.32"/>` +
        `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
        `</radialGradient>`
    );
    body =
      `<circle cx="${width * 0.25}" cy="${height * 0.52}" r="180" fill="url(#${oppId})" opacity="${strength}"/>` +
      `<circle cx="${width * 0.75}" cy="${height * 0.52}" r="180" fill="url(#${oppId})" opacity="${strength}"/>`;
  } else if (type === "square" || type === "semi_square_45" || type === "sesqui_square_135") {
    const squareId = `${idPrefix}-aspectSquare`;
    defs.push(
      `<linearGradient id="${squareId}" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0%" stop-color="${color}" stop-opacity="0"/>` +
        `<stop offset="50%" stop-color="${color}" stop-opacity="0.25"/>` +
        `<stop offset="100%" stop-color="${color}" stop-opacity="0"/>` +
        `</linearGradient>`
    );
    body =
      `<line x1="${width * 0.2}" y1="${height * 0.7}" x2="${width * 0.8}" y2="${height * 0.3}" stroke="url(#${squareId})" stroke-width="2.2" opacity="${strength}"/>` +
      `<line x1="${width * 0.2}" y1="${height * 0.3}" x2="${width * 0.8}" y2="${height * 0.7}" stroke="url(#${squareId})" stroke-width="2.2" opacity="${strength * 0.75}"/>`;
  } else if (type === "trine") {
    const cx = width * 0.52;
    const cy = height * 0.5;
    const r = 230;
    const points = Array.from({ length: 3 }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      return `${px.toFixed(2)},${py.toFixed(2)}`;
    });
    body = `<polygon points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="1.6" opacity="${0.25 * strength}"/>`;
  } else if (type === "sextile") {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const r = 230;
    const points = Array.from({ length: 6 }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      return `${px.toFixed(2)},${py.toFixed(2)}`;
    });
    body = `<polygon points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="1.1" opacity="${0.2 * strength}"/>`;
  }

  return { defs: defs.join(""), body };
}

function buildSafeZoneOverlay({ width, height, intensity = 0.35, idPrefix = "space" }) {
  if (!intensity || intensity <= 0) {
    return { defs: "", body: "" };
  }
  const gradId = `${idPrefix}-safeZoneGrad`;
  const defs = `<radialGradient id="${gradId}" cx="50%" cy="45%" r="55%">` +
    `<stop offset="0%" stop-color="#0A0F2A" stop-opacity="${intensity.toFixed(2)}"/>` +
    `<stop offset="70%" stop-color="#0A0F2A" stop-opacity="0.04"/>` +
    `<stop offset="100%" stop-color="#000000" stop-opacity="0"/>` +
    `</radialGradient>`;
  const body = `<rect width="${width}" height="${height}" fill="url(#${gradId})"/>`;
  return { defs, body };
}

function buildAspectLines({ width, height, aspect, orb, color, idPrefix }) {
  if (!aspect) return { defs: "", body: "" };
  const type = normalizeAspectType(aspect?.type || aspect?.aspect || "", aspect?.aspect_deg);
  const orbVal = Number(orb || 0);
  let strength = 0.06;
  if (orbVal <= 0.5) strength = 0.1;
  else if (orbVal <= 1.2) strength = 0.08;
  else if (orbVal <= 2.5) strength = 0.06;
  const opacity = clamp(strength, 0.04, 0.12);
  const stroke = color || BACKGROUND_COLORS.accentBlue;

  if (type === "conjunction") {
    const aspectSeed = hashString(`${idPrefix}-${aspect?.a || ""}-${aspect?.b || ""}-${type}-${aspect?.aspect_deg || ""}-${orbVal}`);
    const aspectRand = mulberry32(aspectSeed);
    const start = aspectRand() * Math.PI * 2;
    const sweep = (0.35 + aspectRand() * 0.25) * Math.PI * 2;
    const end = start + sweep;
    const cx = width * 0.52;
    const cy = height * 0.48;
    const r = height * 0.22;
    const x1 = cx + Math.cos(start) * r;
    const y1 = cy + Math.sin(start) * r;
    const x2 = cx + Math.cos(end) * r;
    const y2 = cy + Math.sin(end) * r;
    const largeArc = sweep > Math.PI ? 1 : 0;
    return {
      defs: "",
      body: `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" stroke-opacity="${opacity}"/>`,
    };
  }
  if (type === "opposition") {
    return {
      defs: "",
      body: `<line x1="${width * 0.22}" y1="${height * 0.5}" x2="${width * 0.78}" y2="${height * 0.5}" stroke="${stroke}" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="10 14" stroke-opacity="${opacity}"/>`,
    };
  }
  if (type === "square" || type === "semi_square_45" || type === "sesqui_square_135") {
    return {
      defs: "",
      body:
        `<line x1="${width * 0.32}" y1="${height * 0.36}" x2="${width * 0.68}" y2="${height * 0.36}" stroke="${stroke}" stroke-width="1.0" stroke-linecap="round" stroke-dasharray="8 12" stroke-opacity="${opacity}"/>` +
        `<line x1="${width * 0.68}" y1="${height * 0.36}" x2="${width * 0.68}" y2="${height * 0.64}" stroke="${stroke}" stroke-width="1.0" stroke-linecap="round" stroke-dasharray="8 12" stroke-opacity="${opacity}"/>`,
    };
  }
  if (type === "trine") {
    const cx = width * 0.52;
    const cy = height * 0.5;
    const r = height * 0.22;
    const points = Array.from({ length: 3 }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      return `${px.toFixed(2)},${py.toFixed(2)}`;
    });
    return { defs: "", body: `<polygon points="${points.join(" ")}" fill="none" stroke="${stroke}" stroke-width="1.0" stroke-linecap="round" stroke-dasharray="10 16" stroke-opacity="${opacity}"/>` };
  }
  if (type === "sextile") {
    return {
      defs: "",
      body: `<line x1="${width * 0.34}" y1="${height * 0.6}" x2="${width * 0.66}" y2="${height * 0.4}" stroke="${stroke}" stroke-width="0.95" stroke-linecap="round" stroke-dasharray="7 12" stroke-opacity="${opacity}"/>`,
    };
  }
  return { defs: "", body: "" };
}

module.exports = {
  buildDailyColorOverlay,
  buildAspectGlow,
  buildSafeZoneOverlay,
  buildAspectLines,
};
