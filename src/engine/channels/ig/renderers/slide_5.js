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
  ornament = "☉ ── ☽",
  brand = "sora-no-koe",
  dateLabel,
  miniCta = "link in bio",
  timeText = "毎朝 8:00",
  title = "今日の星の配置",
  subtitle = "あなたの星 × 今日の空",
  link = "link in bio",
} = {}) {
  const fields = [];
  const centerX = CANVAS.width / 2;
  const ornamentSize = 34;
  const timeSize = 36;
  const titleSize = 64;
  const subtitleSize = 54;
  const ctaSize = 34;
  const linkSize = 26;
  const timeTracking = 0.12;
  const linkTracking = 0.12;
  const blockShift = -40;
  const ornamentY = CANVAS.height / 2 - 260 + blockShift;
  const timeY = ornamentY + 140;
  const titleY = timeY + 120;
  const subtitleY = titleY + 120;
  const ctaY = subtitleY + 176;
  const linkY = ctaY + 64;
  const headerLines = wrapLines(header, 12, 2);
  const ctaLines = wrapLines(cta || "今日の空", 18, 2);
  const subLines = wrapLines(sub || "星の配置はLINEで配信中\nネイタル一覧も見れます", 18, 2);

  if (ornament) {
    const ornamentWidth = estimateTextWidth(ornament, ornamentSize);
    fields.push(makeField({
      x: centerX - ornamentWidth / 2,
      y: ornamentY - ornamentSize,
      w: ornamentWidth,
      h: ornamentSize * 1.2,
      pad: 16,
      weight: 0.7,
      kind: "meta",
    }));
    const timeWidth = estimateTextWidth(timeText, timeSize);
    fields.push(makeField({
      x: centerX - timeWidth / 2,
      y: timeY - timeSize,
      w: timeWidth,
      h: timeSize * 1.2,
      pad: 14,
      weight: 0.75,
      kind: "meta",
    }));
    const titleWidth = estimateTextWidth(title, titleSize);
    fields.push(makeField({
      x: centerX - titleWidth / 2,
      y: titleY - titleSize,
      w: titleWidth,
      h: titleSize * 1.2,
      pad: 18,
      weight: 0.95,
      kind: "heroText",
    }));
    const subtitleWidth = estimateTextWidth(subtitle, subtitleSize);
    fields.push(makeField({
      x: centerX - subtitleWidth / 2,
      y: subtitleY - subtitleSize,
      w: subtitleWidth,
      h: subtitleSize * 1.2,
      pad: 16,
      weight: 0.9,
      kind: "subtitle",
    }));
    const ctaWidth = estimateTextWidth(cta || "", ctaSize);
    if (ctaWidth) {
      fields.push(makeField({
        x: centerX - ctaWidth / 2,
        y: ctaY - ctaSize,
        w: ctaWidth,
        h: ctaSize * 1.2,
        pad: 12,
        weight: 0.8,
        kind: "subtitle",
      }));
    }
    const linkWidth = estimateTextWidth(link || "", linkSize);
    if (linkWidth) {
      fields.push(makeField({
        x: centerX - linkWidth / 2,
        y: linkY - linkSize,
        w: linkWidth,
        h: linkSize * 1.2,
        pad: 10,
        weight: 0.7,
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
  if (miniCta && !ornament) {
    const miniCtaSize = TOK.cta.miniCtaSize + 2;
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
  ornament = "☉ ── ☽",
  brand = "sora-no-koe",
  dateLabel,
  miniCta = "link in bio",
  timeText = "毎朝 8:00",
  title = "今日の星の配置",
  subtitle = "あなたの星 × 今日の空",
  link = "link in bio",
  space,
} = {}) {
  const colors = resolveColors(space);
  const centerX = CANVAS.width / 2;
  const ornamentSize = 34;
  const timeSize = 36;
  const titleSize = 64;
  const subtitleSize = 54;
  const ctaSize = 34;
  const linkSize = 26;
  const timeTracking = 0.12;
  const linkTracking = 0.12;
  const blockShift = -40;
  const ornamentY = CANVAS.height / 2 - 260 + blockShift;
  const timeY = ornamentY + 140;
  const titleY = timeY + 120;
  const subtitleY = titleY + 120;
  const ctaY = subtitleY + 176;
  const linkY = ctaY + 64;
  const headerLines = wrapLines(header, 12, 2);
  const ctaLines = wrapLines(cta, 18, 2);
  const subLines = wrapLines(sub, 18, 2);

  if (ornament) {
    const ornamentBlock =
      `<text x=\"${centerX}\" y=\"${ornamentY}\" text-anchor=\"middle\" fill=\"${colors.textMain}\" font-size=\"${ornamentSize}\" font-family=\"SoraTitle\" xml:space=\"preserve\">${escapeXml(ornament)}</text>`;

    const inner = [
      ornamentBlock,
      `<text x=\"${centerX}\" y=\"${timeY}\" text-anchor=\"middle\" fill=\"${colors.textSub}\" font-size=\"${timeSize}\" font-family=\"SoraTitle\" letter-spacing=\"${timeTracking}em\" opacity=\"0.75\">${escapeXml(timeText)}</text>`,
      `<text x=\"${centerX}\" y=\"${titleY}\" text-anchor=\"middle\" fill=\"${colors.textMain}\" font-size=\"${titleSize}\" font-family=\"SoraTitle\" font-weight=\"400\">${escapeXml(title)}</text>`,
      `<text x=\"${centerX}\" y=\"${subtitleY}\" text-anchor=\"middle\" fill=\"${colors.textSub}\" font-size=\"${subtitleSize}\" font-family=\"SoraTitle\" opacity=\"0.9\">${escapeXml(subtitle)}</text>`,
      `<text x=\"${centerX}\" y=\"${ctaY}\" text-anchor=\"middle\" fill=\"${colors.textSub}\" font-size=\"${ctaSize}\" font-family=\"SoraTitle\" opacity=\"0.85\">${escapeXml(cta)}</text>`,
      `<text x=\"${centerX}\" y=\"${linkY}\" text-anchor=\"middle\" fill=\"${colors.textDim}\" font-size=\"${linkSize}\" font-family=\"SoraTitle\" letter-spacing=\"${linkTracking}em\" opacity=\"0.45\">${escapeXml(link || miniCta)}</text>`,
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
