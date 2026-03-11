"use strict";

const { BODY_EN, SIGN_EN, SIGN_SYMBOL } = require("../shared");
const { addPage, contentWidth, keepTogether } = require("../layout");
const {
  drawTextBlock,
  addOutlineItem,
  ensureBodyText,
  drawBilingualHeading,
  drawSignBlock,
  measureSignBlockHeight,
} = require("../typography");
const { COLORS } = require("../assets");

const ANGLE_LABEL_JA = {
  asc: "アセンダント",
  mc: "ミッドヘブン",
  ic: "イムム・コエリ",
  dc: "ディセンダント",
};

const ANGLE_LABEL_EN = {
  asc: "Ascendant",
  mc: "Midheaven",
  ic: "Imum Coeli",
  dc: "Descendant",
};

function normalizeSymbol(glyph) {
  return String(glyph || "").replace(/\uFE0E|\uFE0F/g, "");
}

function renderAnglesPage({ doc, rowsAngles, angleTextByKey, outlineDest }) {
  const layout = addPage(doc);
  if (outlineDest) {
    const prev = doc._outlineDest;
    doc.addNamedDestination(outlineDest);
    doc._outlineDest = outlineDest;
    addOutlineItem(doc, "軸｜Angles");
    doc._outlineDest = prev;
  } else {
    addOutlineItem(doc, "軸｜Angles");
  }
  drawBilingualHeading(doc, layout, {
    jp: "軸",
    en: "Angles",
  });
  const getBlockHeight = ({ title, enLabel, signSymbol, signJa, signEn, degText, bodyText }) => {
    const width = contentWidth(doc);
    doc.font("title").fontSize(16);
    const titleH = doc.heightOfString(title, { width, lineGap: 11 });
    doc.font("note").fontSize(12);
    const enH = enLabel ? doc.heightOfString(enLabel, { width, lineGap: 10 }) : 0;
    doc.font("body").fontSize(14);
    const bodyH = doc.heightOfString(bodyText, { width, lineGap: 11 });
    const signH = measureSignBlockHeight(doc, {
      signSymbol,
      signEn,
      symbolSize: 13,
      textSize: 13,
      enSize: 11,
      lineGap: 4,
      marginAfter: 12,
    });
    return titleH + 4 + enH + 4 + signH + bodyH + 20;
  };

  rowsAngles.forEach((row) => {
    const symbol = BODY_EN[row.key] || row.label || "";
    const jpLabel = ANGLE_LABEL_JA[row.key] || row.label || "";
    const enLabel = ANGLE_LABEL_EN[row.key] || symbol || "";
    const title = `${symbol}　${jpLabel}`.trim();
    const signSymbol = normalizeSymbol(SIGN_SYMBOL[row.meta?.sign_key] || "");
    const signJa = row.meta?.sign_ja || "";
    const signEn = SIGN_EN[row.meta?.sign_key] || "";
    const mm = String(row.meta?.min ?? "").padStart(2, "0");
    const degText = Number.isFinite(row.meta?.deg) ? `${row.meta.deg}°${mm}’` : "";
    const text = angleTextByKey?.get(row.key) || "";
    const bodyText = ensureBodyText(text || "", { heading: title }) || "（本文は準備中）";
    const blockHeight = getBlockHeight({ title, enLabel, signSymbol, signJa, signEn, degText, bodyText });
    keepTogether(doc, layout, blockHeight);
    drawTextBlock(doc, layout, title, {
      font: "title",
      size: 16,
      lineGap: 11,
      marginAfter: 4,
      ensure: false,
    });
    drawTextBlock(doc, layout, enLabel, {
      font: "note",
      size: 12,
      lineGap: 10,
      marginAfter: 4,
      color: COLORS.textSub,
      ensure: false,
    });
    drawSignBlock(doc, layout, {
      signSymbol,
      signJa,
      signEn,
      degText,
      align: "left",
      symbolSize: 13,
      textSize: 13,
      enSize: 11,
      marginAfter: 12,
    });
    drawTextBlock(doc, layout, bodyText, {
      font: "body",
      size: 14,
      lineGap: 11,
      marginAfter: 20,
      ensure: false,
    });
  });
}

module.exports = {
  renderAnglesPage,
};
