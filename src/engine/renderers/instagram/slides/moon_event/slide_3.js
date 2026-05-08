"use strict";

const { CANVAS, TOK, escapeXml, textBlock, baseSvg, buildSectionHeader, buildRightFooter, renderSvgToPng } = require("../common/shared");
const { resolveColors, BODY_GLOW_COLORS } = require("../../theme");
const { estimateTextWidth, resolveCarouselBodyLines } = require("../common/text_layout");
const {
  PATH_GLYPHS,
  extractGlyph,
  buildGlyphLine,
  buildGlyphPath,
  pickGlyphFontFamily,
} = require("../common/glyph_layout");

function resolveBodyMaxChars(size) {
  const available = CANVAS.width - TOK.marginX * 2;
  const perChar = size * 0.95;
  return Math.max(16, Math.floor(available / perChar));
}

function resolveStructureLines(structure) {
  return resolveCarouselBodyLines({
    text: structure,
    size: TOK.resonance.bodySize,
    canvasWidth: CANVAS.width,
    marginX: TOK.marginX,
    maxChars: 22,
    minChars: 16,
    maxLines: 99,
    extraSafeWidth: 48,
  });
}

function resolvePeakLayout(lineCount = 2) {
  const lines = Math.max(1, Number(lineCount) || 1);
  const lineHeight = TOK.moon.nextLineHeight;
  const peakOffsetY = Number(TOK.resonance.peakOffsetY) || 0;
  const valueY = TOK.rightFooter.dateY + peakOffsetY - lineHeight * (lines - 1);
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
  header = "今日の共鳴",
  subLabel = "",
  lineA,
  lineB,
  aspectLine,
  deepLine,
  structure,
  peakLabel = "",
  peakTime = "",
  brand = "sora-no-koe",
} = {}) {
  const fields = [];
  if (header) {
    const w = estimateTextWidth(header, TOK.header.size);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.resonance.headerY - TOK.header.size,
      w,
      h: TOK.header.size * 1.2,
      pad: 14,
      weight: 0.85,
      kind: "title",
    }));
  }
  if (subLabel) {
    const subLabelY = TOK.resonance.headerY + TOK.subLabel.offsetY;
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
  if (lineA) {
    const w = estimateTextWidth(lineA, TOK.resonance.lineSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.resonance.lineY1 - TOK.resonance.lineSize,
      w,
      h: TOK.resonance.lineSize * 1.2,
      pad: 16,
      weight: 1,
      kind: "heroText",
    }));
  }
  if (lineB) {
    const w = estimateTextWidth(lineB, TOK.resonance.lineSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.resonance.lineY2 - TOK.resonance.lineSize,
      w,
      h: TOK.resonance.lineSize * 1.2,
      pad: 16,
      weight: 1,
      kind: "heroText",
    }));
  }
  if (aspectLine) {
    const w = estimateTextWidth(aspectLine, TOK.resonance.aspectSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.resonance.aspectY - TOK.resonance.aspectSize,
      w,
      h: TOK.resonance.aspectSize * 1.2,
      pad: 12,
      weight: 0.75,
      kind: "subtitle",
    }));
  }
  if (deepLine) {
    const size = Math.round(TOK.resonance.aspectSize * 0.8);
    const w = estimateTextWidth(deepLine, size);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.resonance.aspectY + TOK.resonance.aspectSize + 8 - size,
      w,
      h: size * 1.2,
      pad: 10,
      weight: 0.7,
      kind: "subtitle",
    }));
  }
  const bodyLines = resolveStructureLines(structure);
  if (bodyLines.length) {
    const w = Math.max(...bodyLines.map((l) => estimateTextWidth(l, TOK.resonance.bodySize)));
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.resonance.bodyY - TOK.resonance.bodySize,
      w,
      h: TOK.resonance.bodyLineHeight * bodyLines.length,
      pad: 18,
      weight: 0.9,
      kind: "body",
    }));
  }
  const peakLabelText = peakLabel || (peakTime ? "ピーク時刻" : "");
  if (peakLabelText || peakTime) {
    const peakLines = String(peakTime || "").trim().split(/\s+/).filter(Boolean);
    const { labelY, valueY } = resolvePeakLayout(peakLines.length || 1);
    if (peakLabelText) {
      const w = estimateTextWidth(peakLabelText, TOK.moon.nextLabelSize);
      fields.push(makeField({
        x: TOK.marginX,
        y: labelY - TOK.moon.nextLabelSize,
        w,
        h: TOK.moon.nextLabelSize * 1.2,
        pad: 12,
        weight: 0.7,
        kind: "meta",
      }));
    }
    if (peakLines.length) {
      const w = Math.max(...peakLines.map((l) => estimateTextWidth(l, TOK.moon.nextSize)));
      fields.push(makeField({
        x: TOK.marginX,
        y: valueY - TOK.moon.nextSize,
        w,
        h: TOK.moon.nextLineHeight * peakLines.length,
        pad: 12,
        weight: 0.7,
        kind: "meta",
      }));
    }
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

function resolveGlowColor({ bodyKey, lineText }) {
  if (bodyKey && BODY_GLOW_COLORS[bodyKey]) return BODY_GLOW_COLORS[bodyKey];
  const text = String(lineText || "");
  const map = [
    { key: "sun", label: "太陽" },
    { key: "moon", label: "月" },
    { key: "mercury", label: "水星" },
    { key: "venus", label: "金星" },
    { key: "mars", label: "火星" },
    { key: "jupiter", label: "木星" },
    { key: "saturn", label: "土星" },
    { key: "uranus", label: "天王星" },
    { key: "neptune", label: "海王星" },
    { key: "pluto", label: "冥王星" },
    { key: "lilith", label: "リリス" },
    { key: "chiron", label: "キロン" },
  ];
  const hit = map.find((row) => text.includes(row.label));
  if (hit && BODY_GLOW_COLORS[hit.key]) return BODY_GLOW_COLORS[hit.key];
  return null;
}

function buildSlide3Svg({
  dateLabel,
  header = "今日の共鳴",
  subLabel = "",
  lineA,
  lineB,
  aspectLine,
  structure,
  bodyAKey,
  bodyBKey,
  deepLine,
  peakLabel = "",
  peakTime = "",
  lineAColor = "",
  lineBColor = "",
  space,
} = {}) {
  const colors = resolveColors(space);
  const marginX = TOK.marginX;
  const headerY = TOK.resonance.headerY;
  const subLabelY = headerY + TOK.subLabel.offsetY;

  const structureLines = resolveStructureLines(structure);
  const glyphA = extractGlyph(lineA);
  const glyphB = extractGlyph(lineB);
  const lineAColorResolved = lineAColor || colors.textMain;
  const lineBColorResolved = lineBColor || colors.textMain;
  const glowA = lineAColor ? lineAColor : resolveGlowColor({ bodyKey: bodyAKey, lineText: lineA });
  const glowB = lineBColor ? lineBColor : resolveGlowColor({ bodyKey: bodyBKey, lineText: lineB });

  const glowDefs = [];
  const glowBodies = [];
  const pushGlow = (id, color, glyph, x, y) => {
    if (!glyph || !color) return;
    glowDefs.push(
      `<filter id=\"${id}\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"200%\">` +
        `<feGaussianBlur stdDeviation=\"8\"/>` +
      `</filter>`
    );
    if (PATH_GLYPHS.has(glyph)) {
      const path = buildGlyphPath({ glyph, x, y, size: TOK.resonance.glowSize, color, opacity: 0.55, filterId: id });
      if (path) {
        glowBodies.push(path);
        return;
      }
    }
    const glowFont = pickGlyphFontFamily(glyph);
    glowBodies.push(
      `<text x=\"${x}\" y=\"${y}\" fill=\"${color}\" font-size=\"${TOK.resonance.glowSize}\" font-family=\"${glowFont}\" opacity=\"0.55\" filter=\"url(#${id})\">${escapeXml(glyph)}</text>`
    );
  };

  pushGlow("glyphGlowA", glowA, glyphA, marginX, TOK.resonance.lineY1);
  pushGlow("glyphGlowB", glowB, glyphB, marginX, TOK.resonance.lineY2);

  const deepLineY = deepLine ? TOK.resonance.aspectY + TOK.resonance.aspectSize + 8 : null;
  const inner = [
    glowDefs.length ? `<defs>${glowDefs.join("")}</defs>` : "",
    glowBodies.join(""),
    buildSectionHeader({ label: header, x: marginX, y: headerY, lineWidth: TOK.header.lineWidth, colors }),
    subLabel
      ? `<text x=\"${marginX}\" y=\"${subLabelY}\" fill=\"${colors.textDim}\" font-size=\"${TOK.subLabel.size}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.subLabel.tracking}em\">${escapeXml(subLabel)}</text>`
      : "",
    buildGlyphLine({
      x: marginX,
      y: TOK.resonance.lineY1,
      text: lineA || "",
      size: TOK.resonance.lineSize,
      color: lineAColorResolved,
      fontFamily: "SoraTitleBold",
      letterSpacing: TOK.resonance.lineTracking,
      glyphBoxWidth: TOK.resonance.glyphBoxWidth,
    }),
    `<text x=\"${marginX}\" y=\"${TOK.resonance.xY}\" fill=\"${colors.textSub}\" font-size=\"${TOK.resonance.xSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.resonance.xTracking}em\">×</text>`,
    buildGlyphLine({
      x: marginX,
      y: TOK.resonance.lineY2,
      text: lineB || "",
      size: TOK.resonance.lineSize,
      color: lineBColorResolved,
      fontFamily: "SoraTitleBold",
      letterSpacing: TOK.resonance.lineTracking,
      glyphBoxWidth: TOK.resonance.glyphBoxWidth,
    }),
    `<text x=\"${marginX}\" y=\"${TOK.resonance.aspectY}\" fill=\"${colors.textSub}\" font-size=\"${TOK.resonance.aspectSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.resonance.aspectTracking}em\">${escapeXml(aspectLine || "")}</text>`,
    deepLine
      ? `<text x=\"${marginX}\" y=\"${deepLineY}\" fill=\"${colors.textDim}\" font-size=\"${Math.round(TOK.resonance.aspectSize * 0.8)}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.resonance.aspectTracking}em\">${escapeXml(deepLine || "")}</text>`
      : "",
    textBlock({
      x: marginX,
      y: TOK.resonance.bodyY,
      lines: structureLines,
      size: TOK.resonance.bodySize,
      lineHeight: TOK.resonance.bodyLineHeight,
      color: colors.textMain,
      fontFamily: "SoraBody",
      letterSpacing: TOK.resonance.bodyTracking,
    }),
  ];
  const peakLabelText = peakLabel || (peakTime ? "ピーク時刻" : "");
  if (peakLabelText || peakTime) {
    const peakLines = String(peakTime || "").trim().split(/\s+/).filter(Boolean);
    const { labelY, valueY } = resolvePeakLayout(peakLines.length || 1);
    if (peakLabelText) {
      inner.push(
        `<text x=\"${marginX}\" y=\"${labelY}\" fill=\"${colors.textMain}\" opacity=\"${TOK.resonance.peakOpacity}\" font-size=\"${TOK.moon.nextLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.moon.nextLabelTracking}em\">${escapeXml(peakLabelText)}</text>`
      );
    }
    if (peakLines.length) {
      inner.push(textBlock({
        x: marginX,
        y: valueY,
        lines: peakLines,
        size: TOK.moon.nextSize,
        lineHeight: TOK.moon.nextLineHeight,
        color: colors.textMain,
        fontFamily: "SoraTitle",
        letterSpacing: TOK.moon.nextTracking,
      }));
    }
  }
  inner.push(buildRightFooter({ dateLabel, colors }));

  return baseSvg(inner.join(""), space);
}

async function renderSlide3(data) {
  const svg = buildSlide3Svg(data);
  return renderSvgToPng(svg);
}

module.exports = {
  buildSlide3Svg,
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlide3,
};
