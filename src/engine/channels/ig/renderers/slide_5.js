"use strict";

const { CANVAS, TOK, escapeXml, wrapLines, textBlock, baseSvg, buildRightFooter, renderSvgToPng } = require("./shared");
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
  header = "観測ガイド",
  cta,
  sub,
  ornament = "☉  ─  ☾",
  brand = "sora-no-koe",
  dateLabel,
  miniCta = "link in bio",
} = {}) {
  const fields = [];
  const centerX = CANVAS.width / 2;
  const ornamentSize = TOK.cta.ornamentSize + 18;
  const subSize = TOK.cta.subSize + 4;
  const subSizeSmall = TOK.cta.subSizeSmall + 4;
  const subSizeLarge = TOK.cta.subSizeLarge + 4;
  const subLineHeight = TOK.cta.subLineHeight + 6;
  const miniCtaSize = TOK.cta.miniCtaSize + 2;
  const headerLines = wrapLines(header, 12, 2);
  const ctaLines = wrapLines(cta || "今日の空", 18, 2);
  const subLines = wrapLines(sub || "星の配置はLINEで配信中\nネイタル一覧も見れます", 18, 2);

  if (ornament) {
    const ornamentWidth = estimateTextWidth(ornament, ornamentSize);
    fields.push(makeField({
      x: centerX - ornamentWidth / 2,
      y: TOK.cta.ornamentY - ornamentSize,
      w: ornamentWidth,
      h: ornamentSize * 1.2,
      pad: 16,
      weight: 0.7,
      kind: "meta",
    }));
    if (ctaLines.length) {
      const w = Math.max(...ctaLines.map((l) => estimateTextWidth(l, TOK.cta.ctaSize)));
      fields.push(makeField({
        x: centerX - w / 2,
        y: TOK.cta.ctaY - TOK.cta.ctaSize,
        w,
        h: TOK.cta.ctaLineHeight * ctaLines.length,
        pad: 18,
        weight: 0.95,
        kind: "heroText",
      }));
    }
    if (subLines.length) {
      const size = subLines.length === 2 ? subSizeLarge : subSize;
      const lineHeight = subLineHeight;
      const w = Math.max(...subLines.map((l) => estimateTextWidth(l, size)));
      fields.push(makeField({
        x: centerX - w / 2,
        y: TOK.cta.subY - size,
        w,
        h: lineHeight * subLines.length,
        pad: 14,
        weight: 0.85,
        kind: "subtitle",
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
  } else {
    if (headerLines.length) {
      const w = Math.max(...headerLines.map((l) => estimateTextWidth(l, TOK.cta.headerSize)));
      fields.push(makeField({
        x: centerX - w / 2,
        y: TOK.cta.headerY - TOK.cta.headerSize,
        w,
        h: TOK.cta.headerLineHeight * headerLines.length,
        pad: 16,
        weight: 0.85,
        kind: "title",
      }));
    }
    if (ctaLines.length) {
      const w = Math.max(...ctaLines.map((l) => estimateTextWidth(l, TOK.cta.altCtaSize)));
      fields.push(makeField({
        x: centerX - w / 2,
        y: TOK.cta.altCtaY - TOK.cta.altCtaSize,
        w,
        h: TOK.cta.altCtaLineHeight * ctaLines.length,
        pad: 18,
        weight: 0.95,
        kind: "heroText",
      }));
    }
    if (subLines.length) {
      const w = Math.max(...subLines.map((l) => estimateTextWidth(l, TOK.cta.altSubSize)));
      fields.push(makeField({
        x: centerX - w / 2,
        y: TOK.cta.altSubY - TOK.cta.altSubSize,
        w,
        h: TOK.cta.altSubLineHeight * subLines.length,
        pad: 16,
        weight: 0.85,
        kind: "subtitle",
      }));
    }
    if (brand) {
      const w = estimateTextWidth(brand, 28);
      fields.push(makeField({
        x: centerX - w / 2,
        y: 1220 - 28,
        w,
        h: 28 * 1.2,
        pad: 12,
        weight: 0.7,
        kind: "footer",
      }));
    }
  }
  if (miniCta) {
    const w = estimateTextWidth(miniCta, miniCtaSize);
    fields.push(makeField({
      x: CANVAS.width / 2 - w / 2,
      y: TOK.cta.miniCtaY - miniCtaSize,
      w,
      h: miniCtaSize * 1.2,
      pad: 10,
      weight: 0.7,
      kind: "footer",
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
  return fields;
}

function buildSlide5Svg({
  header = "観測ガイド",
  cta = "今日の空",
  sub = "星の配置はLINEで配信中\nネイタル一覧も見れます",
  ornament = "☉  ─  ☾",
  brand = "sora-no-koe",
  dateLabel,
  miniCta = "link in bio",
  space,
} = {}) {
  const colors = resolveColors(space);
  const centerX = CANVAS.width / 2;
  const ornamentSize = TOK.cta.ornamentSize + 18;
  const subSize = TOK.cta.subSize + 4;
  const subSizeSmall = TOK.cta.subSizeSmall + 4;
  const subSizeLarge = TOK.cta.subSizeLarge + 4;
  const subLineHeight = TOK.cta.subLineHeight + 6;
  const miniCtaSize = TOK.cta.miniCtaSize + 2;
  const headerLines = wrapLines(header, 12, 2);
  const ctaLines = wrapLines(cta, 18, 2);
  const subLines = wrapLines(sub, 18, 2);

  if (ornament) {
    const glyphLeft = "☉";
    const glyphRight = "☽";
    const glyphGap = ornamentSize * 0.9;
    const lineWidth = ornamentSize * 2.4;
    const ornamentY = TOK.cta.ornamentY;
    const hasTwoLineSub = subLines.length === 2;
    const subBlock = hasTwoLineSub
      ? [
          `<text x=\"${centerX}\" y=\"${TOK.cta.subY}\" text-anchor=\"middle\" fill=\"${colors.textSub}\" font-size=\"${subSizeSmall}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.cta.subTracking}em\">${escapeXml(subLines[0])}</text>`,
          `<text x=\"${centerX}\" y=\"${TOK.cta.subY + subLineHeight}\" text-anchor=\"middle\" fill=\"${colors.textSub}\" font-size=\"${subSizeLarge}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.cta.subTracking}em\">${escapeXml(subLines[1])}</text>`,
        ].join("")
      : textBlock({
          x: centerX,
          y: TOK.cta.subY,
          lines: subLines,
          size: subSize,
          lineHeight: subLineHeight,
          color: colors.textSub,
          fontFamily: "SoraTitle",
          letterSpacing: TOK.cta.subTracking,
          anchor: "middle",
        });
    const ornamentBlock = [
      buildGlyphLine({
        x: centerX - glyphGap,
        y: ornamentY,
        text: glyphLeft,
        size: ornamentSize,
        color: colors.textMain,
        fontFamily: "SoraTitle",
        anchor: "middle",
      }),
      `<line x1=\"${centerX - lineWidth / 2}\" y1=\"${ornamentY + 6}\" x2=\"${centerX + lineWidth / 2}\" y2=\"${ornamentY + 6}\" stroke=\"${colors.textSub}\" stroke-width=\"1\" stroke-opacity=\"0.35\"/>`,
      buildGlyphLine({
        x: centerX + glyphGap,
        y: ornamentY,
        text: glyphRight,
        size: ornamentSize,
        color: colors.textMain,
        fontFamily: "SoraTitle",
        anchor: "middle",
      }),
    ].join("");

    const inner = [
      ornamentBlock,
      textBlock({
        x: centerX,
        y: TOK.cta.ctaY,
        lines: ctaLines,
        size: TOK.cta.ctaSize,
        lineHeight: TOK.cta.ctaLineHeight,
        color: colors.textMain,
        fontFamily: "SoraTitle",
        letterSpacing: TOK.cta.ctaTracking,
        anchor: "middle",
      }),
      `<line x1=\"${centerX - TOK.cta.lineWidth / 2}\" y1=\"${TOK.cta.lineY}\" x2=\"${centerX + TOK.cta.lineWidth / 2}\" y2=\"${TOK.cta.lineY}\" stroke=\"${colors.textMain}\" stroke-width=\"1\" opacity=\"${TOK.cta.lineOpacity}\"/>`,
      `<g opacity=\"${TOK.cta.subOpacity}\">${subBlock}</g>`,
      miniCta
        ? `<text x=\"${centerX}\" y=\"${TOK.cta.miniCtaY}\" text-anchor=\"middle\" fill=\"${colors.textDim}\" font-size=\"${miniCtaSize}\" font-family=\"SoraTitle\" opacity=\"${TOK.cta.miniCtaOpacity}\" letter-spacing=\"${TOK.cta.miniCtaTracking}em\">${escapeXml(miniCta)}</text>`
        : "",
      buildRightFooter({ brand, dateLabel, colors }),
    ].join("");
    return baseSvg(inner, space);
  }

  const inner = [
    textBlock({
      x: centerX,
      y: TOK.cta.headerY,
      lines: headerLines,
      size: TOK.cta.headerSize,
      lineHeight: TOK.cta.headerLineHeight,
      color: colors.textSub,
      fontFamily: "SoraTitle",
      letterSpacing: TOK.cta.headerTracking,
      anchor: "middle",
    }),
    textBlock({
      x: centerX,
      y: TOK.cta.altCtaY,
      lines: ctaLines,
      size: TOK.cta.altCtaSize,
      lineHeight: TOK.cta.altCtaLineHeight,
      color: colors.textMain,
      fontFamily: "SoraTitle",
      letterSpacing: TOK.cta.altCtaTracking,
      anchor: "middle",
    }),
    textBlock({
      x: centerX,
      y: TOK.cta.altSubY,
      lines: subLines,
      size: TOK.cta.altSubSize,
      lineHeight: TOK.cta.altSubLineHeight,
      color: colors.textSub,
      fontFamily: "SoraSoft",
      letterSpacing: TOK.cta.altSubTracking,
      anchor: "middle",
    }),
    `<text x=\"${centerX}\" y=\"1220\" text-anchor=\"middle\" fill=\"${colors.textDim}\" font-size=\"28\" font-family=\"SoraTitle\" letter-spacing=\"0.32em\">${escapeXml(brand)}</text>`,
  ].join("");

  return baseSvg(inner, space);
}

async function renderSlide5(data) {
  const svg = buildSlide5Svg(data);
  return renderSvgToPng(svg);
}

module.exports = {
  buildSlide5Svg,
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlide5,
};
