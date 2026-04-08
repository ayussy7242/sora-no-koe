"use strict";

const sharp = require("sharp");
const { buildSpaceBackground, buildSpaceSeedLabel } = require("../../shared/space_background");
const { fontFaceCss } = require("../instagram/assets/fonts");
const { formatDateLabel, toDateLocalJST } = require("../../../utils/time");
const { escapeXml } = require("../../../utils/data/xml");
const { clamp } = require("../../../utils/data/math");
const { resolveColors } = require("../instagram/theme");
const { buildMoonStatus } = require("../../../domain/moon/summary");
const { detectMoonEventLocal, fullMoonNameJaFromDate, isSecondMoonInMonth } = require("../../../domain/moon/events");

const DEFAULT_X_NIGHT_CANVAS = Object.freeze({
  width: 1200,
  height: 675,
});

function estimateTextWidth(line, size) {
  const text = String(line || "");
  if (!text) return size * 2;
  const len = Array.from(text).length;
  return Math.max(size * 2, len * size * 0.82);
}

function textBlock({ x, y, lines, size, lineHeight, color, fontFamily, letterSpacing }) {
  const spacing = Number.isFinite(letterSpacing) ? ` letter-spacing="${letterSpacing}em"` : "";
  const safeLines = Array.isArray(lines) ? lines : [String(lines || "")];
  const tspans = safeLines
    .filter((line) => String(line || "").trim())
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  if (!tspans) return "";
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="${fontFamily}"${spacing}>${tspans}</text>`;
}

function buildMoonPhaseGlyph({
  id,
  x,
  y,
  size = 160,
  illumination = 0.5,
  waxing = true,
  lightColor = "rgba(245,245,240,0.95)",
  darkColor = "rgba(8,12,28,0.9)",
  strokeColor = null,
}) {
  const r = size / 2;
  const illum = clamp(Number(illumination), 0, 1);
  const glowBoost = illum >= 0.95 ? clamp((illum - 0.95) / 0.05, 0, 1) : 0;
  const glowStrong = clamp(illum * 0.12 * (1 + glowBoost * 0.6), 0, 0.16);
  const glowWeak = clamp(illum * 0.06 * (1 + glowBoost * 0.4), 0, 0.12);
  const surfaceCore = clamp(0.86 + illum * 0.12, 0.86, 0.98);
  const surfaceMid = clamp(surfaceCore - 0.06, 0.72, 0.92);
  const surfaceEdge = clamp(surfaceMid - 0.08, 0.6, 0.86);
  const circleArea = Math.PI * r * r;
  const overlapArea = (dist) => {
    if (dist <= 0) return circleArea;
    if (dist >= 2 * r) return 0;
    const a = 2 * r * r * Math.acos(dist / (2 * r));
    const b = (dist / 2) * Math.sqrt(4 * r * r - dist * dist);
    return a - b;
  };
  const offsetForIllumination = (target) => {
    const t = clamp(Number(target), 0, 1);
    let lo = 0;
    let hi = 2 * r;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      const bright = 1 - overlapArea(mid) / circleArea;
      if (bright < t) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const dx = offsetForIllumination(illum);
  const shift = waxing ? -dx : dx;
  const showShadow = illum < 0.995;
  const clipId = `moonClip-${id || "base"}`;
  const stroke = strokeColor ? ` stroke="${strokeColor}" stroke-width="1"` : "";
  const shadowR = r * 1.02;
  const blurId = `moonSoft-${id || "base"}`;
  const glowId = `moonGlow-${id || "base"}`;
  const gradId = `moonGrad-${id || "base"}`;
  return [
    `<g transform="translate(${x} ${y})">`,
    `<defs>`,
    `<clipPath id="${clipId}"><circle cx="${r}" cy="${r}" r="${r}"/></clipPath>`,
    `<radialGradient id="${gradId}" cx="42%" cy="38%" r="65%">`,
    `<stop offset="0%" stop-color="${lightColor}" stop-opacity="${surfaceCore.toFixed(3)}"/>`,
    `<stop offset="70%" stop-color="${lightColor}" stop-opacity="${surfaceMid.toFixed(3)}"/>`,
    `<stop offset="100%" stop-color="${lightColor}" stop-opacity="${surfaceEdge.toFixed(3)}"/>`,
    `</radialGradient>`,
    `<filter id="${blurId}" x="-10%" y="-10%" width="120%" height="120%">`,
    `<feGaussianBlur stdDeviation="0.3"/>`,
    `</filter>`,
    `<filter id="${glowId}" x="-40%" y="-40%" width="180%" height="180%">`,
    `<feGaussianBlur stdDeviation="12"/>`,
    `</filter>`,
    `</defs>`,
    glowStrong > 0.002
      ? `<circle cx="${r}" cy="${r}" r="${(r * 1.25).toFixed(2)}" fill="${lightColor}" opacity="${glowStrong.toFixed(3)}" filter="url(#${glowId})"/>`
      : "",
    glowWeak > 0.002
      ? `<circle cx="${r}" cy="${r}" r="${(r * 1.55).toFixed(2)}" fill="${lightColor}" opacity="${glowWeak.toFixed(3)}" filter="url(#${glowId})"/>`
      : "",
    `<g filter="url(#${blurId})">`,
    `<circle cx="${r}" cy="${r}" r="${r}" fill="url(#${gradId})"${stroke}/>`,
    showShadow
      ? `<g clip-path="url(#${clipId})">` +
        `<circle cx="${r + shift}" cy="${r}" r="${shadowR}" fill="${darkColor}"/>` +
        `<circle cx="${r + shift}" cy="${r}" r="${shadowR + 1.6}" fill="${darkColor}" opacity="0.35"/>` +
        `</g>`
      : "",
    `</g>`,
    `</g>`,
  ].join("");
}

function buildMoonText({ status, asOfISO, dateLocal, dict }) {
  const phaseName = String(status?.phaseName || "").trim() || "—";
  const waName = String(status?.waName || "").trim();
  const signJa = String(status?.signJa || "").trim();
  const moonAge = Number.isFinite(Number(status?.moonAge)) ? Number(status.moonAge) : null;
  const illumination = Number.isFinite(Number(status?.illumination)) ? Number(status.illumination) : null;

  const isFull = phaseName === "満月";
  const isNew = phaseName === "新月";
  const waxing = Number.isFinite(Number(moonAge)) ? Number(moonAge) < 14.765 : true;

  const event = (isFull || isNew)
    ? detectMoonEventLocal({
        dateLocal,
        asOfISO,
        dict,
        eventKind: isFull ? "full" : "new",
      })
    : null;
  const eventName = String(event?.specialName || event?.moonName || "").trim();
  const eventDate = (() => {
    if (dateLocal) return new Date(`${dateLocal}T12:00:00+09:00`);
    if (asOfISO) return new Date(asOfISO);
    return new Date();
  })();
  const isBlueMoon = isSecondMoonInMonth(eventDate, 180);
  const isBlackMoon = isSecondMoonInMonth(eventDate, 0);
  const fullMoonName = fullMoonNameJaFromDate(eventDate);

  let mainLabel = "";
  let smallLabel = "";
  if (isFull || isNew) {
    mainLabel = [phaseName, signJa].filter(Boolean).join(" ");
    if (isFull) {
      smallLabel = eventName || (isBlueMoon ? "ブルームーン" : fullMoonName) || "";
    } else {
      smallLabel = eventName || (isBlackMoon ? "ブラックムーン" : "");
    }
  } else {
    const phaseFallback = ["満ちゆく月", "欠けゆく月"].includes(phaseName) ? "" : phaseName;
    const core = waName || phaseFallback;
    mainLabel = [core, signJa].filter(Boolean).join(" ");
    smallLabel = waxing ? "満ちゆくサイクル" : "欠けゆくサイクル";
  }

  const moonAgeLabel = moonAge != null ? `月齢 ${moonAge.toFixed(1)}` : "";
  const illuminationLabel = illumination != null ? `照度 ${Math.round(illumination * 100)}%` : "";

  return {
    mainLabel,
    cycleLabel: smallLabel,
    moonAgeLabel,
    illuminationLabel,
    moonIllumination: illumination != null ? illumination : 0.5,
    moonWaxing: waxing,
  };
}

function buildAvoidRegions({ moonBox, textBox }) {
  const regions = [];
  if (moonBox) {
    regions.push({
      ...moonBox,
      weight: 0.7,
      feather: Math.round(Math.max(moonBox.w, moonBox.h) * 0.45),
      kind: "moon",
    });
  }
  if (textBox) {
    regions.push({
      ...textBox,
      weight: 0.55,
      feather: Math.round(textBox.h * 0.9),
      softOnly: true,
      kind: "text",
    });
  }
  return regions;
}

function buildBaseSvg({ story, dateLabel, seedLabel, width, height, variant, avoidRegions, inner }) {
  const space = buildSpaceBackground({
    story,
    dateLabel,
    seedLabel,
    width,
    height,
    variant,
    avoidRegions,
  });
  const defs = `<style>${fontFaceCss()}</style>${space.defs || ""}`;
  const body = `${space.body || ""}${inner || ""}`;
  return {
    svg: [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<defs>${defs}</defs>`,
      body,
      `</svg>`,
    ].join(""),
    space,
  };
}

