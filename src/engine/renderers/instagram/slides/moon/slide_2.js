"use strict";
const { buildMoonPhaseGlyph: buildMoonPhaseGlyphShared } = require("../../../../shared/moon_glyph");

const { CANVAS, TOK, escapeXml, wrapLines, textBlock, baseSvg, buildSectionHeader, buildRightFooter, renderSvgToPng } = require("../common/shared");
const { resolveColors } = require("../../theme");
const { DEFAULT_MOON_LAYOUT } = require("../../../../shared/space_background");
const { clamp } = require("../../../../../utils/data/math");

const MOON_LAYOUT = DEFAULT_MOON_LAYOUT;

function estimateTextWidth(line, size) {
  const text = String(line || "");
  if (!text) return size * 2;
  const len = Array.from(text).length;
  return Math.max(size * 2, len * size * 0.82);
}

function resolveBodyMaxChars(size) {
  const pad = Number.isFinite(Number(TOK.bodyPadX)) ? Number(TOK.bodyPadX) : 0;
  const available = CANVAS.width - TOK.marginX * 2 - pad;
  const perChar = size * 0.95;
  return Math.max(16, Math.floor(available / perChar));
}

function resolveNextLayout({ nextOffsetY = 0, lineCount = 2 } = {}) {
  const offset = Number(nextOffsetY) || 0;
  const lines = Math.max(1, Number(lineCount) || 1);
  const lineHeight = TOK.moon.nextLineHeight;
  const valueY = TOK.rightFooter.dateY + offset - lineHeight * (lines - 1);
  const labelY = valueY - TOK.moon.nextLineHeight;
  return { labelY, valueY };
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
  subLabel = "",
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
  const contentStartY = Number.isFinite(Number(TOK.moon.contentStartY))
    ? Number(TOK.moon.contentStartY)
    : Number(TOK.contentStartY);
  const contentOffsetY = Number.isFinite(contentStartY)
    ? contentStartY - MOON_LAYOUT.y
    : (Number(TOK.moon.contentOffsetY) || 0);
  const phaseSignLine = [phaseLabel, moonSign].filter(Boolean).join(" ");
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
  if (subLabel) {
    const subLabelY = TOK.moon.headerY + TOK.subLabel.offsetY;
    const w = estimateTextWidth(subLabel, TOK.subLabel.size);
    fields.push(makeField({
      x: TOK.marginX,
      y: subLabelY - TOK.subLabel.size,
      w,
      h: TOK.subLabel.size * 1.3,
      pad: 12,
      weight: 0.75,
      kind: "subtitle",
    }));
  }
  if (phaseSignLine) {
    const w = estimateTextWidth(phaseSignLine, TOK.moon.phaseLabelSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: (TOK.moon.phaseLabelY + contentOffsetY) - TOK.moon.phaseLabelSize,
      w,
      h: TOK.moon.phaseLabelSize * 1.2,
      pad: 16,
      weight: 0.95,
      kind: "heroText",
    }));
  }
  const infoLines = [moonAgeLabel, illuminationLabel].filter(Boolean);
  if (infoLines.length) {
    const w = Math.max(...infoLines.map((l) => estimateTextWidth(l, TOK.moon.infoSize)));
    fields.push(makeField({
      x: TOK.marginX,
      y: (TOK.moon.infoY + contentOffsetY) - TOK.moon.infoSize,
      w,
      h: TOK.moon.infoLineHeight * infoLines.length,
      pad: 12,
      weight: 0.75,
      kind: "meta",
    }));
  }
  const observationMaxChars = resolveBodyMaxChars(TOK.moon.observationSize);
  const observationLines = wrapLines(observation, observationMaxChars, 5);
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
  const nextPhaseLine = `${nextSymbol} ${nextPhaseLabel}`.trim();
  const nextNameDateLine = [nextMoonName, nextDate].filter(Boolean).join("　");
  const nextLines = [nextPhaseLine, nextNameDateLine].filter(Boolean);
  if (nextLabel) {
    const { labelY } = resolveNextLayout({ nextOffsetY, lineCount: nextLines.length || 1 });
    const w = estimateTextWidth(nextLabel, TOK.moon.nextLabelSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: labelY - TOK.moon.nextLabelSize,
      w,
      h: TOK.moon.nextLabelSize * 1.2,
      pad: 12,
      weight: 0.75,
      kind: "meta",
    }));
  }
  if (nextLines.length) {
    const { valueY } = resolveNextLayout({ nextOffsetY, lineCount: nextLines.length });
    const w = Math.max(...nextLines.map((l) => estimateTextWidth(l, TOK.moon.nextSize)));
    fields.push(makeField({
      x: TOK.marginX,
      y: valueY - TOK.moon.nextSize,
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

function buildMoonPhaseGlyph(opts) {
  return buildMoonPhaseGlyphShared(opts);
}

function buildSlideMoonSvg({
  dateLabel,
  header = "今日の月",
  subLabel = "",
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
  moonAgeDays = null,
  moonSize = MOON_LAYOUT.size,
  accentColor = "",
  space,
} = {}) {
  const colors = resolveColors(space);
  const accent = accentColor || colors.textMain;
  const marginX = TOK.marginX;
  const headerY = TOK.moon.headerY;
  const subLabelY = headerY + TOK.subLabel.offsetY;
  const contentStartY = Number.isFinite(Number(TOK.moon.contentStartY))
    ? Number(TOK.moon.contentStartY)
    : Number(TOK.contentStartY);
  const contentOffsetY = Number.isFinite(contentStartY)
    ? contentStartY - MOON_LAYOUT.y
    : (Number(TOK.moon.contentOffsetY) || 0);
  const moonScale = Number.isFinite(Number(TOK.moon.moonScale)) ? Number(TOK.moon.moonScale) : 1;
  const moonSymbolOffsetY = Number(TOK.moon.moonSymbolOffsetY) || 0;
  const moonX = MOON_LAYOUT.x;
  const moonY = MOON_LAYOUT.y + contentOffsetY + moonSymbolOffsetY;
  const phaseSignLine = [phaseLabel, moonSign].filter(Boolean).join(" ");
  const infoLines = [moonAgeLabel, illuminationLabel].filter(Boolean);
  const observationMaxChars = resolveBodyMaxChars(TOK.moon.observationSize);
  const observationLines = wrapLines(observation, observationMaxChars, 5);
  const nextPhaseLine = `${nextSymbol} ${nextPhaseLabel}`.trim();
  const nextNameDateLine = [nextMoonName, nextDate].filter(Boolean).join("　");
  const nextLines = [nextPhaseLine, nextNameDateLine].filter(Boolean);
  const nextOpacity = 0.6;

  const inner = [
    buildSectionHeader({ label: header, x: marginX, y: headerY, lineWidth: TOK.header.lineWidth, colors }),
    subLabel
      ? `<text x=\"${marginX}\" y=\"${subLabelY}\" fill=\"${colors.textDim}\" font-size=\"${TOK.subLabel.size}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.subLabel.tracking}em\">${escapeXml(subLabel)}</text>`
      : "",
    buildMoonPhaseGlyph({
      id: "moon",
      x: moonX,
      y: moonY,
      size: Number(moonSize) * moonScale,
      illumination: moonIllumination,
      waxing: moonWaxing,
      moonAgeDays,
    }),
    phaseSignLine
      ? `<text x=\"${marginX}\" y=\"${TOK.moon.phaseLabelY + contentOffsetY}\" fill=\"${accent}\" font-size=\"${TOK.moon.phaseLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.moon.phaseLabelTracking}em\">${escapeXml(phaseSignLine)}</text>`
      : "",
    textBlock({
      x: marginX,
      y: TOK.moon.infoY + contentOffsetY,
      lines: infoLines,
      size: TOK.moon.infoSize,
      lineHeight: TOK.moon.infoLineHeight,
      color: colors.textDim,
      fontFamily: "SoraTitle",
      letterSpacing: TOK.moon.infoTracking,
    }),
    textBlock({
      x: marginX,
      y: TOK.moon.observationY + contentOffsetY,
      lines: observationLines,
      size: TOK.moon.observationSize,
      lineHeight: TOK.moon.observationLineHeight,
      color: colors.textMain,
      fontFamily: "SoraBody",
      letterSpacing: TOK.moon.observationTracking,
    }),
    (() => {
      const { labelY } = resolveNextLayout({ nextOffsetY, lineCount: nextLines.length || 1 });
      return `<text x=\"${marginX}\" y=\"${labelY}\" fill=\"${colors.textSub}\" opacity=\"${nextOpacity}\" font-size=\"${TOK.moon.nextLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.moon.nextLabelTracking}em\">${escapeXml(nextLabel || "")}</text>`;
    })(),
    textBlock({
      x: marginX,
      y: resolveNextLayout({ nextOffsetY, lineCount: nextLines.length }).valueY,
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
  buildSlide2BaseSvg: buildSlideMoonSvg,
  buildMoonPhaseGlyph,
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlide2: renderSlideMoon,
};
