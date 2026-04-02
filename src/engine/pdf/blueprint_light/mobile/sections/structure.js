"use strict";

const { addPage, contentWidth } = require("../../layout");
const { drawBilingualHeading, drawTextBlock, sanitizeText } = require("../../core/components");
const { COLORS } = require("../../assets");
const { SPACE, TYPE, bumpFont } = require("../constants");
const { splitSentences, stripStructureSymbols, summarizeSentences } = require("../formatters");
const { drawStructureInlineLine } = require("../components/structure_inline");

function renderMobileStructure({ doc, element, modality, summary }) {
  const layout = addPage(doc);
  drawBilingualHeading(doc, layout, {
    jp: "構造",
    en: "Structure",
    align: "center",
    jpSize: bumpFont(TYPE.h1),
    enSize: bumpFont(TYPE.meta),
    marginAfter: SPACE.lg,
  });

  const elementText = summarizeSentences(stripStructureSymbols(sanitizeText(summary?.element?.text || "")), 3);
  layout.y += SPACE.md;
  drawTextBlock(doc, layout, "元素 | Elements", {
    font: "title",
    size: bumpFont(TYPE.h2) - 1,
    marginAfter: SPACE.md,
    color: COLORS.textSub,
    align: "center",
  });
  const elementItems = [
    { label: "火", value: element.fire, shape: "triangle", filled: true },
    { label: "地", value: element.earth, shape: "square", filled: true },
    { label: "風", value: element.air, shape: "diamond", filled: true },
    { label: "水", value: element.water, shape: "circle", filled: true },
  ];
  const dominantElement =
    elementItems.reduce((best, item) => (item.value ?? 0) > (best.value ?? 0) ? item : best, elementItems[0]) ||
    elementItems[0];
  const heroNumberSize = 84;
  const heroLabelSize = 10;
  doc.font("title").fontSize(bumpFont(heroNumberSize)).fillColor(COLORS.textMainLight);
  const heroNum = String(dominantElement?.value ?? 0);
  const heroW = doc.widthOfString(heroNum);
  doc.text(heroNum, layout.x + (contentWidth(doc) - heroW) / 2, layout.y, { lineBreak: false });
  layout.y += doc.currentLineHeight(true) + SPACE.sm;
  doc.font("title").fontSize(bumpFont(heroLabelSize)).fillColor(COLORS.textSub);
  doc.text(dominantElement?.label || "", layout.x, layout.y, {
    width: contentWidth(doc),
    align: "center",
    lineBreak: false,
  });
  layout.y += doc.currentLineHeight(true) + SPACE.xl;
  drawStructureInlineLine(doc, layout, elementItems, { symbolSize: 10, textSize: 11, gap: 4 });
  layout.y += SPACE.xl;
  const elementLines = splitSentences(elementText).slice(0, 3);
  elementLines.forEach((line) => {
    drawTextBlock(doc, layout, line, {
      font: "body",
      size: bumpFont(TYPE.body),
      lineGap: Math.round(bumpFont(TYPE.body) * 0.6),
      marginAfter: SPACE.md,
      align: "center",
    });
  });
  layout.y += SPACE.md;

  const modalityText = summarizeSentences(stripStructureSymbols(sanitizeText(summary?.modality?.text || "")), 3);
  doc.save();
  doc.strokeColor(COLORS.textMainLight).strokeOpacity(0.2).lineWidth(0.5);
  doc.moveTo(layout.x, layout.y).lineTo(layout.x + contentWidth(doc), layout.y).stroke();
  doc.restore();
  layout.y += SPACE.lg + 12;
  drawTextBlock(doc, layout, "三区分 | Modalities", {
    font: "title",
    size: bumpFont(TYPE.h2) - 1,
    marginAfter: SPACE.md,
    color: COLORS.textSub,
    align: "center",
  });
  const modalityItems = [
    { label: "活動", value: modality.cardinal, shape: "triangle", filled: false },
    { label: "不動", value: modality.fixed, shape: "square", filled: false },
    { label: "柔軟", value: modality.mutable, shape: "circle", filled: false },
  ];
  const dominantModality =
    modalityItems.reduce((best, item) => (item.value ?? 0) > (best.value ?? 0) ? item : best, modalityItems[0]) ||
    modalityItems[0];
  doc.font("title").fontSize(bumpFont(heroNumberSize)).fillColor(COLORS.textMainLight);
  const modNum = String(dominantModality?.value ?? 0);
  const modW = doc.widthOfString(modNum);
  doc.text(modNum, layout.x + (contentWidth(doc) - modW) / 2, layout.y, { lineBreak: false });
  layout.y += doc.currentLineHeight(true) + SPACE.sm;
  doc.font("title").fontSize(bumpFont(heroLabelSize)).fillColor(COLORS.textSub);
  doc.text(dominantModality?.label || "", layout.x, layout.y, {
    width: contentWidth(doc),
    align: "center",
    lineBreak: false,
  });
  layout.y += doc.currentLineHeight(true) + SPACE.xl;
  drawStructureInlineLine(doc, layout, modalityItems, { symbolSize: 10, textSize: 11, gap: 4 });
  layout.y += SPACE.xl;
  const modalityLines = splitSentences(modalityText).slice(0, 3);
  modalityLines.forEach((line) => {
    drawTextBlock(doc, layout, line, {
      font: "body",
      size: bumpFont(TYPE.body),
      lineGap: Math.round(bumpFont(TYPE.body) * 0.6),
      marginAfter: SPACE.md,
      align: "center",
    });
  });
  layout.y += SPACE.md;
}

module.exports = {
  renderMobileStructure,
};
