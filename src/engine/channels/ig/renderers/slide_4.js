"use strict";

const { CANVAS, TOK, escapeXml, wrapLines, textBlock, baseSvg, buildSectionHeader, buildRightFooter, renderSvgToPng } = require("./shared");
const { resolveColors } = require("../theme/ig_theme");
const { buildGlyphLine } = require("./glyph_layout");

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
  header = "つきじ",
  lineA,
  lineB,
  structureLabel,
  start,
  peak,
  end,
  brand = "sora-no-koe",
} = {}) {
  const fields = [];
  if (header) {
    const w = estimateTextWidth(header, TOK.header.size);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.tsukiji.headerY - TOK.header.size,
      w,
      h: TOK.header.size * 1.2,
      pad: 14,
      weight: 0.85,
      kind: "title",
    }));
  }
  if (lineA) {
    const w = estimateTextWidth(lineA, TOK.tsukiji.lineSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.tsukiji.lineY1 - TOK.tsukiji.lineSize,
      w,
      h: TOK.tsukiji.lineSize * 1.2,
      pad: 16,
      weight: 1,
      kind: "heroText",
    }));
  }
  if (lineB) {
    const w = estimateTextWidth(lineB, TOK.tsukiji.lineSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.tsukiji.lineY2 - TOK.tsukiji.lineSize,
      w,
      h: TOK.tsukiji.lineSize * 1.2,
      pad: 16,
      weight: 1,
      kind: "heroText",
    }));
  }
  const structureLines = wrapLines(structureLabel, 22, 2);
  if (structureLines.length) {
    const w = Math.max(...structureLines.map((l) => estimateTextWidth(l, TOK.tsukiji.structureSize)));
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.tsukiji.structureY - TOK.tsukiji.structureSize,
      w,
      h: TOK.tsukiji.structureLineHeight * structureLines.length,
      pad: 14,
      weight: 0.85,
      kind: "body",
    }));
  }
  const tableLabels = ["開始", "ピーク", "終了予定"];
  const tableValues = [start, peak, end];
  const tableY = [TOK.tsukiji.tableY1, TOK.tsukiji.tableY2, TOK.tsukiji.tableY3];
  for (let i = 0; i < tableLabels.length; i++) {
    const label = tableLabels[i];
    const value = tableValues[i];
    const y = tableY[i];
    const labelW = estimateTextWidth(label, TOK.tsukiji.tableLabelSize);
    const valueW = estimateTextWidth(value, TOK.tsukiji.tableValueSize);
    const w = TOK.tsukiji.tableColGap + Math.max(labelW, valueW);
    fields.push(makeField({
      x: TOK.marginX,
      y: y - TOK.tsukiji.tableLabelSize,
      w,
      h: TOK.tsukiji.tableLabelSize * 1.4,
      pad: 12,
      weight: 0.8,
      kind: "meta",
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

function buildSlide4Svg({
  dateLabel,
  header = "つきじ",
  lineA,
  lineB,
  structureLabel,
  start,
  peak,
  end,
  space,
} = {}) {
  const colors = resolveColors(space);
  const marginX = TOK.marginX;
  const headerY = TOK.tsukiji.headerY;

  const structureLines = wrapLines(structureLabel, 22, 2);

  const inner = [
    buildSectionHeader({ label: header, x: marginX, y: headerY, lineWidth: TOK.header.lineWidth, colors }),
    buildGlyphLine({
      x: marginX,
      y: TOK.tsukiji.lineY1,
      text: lineA || "",
      size: TOK.tsukiji.lineSize,
      color: colors.textMain,
      fontFamily: "SoraTitleBold",
      letterSpacing: TOK.tsukiji.lineTracking,
    }),
    `<text x=\"${marginX + 26}\" y=\"${TOK.tsukiji.xY}\" fill=\"${colors.textSub}\" font-size=\"${TOK.tsukiji.xSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.tsukiji.xTracking}em\">×</text>`,
    buildGlyphLine({
      x: marginX,
      y: TOK.tsukiji.lineY2,
      text: lineB || "",
      size: TOK.tsukiji.lineSize,
      color: colors.textMain,
      fontFamily: "SoraTitleBold",
      letterSpacing: TOK.tsukiji.lineTracking,
    }),
    textBlock({
      x: marginX,
      y: TOK.tsukiji.structureY,
      lines: structureLines,
      size: TOK.tsukiji.structureSize,
      lineHeight: TOK.tsukiji.structureLineHeight,
      color: colors.textSub,
      fontFamily: "SoraTitle",
      letterSpacing: TOK.tsukiji.structureTracking,
    }),
    `<text x=\"${marginX}\" y=\"${TOK.tsukiji.tableY1}\" fill=\"${colors.textDim}\" font-size=\"${TOK.tsukiji.tableLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.tsukiji.tableTracking}em\">開始</text>`,
    `<text x=\"${marginX + TOK.tsukiji.tableColGap}\" y=\"${TOK.tsukiji.tableY1}\" fill=\"${colors.textMain}\" font-size=\"${TOK.tsukiji.tableValueSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.tsukiji.tableTracking}em\">${escapeXml(start || "")}</text>`,
    `<text x=\"${marginX}\" y=\"${TOK.tsukiji.tableY2}\" fill=\"${colors.textDim}\" font-size=\"${TOK.tsukiji.tableLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.tsukiji.tableTracking}em\">ピーク</text>`,
    `<text x=\"${marginX + TOK.tsukiji.tableColGap}\" y=\"${TOK.tsukiji.tableY2}\" fill=\"${colors.textMain}\" font-size=\"${TOK.tsukiji.tableValueSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.tsukiji.tableTracking}em\">${escapeXml(peak || "")}</text>`,
    `<text x=\"${marginX}\" y=\"${TOK.tsukiji.tableY3}\" fill=\"${colors.textDim}\" font-size=\"${TOK.tsukiji.tableLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.tsukiji.tableTracking}em\">終了予定</text>`,
    `<text x=\"${marginX + TOK.tsukiji.tableColGap}\" y=\"${TOK.tsukiji.tableY3}\" fill=\"${colors.textMain}\" font-size=\"${TOK.tsukiji.tableValueSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.tsukiji.tableTracking}em\">${escapeXml(end || "")}</text>`,
    buildRightFooter({ dateLabel, colors }),
  ].join("");

  return baseSvg(inner, space);
}

async function renderSlide4(data) {
  const svg = buildSlide4Svg(data);
  return renderSvgToPng(svg);
}

module.exports = {
  buildSlide4Svg,
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlide4,
};
