"use strict";

const { addPage, contentWidth } = require("../../layout");
const { drawTextBlock, sanitizeText, getGlyphAdjust } = require("../../core/components");
const { BODY_GLYPH } = require("../../shared");
const { COLORS } = require("../../assets");
const { pickSymbolFontName } = require("../../symbols");
const { SPACE, TYPE, bumpFont } = require("../constants");
const { normalizeSymbol } = require("../formatters");
const { drawMobileHoroscopeCircle } = require("../components/horoscope_circle");

function renderMobileCover({ doc, displayName, birthText, rowsMain }) {
  const layout = addPage(doc);
  layout.y += SPACE.md;
  const glyphs = ["☉", "☽", "☿", "♀", "♂", "♃", "♄", "♅", "♆", "♇"];
  const glyphSize = 18;
  const glyphGap = SPACE.md;
  const rows = Array.isArray(rowsMain) ? rowsMain : [];
  const signCounts = rows.reduce((acc, row) => {
    const key = row?.meta?.sign_key || "";
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const dominantSigns = Object.entries(signCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
  const rowGlyphs = rows
    .filter((row) => row?.key)
    .map((row) => ({
      signKey: row?.meta?.sign_key || "",
      glyph: normalizeSymbol(row?.glyph || BODY_GLYPH[row?.key] || ""),
    }))
    .filter((row) => row.glyph);
  const highlightRows = [];
  dominantSigns.forEach((signKey) => {
    rowGlyphs
      .filter((row) => row.signKey === signKey)
      .forEach((row) => {
        if (highlightRows.length < 2) highlightRows.push(row);
      });
  });
  rowGlyphs.forEach((row) => {
    if (highlightRows.length < 2) highlightRows.push(row);
  });
  const highlightGlyphs = highlightRows.length
    ? highlightRows.slice(0, 2).map((row) => row.glyph)
    : ["☉", "☽"];
  doc.save();
  const glyphFont = doc._symbolUniversalFontName || pickSymbolFontName(doc, glyphs[0]);
  doc.font(glyphFont).fontSize(bumpFont(glyphSize)).fillColor(COLORS.textSub);
  const widths = glyphs.map((g) => doc.widthOfString(g));
  const total = widths.reduce((sum, w) => sum + w, 0) + glyphGap * (glyphs.length - 1);
  let gx = layout.x + (contentWidth(doc) - total) / 2;
  const gy = layout.y;
  glyphs.forEach((g, idx) => {
    const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, g);
    doc.font(fontName).fontSize(bumpFont(glyphSize)).fillColor(COLORS.textSub);
    doc.text(g, gx, gy, { lineBreak: false });
    gx += widths[idx] + glyphGap;
  });
  if (highlightGlyphs.length) {
    const hiSize = bumpFont(glyphSize + 10);
    const hiGap = 10;
    const hiWidths = highlightGlyphs.map((g) => doc.font(glyphFont).fontSize(hiSize).widthOfString(g));
    const hiTotal = hiWidths.reduce((sum, w) => sum + w, 0) + hiGap * (highlightGlyphs.length - 1);
    let hx = layout.x + (contentWidth(doc) - hiTotal) / 2;
    const hy = gy + bumpFont(glyphSize) + SPACE.sm;
    highlightGlyphs.forEach((g, idx) => {
      const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, g);
      doc.font(fontName).fontSize(hiSize).fillColor(COLORS.textMainLight);
      const adjust = getGlyphAdjust(g, hiSize);
      doc.text(g, hx + adjust.x, hy + adjust.y, { lineBreak: false });
      hx += hiWidths[idx] + hiGap;
    });
    layout.y = hy + hiSize + SPACE.lg;
  } else {
    layout.y += bumpFont(glyphSize) + SPACE.lg;
  }

  drawTextBlock(doc, layout, "Blueprint Light", {
    font: "title",
    size: bumpFont(TYPE.title) - 2,
    lineGap: SPACE.sm,
    marginAfter: SPACE.xs,
    align: "center",
  });
  drawTextBlock(doc, layout, "Mobile", {
    font: "note",
    size: bumpFont(TYPE.h2) - 2,
    lineGap: SPACE.sm,
    marginAfter: SPACE.xs,
    align: "center",
    color: COLORS.textSub,
  });
  drawTextBlock(doc, layout, "Structure in Motion", {
    font: "note",
    size: bumpFont(TYPE.meta) - 2,
    lineGap: SPACE.sm,
    marginAfter: SPACE.md,
    align: "center",
    color: COLORS.textSub,
  });

  if (displayName) {
    layout.y += SPACE.lg;
    drawTextBlock(doc, layout, displayName, {
      font: "note",
      size: bumpFont(TYPE.meta),
      lineGap: SPACE.sm,
      marginAfter: SPACE.xs,
      align: "center",
      color: COLORS.textSub,
    });
  }
  const openingText = sanitizeText("あなたの星の構造を\n可視化した記録です。");
  const openingSize = 12;
  const openingWidth = Math.round(contentWidth(doc) * 0.88);
  const openingX = layout.x + (contentWidth(doc) - openingWidth) / 2;
  doc.font("body").fontSize(bumpFont(openingSize)).fillColor(COLORS.textSub);
  const openingHeight = doc.heightOfString(openingText, {
    width: openingWidth,
    align: "center",
    lineGap: 6,
  });
  const compactBirth = birthText ? sanitizeText(birthText).replace(/\s*\n+\s*/g, " / ") : "";
  const birthSize = bumpFont(TYPE.meta) - 2;
  const birthWidth = Math.round(contentWidth(doc) * 0.9);
  const birthHeight = compactBirth
    ? doc.heightOfString(compactBirth, { width: birthWidth, align: "center", lineGap: 6 })
    : 0;

  const headerBottom = layout.y;
  const centerX = doc.page.width / 2;
  const baseRadius = Math.min(doc.page.width * 0.38, doc.page.height * 0.26);
  const desiredRadius = baseRadius * 0.9;
  const bottomPad = doc._layoutPadBottom || 0;
  const circleTop = headerBottom + SPACE.md;
  const regionBottom = doc.page.height - bottomPad;
  const gapAfterCircle = SPACE.xl;
  const maxRadius = Math.max(0, (regionBottom - circleTop - gapAfterCircle - openingHeight - birthHeight) / 2);
  const radius = Math.max(baseRadius * 0.85, Math.min(desiredRadius, maxRadius));
  const centerY = circleTop + radius;
  const birthY = compactBirth ? Math.max(circleTop, regionBottom - birthHeight) : regionBottom;
  const openingTextY = Math.min(birthY - SPACE.lg - openingHeight, centerY + radius + gapAfterCircle);

  doc.save();
  drawMobileHoroscopeCircle({ doc, centerX, centerY, radius, rowsMain });
  doc.restore();
  doc.font("body").fontSize(bumpFont(openingSize)).fillColor(COLORS.textSub);
  doc.text(openingText, openingX, openingTextY, { width: openingWidth, align: "center", lineGap: 6 });
  if (compactBirth) {
    doc.font("note").fontSize(birthSize).fillColor(COLORS.textSub);
    const birthX = layout.x + (contentWidth(doc) - birthWidth) / 2;
    doc.text(compactBirth, birthX, birthY, { width: birthWidth, align: "center", lineGap: 6 });
  }
}

module.exports = {
  renderMobileCover,
};