async function renderXNightMoonPng({
  story,
  dict,
  asOfISO,
  dateLabel,
  width = DEFAULT_X_NIGHT_CANVAS.width,
  height = DEFAULT_X_NIGHT_CANVAS.height,
  variant = "night_moon",
} = {}) {
  if (!story) throw new Error("renderXNightMoonPng: story required");

  const w = Number.isFinite(Number(width)) ? Number(width) : DEFAULT_X_NIGHT_CANVAS.width;
  const h = Number.isFinite(Number(height)) ? Number(height) : DEFAULT_X_NIGHT_CANVAS.height;
  const scale = Math.min(w / DEFAULT_X_NIGHT_CANVAS.width, h / DEFAULT_X_NIGHT_CANVAS.height);

  const asOf = String(asOfISO || story?.meta?.as_of || "").trim() || new Date().toISOString();
  const dateLocal = String(dateLabel || story?.meta?.date_local || story?.public?.date_local || toDateLocalJST(new Date(asOf)));
  const dateLabelSafe = formatDateLabel(dateLocal);
  const seedLabel = buildSpaceSeedLabel({
    seedVersion: "v2",
    channel: "x",
    date: dateLocal,
    variant: String(variant || "night_moon"),
    prefixChannel: true,
  });

  const status = buildMoonStatus({ asOfISO: asOf, story, dict });
  const moonText = buildMoonText({ status, asOfISO: asOf, dateLocal, dict });

  const sizeBoost = 1.4;
  const marginX = Math.round(96 * scale);
  const moonSize = Math.round(220 * scale * sizeBoost);
  const moonX = marginX;
  const moonY = Math.round((h - moonSize) / 2);
  const textX = moonX + moonSize + Math.round(80 * scale);
  const cycleSize = Math.round(22 * scale * sizeBoost);
  const baseLabelSize = Math.round(58 * scale * sizeBoost * 0.9);
  const infoSize = Math.round(24 * scale * sizeBoost);
  const infoLineHeight = Math.round(36 * scale * sizeBoost);

  const maxLabelWidth = Math.max(0, w - textX - Math.round(80 * scale));
  let labelSize = baseLabelSize;
  if (maxLabelWidth > 0) {
    const measured = estimateTextWidth(moonText.mainLabel, labelSize);
    if (measured > maxLabelWidth) {
      const ratio = maxLabelWidth / measured;
      labelSize = Math.max(Math.round(baseLabelSize * ratio), Math.round(baseLabelSize * 0.65));
    }
  }

  const infoLines = [moonText.moonAgeLabel, moonText.illuminationLabel].filter(Boolean);
  const textHeight = (moonText.cycleLabel ? Math.round(cycleSize * 1.4) : 0)
    + Math.round(labelSize * 1.2)
    + infoLines.length * infoLineHeight;
  const textTop = Math.round((h - textHeight) / 2);
  const cycleY = textTop + cycleSize;
  const labelY = moonText.cycleLabel
    ? cycleY + Math.round(labelSize * 1.15)
    : textTop + labelSize;
  const infoY = labelY + Math.round(labelSize * 0.9);

  const labelWidth = estimateTextWidth(moonText.mainLabel, labelSize);
  const cycleWidth = moonText.cycleLabel ? estimateTextWidth(moonText.cycleLabel, cycleSize) : 0;
  const infoWidth = infoLines.length
    ? Math.max(...infoLines.map((line) => estimateTextWidth(line, infoSize)))
    : 0;
  const textWidth = Math.max(labelWidth, cycleWidth, infoWidth);

  const avoidRegions = buildAvoidRegions({
    moonBox: {
      x: moonX - Math.round(20 * scale),
      y: moonY - Math.round(20 * scale),
      w: moonSize + Math.round(40 * scale),
      h: moonSize + Math.round(40 * scale),
    },
    textBox: {
      x: textX - Math.round(16 * scale),
      y: textTop - Math.round(16 * scale),
      w: textWidth + Math.round(32 * scale),
      h: textHeight + Math.round(32 * scale),
    },
  });

  const { svg, space } = buildBaseSvg({
    story,
    dateLabel: dateLabelSafe,
    seedLabel,
    width: w,
    height: h,
    variant,
    avoidRegions,
  });

  const colors = resolveColors(space);
  const inner = [
    buildMoonPhaseGlyph({
      id: "moon",
      x: moonX,
      y: moonY,
      size: moonSize,
      illumination: moonText.moonIllumination,
      waxing: moonText.moonWaxing,
    }),
    moonText.cycleLabel
      ? `<text x="${textX}" y="${cycleY}" fill="${colors.textDim}" font-size="${cycleSize}" font-family="SoraTitle" letter-spacing="0.12em">${escapeXml(moonText.cycleLabel)}</text>`
      : "",
    `<text x="${textX}" y="${labelY}" fill="${colors.textMain}" font-size="${labelSize}" font-family="SoraTitle" letter-spacing="0.06em">${escapeXml(moonText.mainLabel)}</text>`,
    textBlock({
      x: textX,
      y: infoY,
      lines: infoLines,
      size: infoSize,
      lineHeight: infoLineHeight,
      color: colors.textDim,
      fontFamily: "SoraTitle",
      letterSpacing: 0.06,
    }),
  ].join("");

  const finalSvg = svg.replace("</svg>", `${inner}</svg>`);
  return sharp(Buffer.from(finalSvg)).png({ compressionLevel: 9 }).toBuffer();
}

module.exports = {
  DEFAULT_X_NIGHT_CANVAS,
  renderXNightMoonPng,
};
