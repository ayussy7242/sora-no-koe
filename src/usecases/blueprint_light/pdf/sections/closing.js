"use strict";

const { addPage, contentWidth, ensurePageSpace } = require("../layout");
const { drawTextBlock, addOutlineItem, drawBilingualHeading, getGlyphAdjust, sanitizeText } = require("../typography");
const { pickSymbolFontName } = require("../symbols");
const { COLORS } = require("../assets");

const CLOSING_SYMBOLS = ["☽", "♄"];

function drawSymbolRow(doc, layout, symbols, { size = 48, gap = 6, offsetY = 0 } = {}) {
  const cx = layout.x + contentWidth(doc) / 2;
  const y = layout.y + offsetY;
  const [leftGlyph, rightGlyph] = symbols;
  const leftFont = pickSymbolFontName(doc, leftGlyph);
  const rightFont = pickSymbolFontName(doc, rightGlyph);
  doc.font(leftFont).fontSize(size);
  const leftW = doc.widthOfString(leftGlyph);
  doc.font(rightFont).fontSize(size);
  const rightW = doc.widthOfString(rightGlyph);
  const totalW = leftW + gap + rightW;
  let x = cx - totalW / 2;
  doc.fillColor(COLORS.textMainLight);
  doc.font(leftFont).fontSize(size);
  const leftAdjust = getGlyphAdjust(leftGlyph, size);
  doc.text(leftGlyph, x + leftAdjust.x, y + leftAdjust.y, { lineBreak: false });
  x += leftW + gap;
  doc.font(rightFont).fontSize(size);
  const rightAdjust = getGlyphAdjust(rightGlyph, size);
  doc.text(rightGlyph, x + rightAdjust.x, y + rightAdjust.y - 1, { lineBreak: false });
  layout.y = y + doc.currentLineHeight(true);
}

function splitSentences(text) {
  return String(text || "")
    .replace(/([。！？])/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function renderClosingPage({ doc, closingText, outlineDest }) {
  const layout = addPage(doc);
  if (outlineDest) {
    const prev = doc._outlineDest;
    doc.addNamedDestination(outlineDest);
    doc._outlineDest = outlineDest;
    addOutlineItem(doc, "全体統括｜Closing");
    doc._outlineDest = prev;
  } else {
    addOutlineItem(doc, "全体統括｜Closing");
  }

  drawBilingualHeading(doc, layout, {
    jp: "全体統括",
    en: "Closing",
    align: "center",
  });
  layout.y += 14;

  const safeText = sanitizeText(closingText || "");
  const sentences = splitSentences(safeText);
  const paragraphs = [];
  if (safeText.includes("\n")) {
    safeText
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((block) => {
        paragraphs.push(block.replace(/\n+/g, ""));
      });
  } else {
    for (let i = 0; i < sentences.length; i += 2) {
      const block = sentences.slice(i, i + 2).join("");
      if (block) paragraphs.push(block);
    }
  }

  drawSymbolRow(doc, layout, CLOSING_SYMBOLS, { size: 48, gap: 6, offsetY: 2 });
  layout.y += 22;

  const bodyWidth = Math.round(contentWidth(doc) * 0.6);
  const bodyX = layout.x + (contentWidth(doc) - bodyWidth) / 2;
  const lineGap = 9;
  const paragraphGap = 10;
  doc.font("body").fontSize(10).fillColor(COLORS.textMainLight);
  paragraphs.forEach((para, idx) => {
    const height = doc.heightOfString(para, { width: bodyWidth, align: "center", lineGap });
    const gap = idx < paragraphs.length - 1 ? paragraphGap : 20;
    ensurePageSpace(doc, layout, height + gap);
    doc.text(para, bodyX, layout.y, { width: bodyWidth, align: "center", lineGap });
    layout.y = doc.y + gap;
  });

  layout.y += 16;
  drawTextBlock(doc, layout, "星は語る。\n解釈はあなたのもの。", {
    font: "body",
    size: 10,
    lineGap: 6,
    marginAfter: 0,
    color: COLORS.textMainLight,
    align: "center",
  });
}

module.exports = {
  renderClosingPage,
};
