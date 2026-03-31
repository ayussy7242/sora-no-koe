"use strict";

const { CANVAS, TOK, escapeXml, wrapLines, textBlock, baseSvg, buildRightFooter, buildSectionHeader, renderSvgToPng } = require("../common/shared");
const { resolveColors } = require("../../theme/ig_theme");

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

function getBodyText(lines) {
  if (!Array.isArray(lines) || !lines.length) return "";
  const first = lines[0];
  if (typeof first === "string") return first;
  if (first && typeof first === "object") return String(first.label || first.text || "");
  return "";
}

function getAvoidRegions({ dateLabel, header = "月の空気", subLabel = "moon climate", lines = [], brand = "sora-no-koe" } = {}) {
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

  const bodyText = getBodyText(lines);
  if (bodyText) {
    const bodyLines = wrapLines(bodyText, 26, 12);
    const w = CANVAS.width - TOK.marginX * 2;
    fields.push(makeField({
      x: TOK.marginX,
      y: (TOK.contentStartY || 316) - 34,
      w,
      h: 60 * bodyLines.length,
      pad: 18,
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

function buildSlidePlacementsSvg({ dateLabel, header = "月の空気", subLabel = "moon climate", lines = [], brand = "sora-no-koe", space } = {}) {
  const colors = resolveColors(space);
  const marginX = TOK.marginX;
  const headerY = TOK.placements.headerY;
  const subLabelY = headerY + TOK.subLabel.offsetY;
  const bodyStartY = Number.isFinite(Number(TOK.contentStartY)) ? Number(TOK.contentStartY) : 316;
  const bodyText = getBodyText(lines);
  const bodyLines = wrapLines(bodyText, 26, 12);

  const inner = [
    buildSectionHeader({ label: header, x: marginX, y: headerY, lineWidth: TOK.header.lineWidth, colors }),
    subLabel
      ? `<text x=\"${marginX}\" y=\"${subLabelY}\" fill=\"${colors.textDim}\" font-size=\"${TOK.subLabel.size}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.subLabel.tracking}em\">${escapeXml(subLabel)}</text>`
      : "",
    bodyLines.length
      ? textBlock({
          x: marginX,
          y: bodyStartY,
          lines: bodyLines,
          size: 34,
          lineHeight: 60,
          color: colors.textSub,
          fontFamily: "SoraBody",
          letterSpacing: 0.02,
        })
      : "",
    buildRightFooter({ dateLabel, brand, colors }),
  ].join("");

  return baseSvg(inner, space);
}

async function renderSlidePlacements(data) {
  const svg = buildSlidePlacementsSvg(data);
  return renderSvgToPng(svg);
}

module.exports = {
  buildSlidePlacementsSvg,
  getAvoidRegions,
  renderSlidePlacements,
};
