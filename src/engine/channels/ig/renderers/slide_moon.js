"use strict";

const { CANVAS, TOK, escapeXml, wrapLines, textBlock, baseSvg, buildSectionHeader, buildRightFooter, renderSvgToPng } = require("./shared");
const { resolveColors } = require("../theme/ig_theme");
const { DEFAULT_MOON_LAYOUT } = require("../../../shared/space_background");

const MOON_LAYOUT = DEFAULT_MOON_LAYOUT;

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

function estimateTextWidth(line, size) {
  const text = String(line || "");
  if (!text) return size * 2;
  const len = Array.from(text).length;
  return Math.max(size * 2, len * size * 0.82);
}

function makeField({ x, y, w, h, pad = 12, weight = 1, feather = null, kind = "body" }) {
  const px = Number.isFinite(Number(pad)) ? Number(pad) : 0;
  return {
    x: x - px,
    y: y - px,
    w: w + px * 2,
    h: h + px * 2,
    weight,
    feather,
    kind,
  };
}

function getAvoidRegions({
  dateLabel,
  header = "今日の月",
  phaseLabel = "",
  moonSign = "",
  moonAgeLabel = "",
  illuminationLabel = "",
  observation = "",
  nextLabel = "次の月",
  nextSymbol = "",
  nextPhaseLabel = "",
  nextMoonName = "",
  nextDate = "",
  nextOffsetY = 12,
  brand = "sora-no-koe",
} = {}) {
  const fields = [];
  if (header) {
    const w = estimateTextWidth(header, TOK.header.size);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.moon.headerY - TOK.header.size,
      w,
      h: TOK.header.size * 1.2,
      pad: 14,
      weight: 0.85,
      kind: "title",
    }));
  }
  if (phaseLabel) {
    const w = estimateTextWidth(phaseLabel, TOK.moon.phaseLabelSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.moon.phaseLabelY - TOK.moon.phaseLabelSize,
      w,
      h: TOK.moon.phaseLabelSize * 1.2,
      pad: 16,
      weight: 0.95,
      kind: "heroText",
    }));
  }
  if (moonSign) {
    const w = estimateTextWidth(moonSign, TOK.moon.signSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.moon.signY - TOK.moon.signSize,
      w,
      h: TOK.moon.signSize * 1.2,
      pad: 12,
      weight: 0.85,
      kind: "subtitle",
    }));
  }
  const infoLines = [moonAgeLabel, illuminationLabel].filter(Boolean);
  if (infoLines.length) {
    const w = Math.max(...infoLines.map((l) => estimateTextWidth(l, TOK.moon.infoSize)));
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.moon.infoY - TOK.moon.infoSize,
      w,
      h: TOK.moon.infoLineHeight * infoLines.length,
      pad: 12,
      weight: 0.75,
      kind: "meta",
    }));
  }
  const observationLines = wrapLines(observation, 26, 4);
  if (observationLines.length) {
    const w = Math.max(...observationLines.map((l) => estimateTextWidth(l, TOK.moon.observationSize)));
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.moon.observationY - TOK.moon.observationSize,
      w,
      h: TOK.moon.observationLineHeight * observationLines.length,
      pad: 16,
      weight: 0.9,
      kind: "body",
    }));
  }
  if (nextLabel) {
    const w = estimateTextWidth(nextLabel, TOK.moon.nextLabelSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.moon.nextLabelY + nextOffsetY - TOK.moon.nextLabelSize,
      w,
      h: TOK.moon.nextLabelSize * 1.2,
      pad: 12,
      weight: 0.75,
      kind: "meta",
    }));
  }
  const nextPhaseLine = `${nextSymbol} ${nextPhaseLabel}`.trim();
  const nextNameDateLine = [nextMoonName, nextDate].filter(Boolean).join("　");
  const nextLines = [nextPhaseLine, nextNameDateLine].filter(Boolean);
  if (nextLines.length) {
    const w = Math.max(...nextLines.map((l) => estimateTextWidth(l, TOK.moon.nextSize)));
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.moon.nextY + nextOffsetY - TOK.moon.nextSize,
      w,
      h: TOK.moon.nextLineHeight * nextLines.length,
      pad: 12,
      weight: 0.8,
      kind: "body",
    }));
  }
  if (dateLabel) {
    const w = estimateTextWidth(dateLabel, TOK.rightFooter.dateSize);
    fields.push(makeField({
      x: CANVAS.width - TOK.rightFooter.xOffset - w,
      y: TOK.rightFooter.dateY - TOK.rightFooter.dateSize,
      w,
      h: TOK.rightFooter.dateSize * 1.1,
      pad: 10,
      weight: 0.8,
      kind: "footer",
    }));
  }
  if (brand) {
    const w = estimateTextWidth(brand, TOK.rightFooter.brandSize);
    fields.push(makeField({
      x: CANVAS.width - TOK.rightFooter.xOffset - w,
      y: TOK.rightFooter.brandY - TOK.rightFooter.brandSize,
      w,
      h: TOK.rightFooter.brandSize * 1.15,
      pad: 10,
      weight: 0.8,
      kind: "footer",
    }));
  }
  return fields;
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
  const stroke = strokeColor ? ` stroke=\"${strokeColor}\" stroke-width=\"1\"` : "";
  const shadowR = r * 1.02;
  const blurId = `moonSoft-${id || "base"}`;
  const glowId = `moonGlow-${id || "base"}`;
  const gradId = `moonGrad-${id || "base"}`;
  return [
    `<g transform=\"translate(${x} ${y})\">`,
    `<defs>`,
    `<clipPath id=\"${clipId}\"><circle cx=\"${r}\" cy=\"${r}\" r=\"${r}\"/></clipPath>`,
    `<radialGradient id=\"${gradId}\" cx=\"42%\" cy=\"38%\" r=\"65%\">`,
    `<stop offset=\"0%\" stop-color=\"${lightColor}\" stop-opacity=\"${surfaceCore.toFixed(3)}\"/>`,
    `<stop offset=\"70%\" stop-color=\"${lightColor}\" stop-opacity=\"${surfaceMid.toFixed(3)}\"/>`,
    `<stop offset=\"100%\" stop-color=\"${lightColor}\" stop-opacity=\"${surfaceEdge.toFixed(3)}\"/>`,
    `</radialGradient>`,
    `<filter id=\"${blurId}\" x=\"-10%\" y=\"-10%\" width=\"120%\" height=\"120%\">`,
    `<feGaussianBlur stdDeviation=\"0.3\"/>`,
    `</filter>`,
    `<filter id=\"${glowId}\" x=\"-40%\" y=\"-40%\" width=\"180%\" height=\"180%\">`,
    `<feGaussianBlur stdDeviation=\"12\"/>`,
    `</filter>`,
    `</defs>`,
    glowStrong > 0.002
      ? `<circle cx=\"${r}\" cy=\"${r}\" r=\"${(r * 1.25).toFixed(2)}\" fill=\"${lightColor}\" opacity=\"${glowStrong.toFixed(3)}\" filter=\"url(#${glowId})\"/>`
      : "",
    glowWeak > 0.002
      ? `<circle cx=\"${r}\" cy=\"${r}\" r=\"${(r * 1.55).toFixed(2)}\" fill=\"${lightColor}\" opacity=\"${glowWeak.toFixed(3)}\" filter=\"url(#${glowId})\"/>`
      : "",
    `<g filter=\"url(#${blurId})\">`,
    `<circle cx=\"${r}\" cy=\"${r}\" r=\"${r}\" fill=\"url(#${gradId})\"${stroke}/>`,
    showShadow
      ? `<g clip-path=\"url(#${clipId})\">` +
        `<circle cx=\"${r + shift}\" cy=\"${r}\" r=\"${shadowR}\" fill=\"${darkColor}\"/>` +
        `<circle cx=\"${r + shift}\" cy=\"${r}\" r=\"${shadowR + 1.6}\" fill=\"${darkColor}\" opacity=\"0.35\"/>` +
        `</g>`
      : "",
    `</g>`,
    `</g>`,
  ].join("");
}

