"use strict";

const { BODY_EN, BODY_GLYPH, SIGN_SYMBOL, SIGN_EN, BODY_ORDER_MAIN } = require("../shared");
const { addPage, contentWidth, ensurePageSpace } = require("../layout");
const {
  drawTextBlock,
  addOutlineItem,
  ensureBodyText,
  drawCenteredSymbolStack,
  drawBilingualHeading,
  getGlyphAdjust,
  drawSignBlock,
} = require("../typography");
const { COLORS } = require("../assets");
const { pickSymbolFontName } = require("../symbols");

function normalizeSymbol(glyph) {
  return String(glyph || "").replace(/\uFE0E|\uFE0F/g, "");
}

function renderPlanetsIntroPage({ doc, outlineDest }) {
  const layout = addPage(doc);
  if (outlineDest) {
    const prev = doc._outlineDest;
    doc.addNamedDestination(outlineDest);
    doc._outlineDest = outlineDest;
    addOutlineItem(doc, "天体｜Planets");
    doc._outlineDest = prev;
  } else {
    addOutlineItem(doc, "天体｜Planets");
  }
  drawBilingualHeading(doc, layout, {
    jp: "天体",
    en: "Planets",
    colorJp: COLORS.textMainLight,
    colorEn: COLORS.textSub,
    align: "center",
  });
  drawTextBlock(doc, layout, "10 Bodies — Structural Descriptions", {
    font: "noteBold",
    size: 14,
    lineGap: 10,
    marginAfter: 32,
    color: COLORS.textSub,
    align: "center",
  });

  const pageHeight = doc.page.height;
  const pageWidth = doc.page.width;
  const ringTop = layout.y + 8;
  const centerX = pageWidth / 2;
  const maxRadiusByHeight = Math.max((pageHeight * 0.85 - ringTop) / 2, 80);
  const radius = Math.min(pageWidth * 0.25, maxRadiusByHeight);
  const centerY = ringTop + radius;
  const step = (Math.PI * 2) / BODY_ORDER_MAIN.length;
  const startAngle = -Math.PI / 2;
  const glyphRadius = radius * 0.85;

  doc.save();
  doc.strokeColor(COLORS.textMainLight).strokeOpacity(0.22).lineWidth(0.8);
  doc.circle(centerX, centerY, radius).stroke();
  doc.restore();

  BODY_ORDER_MAIN.forEach((key, idx) => {
    const glyph = normalizeSymbol(BODY_GLYPH[key] || "");
    if (!glyph) return;
    const angle = startAngle + step * idx;
    const x = centerX + glyphRadius * Math.cos(angle);
    const y = centerY + glyphRadius * Math.sin(angle);
    const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, glyph);
    doc.save();
    doc.font(fontName).fontSize(16).fillColor(COLORS.textSub).fillOpacity(0.85);
    const w = doc.widthOfString(glyph);
    const h = doc.currentLineHeight(true);
    const adjust = getGlyphAdjust(glyph, 16);
    doc.text(glyph, x - w / 2 + adjust.x, y - h / 2 + adjust.y, { lineBreak: false });
    doc.restore();
  });
}

function renderPlanetPage({ doc, row, text }) {
  const layout = addPage(doc);
  const glyphSymbol = normalizeSymbol(BODY_GLYPH[row.key] || "");
  const signSymbol = normalizeSymbol(SIGN_SYMBOL[row.meta?.sign_key] || "");
  const title = `${row.label} — ${BODY_EN[row.key] || ""}`.trim();
  addOutlineItem(doc, BODY_EN[row.key] || row.label);
  const signJa = row.meta?.sign_ja || "";
  const signEn = SIGN_EN[row.meta?.sign_key] || "";
  const mm = String(row.meta?.min ?? "").padStart(2, "0");
  const deg = Number.isFinite(row.meta?.deg) ? `${row.meta.deg}°${mm}’` : "";
  drawCenteredSymbolStack(doc, layout, {
    glyph: glyphSymbol,
    signSymbol: "",
    title: "",
    subtitle: "",
    symbolSize: 68,
  });

  drawTextBlock(doc, layout, title, {
    font: "title",
    size: 18,
    lineGap: 11,
    marginAfter: 6,
    color: COLORS.textMainLight,
    align: "center",
  });

  drawSignBlock(doc, layout, {
    signSymbol,
    signJa,
    signEn,
    degText: deg,
    align: "center",
    symbolSize: 14,
    textSize: 14,
    enSize: 11,
    marginAfter: 18,
  });

  const factLine = row.fact_line || "";
  if (factLine) {
    drawTextBlock(doc, layout, factLine, {
      font: "note",
      size: 11,
      lineGap: 10,
      marginAfter: 26,
      color: COLORS.textSub,
      align: "center",
    });
  }

  const rawBodyText = ensureBodyText(text || "", { heading: title }) || "（本文は準備中）";
  const manualParagraphs = rawBodyText.includes("\n")
    ? rawBodyText.split(/\n+/).map((chunk) => chunk.trim()).filter(Boolean)
    : null;
  const sentenceParagraphs = rawBodyText
    .replace(/([。！？])/g, "$1\n")
    .split("\n")
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const paragraphs = manualParagraphs && manualParagraphs.length ? manualParagraphs : sentenceParagraphs;
  const bodyWidth = Math.round(contentWidth(doc) * 0.7);
  const bodyX = layout.x + (contentWidth(doc) - bodyWidth) / 2;
  const lineGap = 13;
  const paragraphGap = 8;
  doc.font("body").fontSize(14).fillColor(COLORS.textMainLight);
  paragraphs.forEach((para, idx) => {
    const height = doc.heightOfString(para, { width: bodyWidth, align: "center", lineGap });
    const gap = idx < paragraphs.length - 1 ? paragraphGap : 20;
    ensurePageSpace(doc, layout, height + gap);
    doc.text(para, bodyX, layout.y, { width: bodyWidth, align: "center", lineGap });
    layout.y = doc.y + gap;
  });
}

module.exports = {
  renderPlanetsIntroPage,
  renderPlanetPage,
};
