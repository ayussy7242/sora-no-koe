"use strict";

const { CANVAS, TOK, escapeXml, baseSvg, buildRightFooter, buildSectionHeader, renderSvgToPng } = require("../common/shared");
const { resolveColors } = require("../../theme");
const { buildGlyphLine, measureTextWidth } = require("../common/glyph_layout");

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

function normalizePlacementLine(line) {
  if (!line || typeof line !== "object") return { leftText: String(line || ""), rightText: "" };
  const glyph = line.glyph || "";
  const label = line.label || "";
  const signGlyph = line.signGlyph || "";
  const sign = line.sign || "";
  const house = line.house || "";
  const leftText = [glyph, label].filter(Boolean).join(" ").trim();
  const rightText = [signGlyph, sign, house].filter(Boolean).join(" ").trim();
  return { leftText, rightText, glyph, label, signGlyph, sign, house };
}

function getAvoidRegions({
  dateLabel,
  header = "今日の配置",
  subLabel = "today's placements",
  lines = [],
  brand = "sora-no-koe",
} = {}) {
  const fields = [];
  if (header) {
    const w = estimateTextWidth(header, TOK.header.size);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.placements.headerY - TOK.header.size,
      w,
      h: TOK.header.size * 1.2,
      pad: 14,
      weight: 0.85,
      kind: "title",
    }));
  }
  if (subLabel) {
    const w = estimateTextWidth(subLabel, TOK.subLabel.size);
    fields.push(makeField({
      x: TOK.marginX,
      y: (TOK.placements.headerY + TOK.subLabel.offsetY) - TOK.subLabel.size,
      w,
      h: TOK.subLabel.size * 1.3,
      pad: 12,
      weight: 0.75,
      kind: "subtitle",
    }));
  }
  const bodyLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (bodyLines.length) {
    const baseSize = TOK.placements.listSize;
    const listY = Number.isFinite(Number(TOK.contentStartY)) ? Number(TOK.contentStartY) : TOK.placements.listY;
    const leftSize = baseSize + 3;
    const rightSize = baseSize + 1;
    const glyphBoxWidth = Math.round(leftSize * 1.1);
    const glyphGap = Math.round(leftSize * 0.35);
    const rightGlyphBoxWidth = Math.round(rightSize * 0.95);
    const rightGlyphGap = Math.round(rightSize * 0.4);
    const gap = Math.round(leftSize * 0.82);
    const rightGap = Math.round(rightSize * 0.72);
    const widths = bodyLines.map((line) => {
      const parts = normalizePlacementLine(line);
      if (!parts.rightText) return estimateTextWidth(parts.leftText, leftSize);
      const leftWidth = parts.label
        ? glyphBoxWidth + glyphGap + measureTextWidth(parts.label, leftSize, "bodyBold")
        : estimateTextWidth(parts.leftText, leftSize);
      const rightSignWidth = parts.signGlyph
        ? rightGlyphBoxWidth + rightGlyphGap + measureTextWidth(parts.sign, rightSize, "body")
        : measureTextWidth(parts.sign, rightSize, "body");
      const rightHouseWidth = measureTextWidth(parts.house, rightSize, "body");
      return leftWidth + gap + rightSignWidth + rightGap + rightHouseWidth;
    });
    const w = Math.max(...widths);
    fields.push(makeField({
      x: TOK.marginX,
      y: listY - TOK.placements.listSize,
      w,
      h: TOK.placements.listLineHeight * bodyLines.length,
      pad: 16,
      weight: 0.9,
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

function buildSlidePlacementsSvg({
  dateLabel,
  header = "今日の配置",
  subLabel = "today's placements",
  lines = [],
  brand = "sora-no-koe",
  space,
} = {}) {
  const colors = resolveColors(space);
  const marginX = TOK.marginX;
  const headerY = TOK.placements.headerY;
  const bodyLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
  const subLabelY = headerY + TOK.subLabel.offsetY;
  const listY = Number.isFinite(Number(TOK.contentStartY)) ? Number(TOK.contentStartY) : TOK.placements.listY;
  const baseSize = TOK.placements.listSize;
  const leftSize = baseSize + 3;
  const rightSize = baseSize + 1;
  const leftGlyphBoxWidth = Math.round(leftSize * 1.1);
  const leftGlyphGap = Math.round(leftSize * 0.35);
  const rightGlyphBoxWidth = Math.round(rightSize * 0.95);
  const rightGlyphGap = Math.round(rightSize * 0.4);
  const gap = Math.round(leftSize * 0.82);
  const rightGap = Math.round(rightSize * 0.72);

  const inner = [
    buildSectionHeader({ label: header, x: marginX, y: headerY, lineWidth: TOK.header.lineWidth, colors }),
    subLabel
      ? `<text x=\"${marginX}\" y=\"${subLabelY}\" fill=\"${colors.textDim}\" font-size=\"${TOK.subLabel.size}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.subLabel.tracking}em\">${escapeXml(subLabel)}</text>`
      : "",
    bodyLines
      .map((line, idx) => {
        const parts = normalizePlacementLine(line);
        const y = listY + idx * TOK.placements.listLineHeight;
        const left = buildGlyphLine({
          x: marginX,
          y,
          text: parts.leftText,
          size: leftSize,
          color: colors.textMain,
          fontFamily: "SoraBodyBold",
          letterSpacing: TOK.placements.listTracking,
          glyphBoxWidth: leftGlyphBoxWidth,
          glyphGap: leftGlyphGap,
        });
        if (!parts.rightText) return left;
        const labelWidth = parts.label
          ? measureTextWidth(parts.label, leftSize, "bodyBold")
          : measureTextWidth(parts.leftText, leftSize, "bodyBold");
        const rightX = marginX + leftGlyphBoxWidth + leftGlyphGap + labelWidth + gap;
        const signText = [parts.signGlyph, parts.sign].filter(Boolean).join(" ").trim();
        const signLine = buildGlyphLine({
          x: rightX,
          y,
          text: signText,
          size: rightSize,
          color: colors.textDim,
          fontFamily: "SoraBody",
          letterSpacing: 0.05,
          glyphBoxWidth: rightGlyphBoxWidth,
          glyphGap: rightGlyphGap,
        });
        const signWidth = parts.signGlyph
          ? rightGlyphBoxWidth + rightGlyphGap + measureTextWidth(parts.sign, rightSize, "body")
          : measureTextWidth(parts.sign, rightSize, "body");
        const houseX = rightX + signWidth + rightGap;
        const houseLine = buildGlyphLine({
          x: houseX,
          y,
          text: parts.house,
          size: rightSize,
          color: colors.textDim,
          fontFamily: "SoraBody",
          letterSpacing: 0.05,
        });
        return `${left}${signLine}${houseLine}`;
      })
      .join(""),
    buildRightFooter({ dateLabel, brand, colors }),
  ].join("");

  return baseSvg(inner, space);
}

async function renderSlidePlacements(data) {
  const svg = buildSlidePlacementsSvg(data);
  return renderSvgToPng(svg);
}

module.exports = {
  buildSlide2BaseSvg: buildSlidePlacementsSvg,
  getAvoidRegions,
  renderSlide2: renderSlidePlacements,
};
