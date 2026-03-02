"use strict";

const { addPage, keepTogether, contentWidth, ensurePageSpace } = require("../layout");
const {
  drawTextBlock,
  addOutlineItem,
  drawSymbolValueLine,
  drawBilingualHeading,
} = require("../typography");
const { COLORS } = require("../assets");
const { stripCountsLine } = require("../formatters");

function renderStructureSummaryPage({ doc, element, modality, summary, outlineDest }) {
  const layout = addPage(doc);
  if (outlineDest) {
    const prev = doc._outlineDest;
    doc.addNamedDestination(outlineDest);
    doc._outlineDest = outlineDest;
    addOutlineItem(doc, "構造｜Structure");
    doc._outlineDest = prev;
  } else {
    addOutlineItem(doc, "構造｜Structure");
  }
  drawBilingualHeading(doc, layout, {
    jp: "構造",
    en: "Structure",
  });

  const estimateLineHeight = (fontName, size) => {
    doc.font(fontName).fontSize(size);
    return doc.currentLineHeight(true);
  };

  const ensureSectionBlock = (text) => {
    const headingH = estimateLineHeight("title", 16) + 36;
    const valueH = estimateLineHeight("title", 15) + 18;
    const bodyH = text
      ? doc.font("body").fontSize(13).heightOfString(text, { width: contentWidth(doc), lineGap: 10 })
      : 0;
    const bodyGap = text ? 12 : 0;
    keepTogether(doc, layout, headingH + valueH + bodyH + bodyGap);
  };

  const drawInlineSubheading = (jp, en) => {
    const jpText = `${jp}|`;
    const jpSize = 16;
    const enSize = 11;
    doc.font("title").fontSize(jpSize);
    const lineHeight = doc.currentLineHeight(true);
    ensurePageSpace(doc, layout, lineHeight + 44);
    const y = layout.y;
    const centerX = layout.x + contentWidth(doc) / 2;
    doc.fillColor(COLORS.textMainLight);
    doc.font("title").fontSize(jpSize);
    const jpW = doc.widthOfString(jpText);
    doc.text(jpText, centerX - jpW, y, { lineBreak: false });
    doc.fillColor(COLORS.textSub);
    doc.font("note").fontSize(enSize);
    const enW = doc.widthOfString(en);
    doc.text(en, centerX + 6, y, { lineBreak: false });
    layout.y = y + lineHeight + 44;
  };

  const elementText = stripCountsLine(summary?.element?.text || "");
  ensureSectionBlock(elementText);
  layout.y = Math.max(layout.y - 2, 0);
  drawInlineSubheading("元素", "Elements");
  drawSymbolValueLine(
    doc,
    layout,
    [
      { symbol: "☉", label: "火", value: element.fire },
      { symbol: "♄", label: "地", value: element.earth },
      { symbol: "☿", label: "風", value: element.air },
      { symbol: "☽", label: "水", value: element.water },
    ],
    { fontSize: 15, lineGap: 12, separator: "　　" }
  );
  layout.y += 2;
  if (elementText) {
    drawTextBlock(doc, layout, elementText, {
      font: "body",
      size: 13,
      lineGap: 10,
      marginAfter: 12,
    });
  }

  const modalityText = stripCountsLine(summary?.modality?.text || "");
  ensureSectionBlock(modalityText);
  layout.y = Math.max(layout.y - 2, 0);
  drawInlineSubheading("三区分", "Modalities");
  drawSymbolValueLine(
    doc,
    layout,
    [
      { symbol: "♂", label: "活動", value: modality.cardinal },
      { symbol: "♄", label: "不動", value: modality.fixed },
      { symbol: "☿", label: "柔軟", value: modality.mutable },
    ],
    { fontSize: 15, lineGap: 12, separator: "　　" }
  );
  layout.y += 2;
  if (modalityText) {
    drawTextBlock(doc, layout, modalityText, {
      font: "body",
      size: 13,
      lineGap: 10,
      marginAfter: 12,
    });
  }
}

module.exports = {
  renderStructureSummaryPage,
};
