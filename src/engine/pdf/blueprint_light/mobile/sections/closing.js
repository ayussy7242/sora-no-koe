"use strict";

const { addPage, contentWidth } = require("../../layout");
const {
  drawTextBlock,
  drawBilingualHeading,
  sanitizeText,
  getGlyphAdjust,
} = require("../../core/components");
const { SIGN_SYMBOL } = require("../../shared");
const { COLORS } = require("../../assets");
const { pickSymbolFontName } = require("../../symbols");
const { SPACE, TYPE, bumpFont } = require("../constants");
const { normalizeSymbol, buildParagraphs } = require("../formatters");

function renderMobileClosing({ doc, closingText, rowsMain }) {
  const paragraphs = buildParagraphs(sanitizeText(closingText || "")).slice(0, 3);
  const layout = addPage(doc);
  const signGlyphs = Array.from(
    new Set(
      (rowsMain || [])
        .map((row) => normalizeSymbol(SIGN_SYMBOL[row?.meta?.sign_key] || ""))
        .filter(Boolean)
    )
  );
  const fallbackSigns = ["♈", "♉", "♊", "♋", "♌", "♍"];
  const pool = signGlyphs.length ? signGlyphs : fallbackSigns;
  const pick = (idx) => pool[idx % pool.length];
  const bg = [
    { glyph: pick(0), size: 120, x: 0.2, y: 0.2, opacity: 0.05, rotate: -10 },
    { glyph: pick(1), size: 110, x: 0.78, y: 0.22, opacity: 0.05, rotate: 8 },
    { glyph: pick(2), size: 90, x: 0.22, y: 0.78, opacity: 0.05, rotate: 6 },
    { glyph: pick(3), size: 130, x: 0.8, y: 0.78, opacity: 0.04, rotate: -6 },
  ];
  bg.forEach((item) => {
    const x = doc.page.width * item.x;
    const y = doc.page.height * item.y;
    const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, item.glyph);
    doc.save();
    doc.fillColor(COLORS.textSub).fillOpacity(item.opacity);
    doc.translate(x, y);
    doc.rotate(item.rotate);
    doc.font(fontName).fontSize(bumpFont(item.size));
    doc.text(item.glyph, 0, 0, { lineBreak: false });
    doc.restore();
  });
  drawBilingualHeading(doc, layout, {
    jp: "全体統括",
    en: "Closing",
    align: "center",
    jpSize: bumpFont(27),
    enSize: bumpFont(14),
    marginAfter: SPACE.xl,
  });
  const rowGlyphs = (rowsMain || [])
    .map((row) => normalizeSymbol(SIGN_SYMBOL[row?.meta?.sign_key] || ""))
    .filter(Boolean);
  const rowPool = rowGlyphs.length ? rowGlyphs : signGlyphs.length ? signGlyphs : fallbackSigns;
  const rowGap = 8;
  const cellSize = Math.floor((contentWidth(doc) - rowGap * (rowPool.length - 1)) / Math.max(1, rowPool.length));
  const baseSize = Math.max(18, Math.min(32, cellSize - 2));
  const glyphSize = bumpFont(baseSize);
  const gY = layout.y + 8;
  const total = rowPool.length * cellSize + rowGap * (rowPool.length - 1);
  let gx = layout.x + (contentWidth(doc) - total) / 2;
  doc.save();
  doc.fillColor(COLORS.textSub).fillOpacity(0.45);
  rowPool.forEach((glyph) => {
    const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, glyph);
    doc.font(fontName).fontSize(glyphSize);
    const w = doc.widthOfString(glyph);
    const adjust = getGlyphAdjust(glyph, glyphSize);
    doc.text(glyph, gx + (cellSize - w) / 2 + adjust.x, gY + adjust.y, { lineBreak: false });
    gx += cellSize + rowGap;
  });
  doc.restore();
  layout.y = gY + glyphSize + SPACE.lg + 8;
  paragraphs.forEach((para, idx) => {
    drawTextBlock(doc, layout, para, {
      font: "body",
      size: bumpFont(TYPE.body),
      lineGap: Math.round(bumpFont(TYPE.body) * 0.6),
      marginAfter: idx < paragraphs.length - 1 ? SPACE.lg : SPACE.xl,
      align: "center",
    });
  });
  layout.y += SPACE.xxl + SPACE.xl + SPACE.lg;
  drawTextBlock(doc, layout, "星は語る。\n解釈はあなたのもの。", {
    font: "body",
    size: bumpFont(TYPE.body) + 2,
    lineGap: Math.round(bumpFont(TYPE.body) * 0.6),
    marginAfter: 0,
    align: "center",
    color: COLORS.textSub,
  });
}

module.exports = {
  renderMobileClosing,
};
