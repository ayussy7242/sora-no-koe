"use strict";

const { CANVAS, TOK, escapeXml, baseSvg, buildRightFooter, renderSvgToPng } = require("../common/shared");
const { resolveColors } = require("../../theme");
const { buildMoonPhaseGlyph } = require("./slide_moon");

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

function resolveMoonMetrics({ moonSize } = {}) {
  const size = Number.isFinite(Number(moonSize)) ? Number(moonSize) : Math.round(CANVAS.width * 0.48);
  const x = Math.round((CANVAS.width - size) / 2);
  const y = Math.round((CANVAS.height - size) / 2);
  const lineY = Math.round(y + size + 76);
  return { size, x, y, lineY };
}

function getAvoidRegions({
  title = "今日の月",
  subLabel = "today's moon",
  brand = "ソラのこえ",
  dateLabel = "",
  swipeLabel = "Swipe →",
  moonSize,
} = {}) {
  const { size, x, y, lineY } = resolveMoonMetrics({ moonSize });
  const fields = [];
  fields.push({
    shape: "circle",
    cx: x + size / 2,
    cy: y + size / 2,
    r: size * 0.52,
    weight: 1,
    feather: 40,
      kind: "moon",
    });
  const centerX = CANVAS.width / 2;
  const brandY = TOK.cover.brandY;
  const taglineY = TOK.cover.taglineY;
  const subLabelY = taglineY + TOK.subLabel.offsetY;
  const subLabelSize = TOK.cover.subLabelSize || TOK.subLabel.size;
  if (brand) {
    fields.push(makeField({
      x: centerX - 240,
      y: brandY - TOK.cover.brandSize,
      w: 480,
      h: 60,
      pad: 12,
      weight: 0.8,
      kind: "header",
    }));
  }
  if (title) {
    fields.push(makeField({
      x: centerX - 240,
      y: taglineY - TOK.cover.taglineSize,
      w: 480,
      h: 60,
      pad: 12,
      weight: 0.8,
      kind: "header",
    }));
  }
  if (subLabel) {
    fields.push(makeField({
      x: centerX - 240,
      y: subLabelY - subLabelSize,
      w: 480,
      h: 44,
      pad: 12,
      weight: 0.7,
      kind: "header",
    }));
  }
  const footerY = TOK.footer.dateY;
  const metaSize = TOK.footer.dateSize || 28;
  if (dateLabel) {
    fields.push(makeField({
      x: TOK.marginX - 8,
      y: footerY - metaSize,
      w: 260,
      h: metaSize * 1.2,
      pad: 10,
      weight: 0.7,
      kind: "footer",
    }));
  }
  if (swipeLabel) {
    fields.push(makeField({
      x: CANVAS.width - TOK.marginX - 220,
      y: footerY - metaSize,
      w: 220,
      h: metaSize * 1.2,
      pad: 10,
      weight: 0.7,
      kind: "footer",
    }));
  }
  return fields;
}

function buildSlideNightMoonSvg({
  dateLabel,
  title = "今日の月",
  subLabel = "today's moon",
  brand = "ソラのこえ",
  moonIllumination = 0.5,
  moonWaxing = true,
  moonSize,
  swipeLabel = "Swipe →",
  space,
} = {}) {
  const colors = resolveColors(space);
  const centerX = CANVAS.width / 2;
  const brandY = TOK.cover.brandY;
  const taglineY = TOK.cover.taglineY;
  const subLabelY = taglineY + TOK.subLabel.offsetY;
  const subLabelSize = TOK.cover.subLabelSize || TOK.subLabel.size;
  const { size, x, y, lineY } = resolveMoonMetrics({ moonSize });
  const footerY = TOK.footer.dateY;
  const footerSize = TOK.footer.dateSize || 28;
  const swipeSize = TOK.footer.swipeSize || 28;

  const inner = [
    `<text x="${centerX}" y="${brandY}" text-anchor="middle" fill="${colors.textMain}" font-size="${TOK.cover.brandSize}" font-family="SoraTitle" letter-spacing="${TOK.cover.brandTracking}em">${escapeXml(brand)}</text>`,
    `<text x="${centerX}" y="${taglineY}" text-anchor="middle" fill="${colors.textSub}" font-size="${TOK.cover.taglineSize}" font-family="SoraTitle" letter-spacing="${TOK.cover.taglineTracking}em">${escapeXml(title)}</text>`,
    `<text x="${centerX}" y="${subLabelY}" text-anchor="middle" fill="${colors.textDim}" font-size="${subLabelSize}" font-family="SoraTitle" letter-spacing="${TOK.subLabel.tracking}em">${escapeXml(subLabel)}</text>`,
    buildMoonPhaseGlyph({
      id: "nightMoon",
      x,
      y,
      size,
      illumination: moonIllumination,
      waxing: moonWaxing,
    }),
    `<text x="${TOK.marginX}" y="${footerY}" fill="${colors.textDim}" font-size="${footerSize}" font-family="SoraTitle" letter-spacing="${TOK.footer.swipeTracking}em">${escapeXml(dateLabel || "")}</text>`,
    `<text x="${CANVAS.width - TOK.marginX}" y="${footerY}" text-anchor="end" fill="${colors.textSub}" font-size="${swipeSize}" font-family="SoraTitle" letter-spacing="${TOK.footer.swipeTracking}em">${escapeXml(swipeLabel || "")}</text>`,
    buildRightFooter({ brand: "", dateLabel: "", colors }),
  ].join("");

  return baseSvg(inner, space);
}

async function renderSlideNightMoon(data) {
  const svg = buildSlideNightMoonSvg(data);
  return renderSvgToPng(svg);
}

module.exports = {
  buildSlideNightMoonSvg,
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlideNightMoon,
};
