"use strict";

const { BODY_EN, SIGN_EN, SIGN_SYMBOL } = require("../../shared");
const { addPage, contentWidth, keepTogether } = require("../layout");
const {
  drawTextBlock,
  addOutlineItem,
  ensureBodyText,
  drawBilingualHeading,
  drawSignBlock,
  measureSignBlockHeight,
  sanitizeText,
} = require("../typography");
const { pickSymbolFontName } = require("../symbols");
const { COLORS } = require("../assets");

function normalizeSymbol(glyph) {
  return String(glyph || "").replace(/\uFE0E|\uFE0F/g, "");
}

function renderPointsPage({ doc, rowsExtra, nodeText, chironText, lilithText, outlineDest }) {
  const layout = addPage(doc);
  if (outlineDest) {
    const prev = doc._outlineDest;
    doc.addNamedDestination(outlineDest);
    doc._outlineDest = outlineDest;
    addOutlineItem(doc, "影と軌道｜Shadow & Axis");
    doc._outlineDest = prev;
  } else {
    addOutlineItem(doc, "影と軌道｜Shadow & Axis");
  }
  drawBilingualHeading(doc, layout, {
    jp: "影と軌道",
    en: "Shadow & Axis",
  });

  const axisRows = [
    rowsExtra.find((r) => r.key === "north_node"),
    rowsExtra.find((r) => r.key === "south_node"),
  ].filter(Boolean);

  const shadowRows = [
    rowsExtra.find((r) => r.key === "chiron"),
    rowsExtra.find((r) => r.key === "lilith"),
  ].filter(Boolean);

  const estimateLineHeight = (fontName, size) => {
    doc.font(fontName).fontSize(size);
    return doc.currentLineHeight(true);
  };

  const drawSymbolTitle = ({ glyph, labelJa, labelEn }) => {
    const symbol = normalizeSymbol(glyph || "");
    const titleText = sanitizeText(`${labelJa || ""} — ${labelEn || ""}`);
    if (!symbol && !titleText) return;
    const fontName = symbol ? doc._symbolUniversalFontName || pickSymbolFontName(doc, symbol) : null;
    const symbolW = symbol ? doc.font(fontName).fontSize(16).widthOfString(symbol) : 0;
    const gap = symbol ? 6 : 0;
    const lineH = Math.max(
      symbol ? doc.font(fontName).fontSize(16).currentLineHeight(true) : 0,
      doc.font("title").fontSize(16).currentLineHeight(true)
    );
    keepTogether(doc, layout, lineH + 4);
    const y = layout.y;
    let x = layout.x;
    if (symbol) {
      doc.fillColor(COLORS.textMainLight);
      doc.font(fontName).fontSize(16).text(symbol, x, y, { lineBreak: false });
      x += symbolW + gap;
    }
    if (titleText) {
      doc.fillColor(COLORS.textMainLight);
      doc.font("title").fontSize(16).text(titleText, x, y, { lineBreak: false });
    }
    layout.y = y + lineH + 4;
  };

  const getBlockHeight = ({ glyph, labelJa, labelEn, signSymbol, signJa, signEn, degText, bodyText }) => {
    const width = contentWidth(doc);
    doc.font("title").fontSize(16);
    const titleText = `${labelJa || ""} — ${labelEn || ""}`.trim();
    const titleH = doc.heightOfString(titleText, { width, lineGap: 11 });
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
    return titleH + 4 + signH + bodyH + 20;
  };

  const drawBlocks = (rows) => {
    rows.forEach((row) => {
      const labelJa = sanitizeText(row.label || "");
      const labelEn = sanitizeText(BODY_EN[row.key] || "");
      const titleHeading = `${labelJa} — ${labelEn}`.trim();
      const signSymbol = normalizeSymbol(SIGN_SYMBOL[row.meta?.sign_key] || "");
      const signJa = sanitizeText(row.meta?.sign_ja || "");
      const signEn = sanitizeText(SIGN_EN[row.meta?.sign_key] || "");
      const mm = String(row.meta?.min ?? "").padStart(2, "0");
      const degText = Number.isFinite(row.meta?.deg) ? `${row.meta.deg}°${mm}’` : "";
      const text =
        row.key === "north_node"
          ? nodeText?.north
          : row.key === "south_node"
            ? nodeText?.south
            : row.key === "chiron"
              ? chironText
              : lilithText;
      const bodyText = ensureBodyText(text || "", { heading: titleHeading }) || "（本文は準備中）";
      const blockHeight = getBlockHeight({
        glyph: row.glyph,
        labelJa,
        labelEn,
        signSymbol,
        signJa,
        signEn,
        degText,
        bodyText,
      });
      keepTogether(doc, layout, blockHeight);
      drawSymbolTitle({ glyph: row.glyph, labelJa, labelEn });
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
  };

  const axisHeadingHeight =
    estimateLineHeight("title", 16) + estimateLineHeight("note", 11) + 2 + 16 +
    axisRows.reduce((sum, row) => {
      const labelJa = sanitizeText(row.label || "");
      const labelEn = sanitizeText(BODY_EN[row.key] || "");
      const titleHeading = `${labelJa} — ${labelEn}`.trim();
      const signSymbol = normalizeSymbol(SIGN_SYMBOL[row.meta?.sign_key] || "");
      const signJa = sanitizeText(row.meta?.sign_ja || "");
      const signEn = sanitizeText(SIGN_EN[row.meta?.sign_key] || "");
      const mm = String(row.meta?.min ?? "").padStart(2, "0");
      const degText = Number.isFinite(row.meta?.deg) ? `${row.meta.deg}°${mm}’` : "";
      const text = row.key === "north_node" ? nodeText?.north : nodeText?.south;
      const bodyText = ensureBodyText(text || "", { heading: titleHeading }) || "（本文は準備中）";
      return sum +
        getBlockHeight({ glyph: row.glyph, labelJa, labelEn, signSymbol, signJa, signEn, degText, bodyText });
    }, 0);
  keepTogether(doc, layout, axisHeadingHeight);
  drawBilingualHeading(doc, layout, {
    jp: "軸",
    en: "Axis",
    jpSize: 16,
    enSize: 12,
    jpGap: 2,
    marginAfter: 18,
    colorJp: COLORS.textSub,
    colorEn: COLORS.textSub,
  });
  drawBlocks(axisRows);

  const shadowHeadingHeight =
    estimateLineHeight("title", 16) + estimateLineHeight("note", 11) + 2 + 16 +
    shadowRows.reduce((sum, row) => {
      const labelJa = sanitizeText(row.label || "");
      const labelEn = sanitizeText(BODY_EN[row.key] || "");
      const titleHeading = `${labelJa} — ${labelEn}`.trim();
      const signSymbol = normalizeSymbol(SIGN_SYMBOL[row.meta?.sign_key] || "");
      const signJa = sanitizeText(row.meta?.sign_ja || "");
      const signEn = sanitizeText(SIGN_EN[row.meta?.sign_key] || "");
      const mm = String(row.meta?.min ?? "").padStart(2, "0");
      const degText = Number.isFinite(row.meta?.deg) ? `${row.meta.deg}°${mm}’` : "";
      const text = row.key === "chiron" ? chironText : lilithText;
      const bodyText = ensureBodyText(text || "", { heading: titleHeading }) || "（本文は準備中）";
      return sum +
        getBlockHeight({ glyph: row.glyph, labelJa, labelEn, signSymbol, signJa, signEn, degText, bodyText });
    }, 0);
  keepTogether(doc, layout, shadowHeadingHeight);
  drawBilingualHeading(doc, layout, {
    jp: "影",
    en: "Shadow",
    jpSize: 16,
    enSize: 12,
    jpGap: 2,
    marginAfter: 18,
    colorJp: COLORS.textSub,
    colorEn: COLORS.textSub,
  });
  drawBlocks(shadowRows);
}

module.exports = {
  renderPointsPage,
};