function buildSlideMoonSvg({
  dateLabel,
  header = "今日の月",
  phaseSymbol = "◑",
  phaseLabel = "",
  moonSign = "",
  moonAgeLabel = "",
  illuminationLabel = "",
  observation = "",
  nextLabel = "次の月",
  nextSymbol = "",
  nextPhaseLabel = "",
  nextMoonName = "",
  nextDate = "",
  nextOffsetY = 12,
  moonIllumination = 0.5,
  moonWaxing = true,
  moonSize = MOON_LAYOUT.size,
  space,
} = {}) {
  const colors = resolveColors(space);
  const marginX = TOK.marginX;
  const headerY = TOK.moon.headerY;
  const moonX = MOON_LAYOUT.x;
  const moonY = MOON_LAYOUT.y;
  const infoLines = [moonAgeLabel, illuminationLabel].filter(Boolean);
  const observationLines = wrapLines(observation, 26, 4);
  const nextPhaseLine = `${nextSymbol} ${nextPhaseLabel}`.trim();
  const nextNameDateLine = [nextMoonName, nextDate].filter(Boolean).join("　");
  const nextLines = [nextPhaseLine, nextNameDateLine].filter(Boolean);

  const inner = [
    buildSectionHeader({ label: header, x: marginX, y: headerY, lineWidth: TOK.header.lineWidth, colors }),
    buildMoonPhaseGlyph({
      id: "moon",
      x: moonX,
      y: moonY,
      size: moonSize,
      illumination: moonIllumination,
      waxing: moonWaxing,
    }),
    `<text x=\"${marginX}\" y=\"${TOK.moon.phaseLabelY}\" fill=\"${colors.textMain}\" font-size=\"${TOK.moon.phaseLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.moon.phaseLabelTracking}em\">${escapeXml(phaseLabel || "")}</text>`,
    `<text x=\"${marginX}\" y=\"${TOK.moon.signY}\" fill=\"${colors.textSub}\" font-size=\"${TOK.moon.signSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.moon.signTracking}em\">${escapeXml(moonSign || "")}</text>`,
    textBlock({
      x: marginX,
      y: TOK.moon.infoY,
      lines: infoLines,
      size: TOK.moon.infoSize,
      lineHeight: TOK.moon.infoLineHeight,
      color: colors.textDim,
      fontFamily: "SoraTitle",
      letterSpacing: TOK.moon.infoTracking,
    }),
    textBlock({
      x: marginX,
      y: TOK.moon.observationY,
      lines: observationLines,
      size: TOK.moon.observationSize,
      lineHeight: TOK.moon.observationLineHeight,
      color: colors.textMain,
      fontFamily: "SoraBody",
      letterSpacing: TOK.moon.observationTracking,
    }),
    `<text x=\"${marginX}\" y=\"${TOK.moon.nextLabelY + nextOffsetY}\" fill=\"${colors.textSub}\" font-size=\"${TOK.moon.nextLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.moon.nextLabelTracking}em\">${escapeXml(nextLabel || "")}</text>`,
    textBlock({
      x: marginX,
      y: TOK.moon.nextY + nextOffsetY,
      lines: nextLines,
      size: TOK.moon.nextSize,
      lineHeight: TOK.moon.nextLineHeight,
      color: colors.textSub,
      fontFamily: "SoraTitle",
      letterSpacing: TOK.moon.nextTracking,
    }),
    buildRightFooter({ dateLabel, colors }),
  ].join("");

  return baseSvg(inner, space);
}

async function renderSlideMoon(data) {
  const svg = buildSlideMoonSvg(data);
  return renderSvgToPng(svg);
}

module.exports = {
  buildSlideMoonSvg,
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlideMoon,
};
