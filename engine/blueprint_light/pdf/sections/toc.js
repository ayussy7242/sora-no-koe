"use strict";

const { addPage, contentWidth, ensurePageSpace } = require("../layout");
const { drawTextBlock, addOutlineItem, drawBilingualHeading, sanitizeText } = require("../typography");
const { COLORS } = require("../assets");

function renderTocPage({ doc, items }) {
  const layout = addPage(doc);
  addOutlineItem(doc, "目次｜Contents");
  drawBilingualHeading(doc, layout, {
    jp: "目次",
    en: "Contents",
  });
  const width = contentWidth(doc);
  (items || []).forEach((item) => {
    const text = sanitizeText(`${item.no}  ${item.title}`);
    if (!text) return;
    doc.font("title").fontSize(13);
    const lineGap = 22;
    const height = doc.heightOfString(text, { width, lineGap });
    ensurePageSpace(doc, layout, height + 6);
    const x = layout.x;
    const y = layout.y;
    doc.fillColor(COLORS.textMainLight);
    doc.text(text, x, y, { width, lineGap });
    if (item.dest) {
      doc.goTo(x, y, width, height, item.dest, { Border: [0, 0, 0] });
    }
    layout.y = doc.y + 32;
  });
}

module.exports = {
  renderTocPage,
};
