"use strict";

const { COLORS } = require("../../assets");
const { contentWidth } = require("../../layout");
const { SPACE, bumpFont } = require("../constants");
const { drawShapeSymbol } = require("./shape_symbol");

function drawStructureInlineLine(doc, layout, items, { symbolSize = 14, textSize = 14, gap = 6 } = {}) {
  const safeItems = (items || []).filter(Boolean);
  if (!safeItems.length) return;
  doc.font("title").fontSize(bumpFont(textSize)).fillColor(COLORS.textMainLight);
  const sep = " / ";
  const sepW = doc.widthOfString(sep);
  const widths = safeItems.map((item) => {
    const text = `${item.label} ${item.value ?? 0}`.trim();
    const textW = doc.widthOfString(text);
    return { item, text, textW, width: symbolSize + gap + textW };
  });
  const totalW = widths.reduce((sum, entry) => sum + entry.width, 0) + sepW * (widths.length - 1);
  let x = layout.x + (contentWidth(doc) - totalW) / 2;
  const y = layout.y;
  widths.forEach((entry, idx) => {
    drawShapeSymbol(doc, {
      x,
      y: y - 1,
      size: symbolSize,
      kind: entry.item.shape,
      filled: entry.item.filled,
    });
    doc.font("title").fontSize(bumpFont(textSize)).fillColor(COLORS.textMainLight);
    doc.text(entry.text, x + symbolSize + gap, y, { lineBreak: false });
    x += entry.width;
    if (idx < widths.length - 1) {
      doc.text(sep, x, y, { lineBreak: false });
      x += sepW;
    }
  });
  layout.y = y + doc.currentLineHeight(true);
}

module.exports = {
  drawStructureInlineLine,
};
