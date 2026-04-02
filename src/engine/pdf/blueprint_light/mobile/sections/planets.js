"use strict";

const { addPage, contentWidth, ensurePageSpace } = require("../../layout");
const {
  drawTextBlock,
  drawCenteredSymbolStack,
  sanitizeText,
  getGlyphAdjust,
} = require("../../core/components");
const { BODY_GLYPH, BODY_EN, SIGN_EN, SIGN_SYMBOL } = require("../../shared");
const { COLORS } = require("../../assets");
const { pickSymbolFontName } = require("../../symbols");
const { SPACE, TYPE, bumpFont } = require("../constants");
const { normalizeSymbol, buildParagraphs } = require("../formatters");

function renderMobilePlanetBlock({ doc, layout, row, text, labelOverride = "", enOverride = "" }) {
  const glyph = normalizeSymbol(row.glyph || BODY_GLYPH[row.key] || "");
  const signSymbol = normalizeSymbol(SIGN_SYMBOL[row.meta?.sign_key] || "");
  const label = sanitizeText(labelOverride || row.label || "");
  const enLabel = sanitizeText(enOverride || BODY_EN[row.key] || "");
  const title = `${label} — ${enLabel}`.trim();
  const signJa = row.meta?.sign_ja || "";
  const signEn = SIGN_EN[row.meta?.sign_key] || "";
  const mm = String(row.meta?.min ?? "").padStart(2, "0");
  const deg = Number.isFinite(row.meta?.deg) ? `${row.meta.deg}°${mm}’` : "";

  if (glyph) {
    const heroSymbolSize = 110;
    drawCenteredSymbolStack(doc, layout, { glyph, symbolSize: bumpFont(heroSymbolSize), gap: SPACE.sm });
  } else {
    layout.y += SPACE.lg;
  }
  layout.y += SPACE.xl;
  drawTextBlock(doc, layout, title, {
    font: "title",
    size: bumpFont(22),
    lineGap: SPACE.sm,
    marginAfter: SPACE.xs,
    align: "center",
  });
  const signLine = `${signJa} ${deg}`.trim();
  const signTail = signEn ? ` — ${signEn}` : "";
  const signSymbolSize = 18;
  const signTextSize = 16;
  const signEnSize = 12;
  const signFont = signSymbol ? doc._symbolUniversalFontName || pickSymbolFontName(doc, signSymbol) : null;
  const symbolW = signSymbol
    ? doc.font(signFont).fontSize(bumpFont(signSymbolSize)).widthOfString(signSymbol)
    : 0;
  const jaW = doc.font("title").fontSize(bumpFont(signTextSize)).widthOfString(signLine);
  const enW = signTail ? doc.font("note").fontSize(bumpFont(signEnSize)).widthOfString(signTail) : 0;
  const totalW = symbolW + (signSymbol ? SPACE.sm : 0) + jaW + enW;
  const startX = layout.x + (contentWidth(doc) - totalW) / 2;
  const y = layout.y;
  if (signSymbol) {
    const adjust = getGlyphAdjust(signSymbol, bumpFont(signSymbolSize));
    doc.font(signFont).fontSize(bumpFont(signSymbolSize)).fillColor(COLORS.textMainLight);
    doc.text(signSymbol, startX + adjust.x, y + adjust.y, { lineBreak: false });
  }
  let textX = startX + (signSymbol ? symbolW + SPACE.sm : 0);
  doc.font("title").fontSize(bumpFont(signTextSize)).fillColor(COLORS.textMainLight);
  doc.text(signLine, textX, y, { lineBreak: false });
  textX += jaW;
  if (signTail) {
    doc.font("note").fontSize(bumpFont(signEnSize)).fillColor(COLORS.textSub);
    doc.text(signTail, textX, y + 1, { lineBreak: false });
  }
  layout.y = y + doc.currentLineHeight(true) + SPACE.xl;
  if (row.fact_line) {
    drawTextBlock(doc, layout, row.fact_line, {
      font: "note",
      size: bumpFont(TYPE.meta),
      lineGap: Math.round(bumpFont(TYPE.meta) * 0.6),
      marginAfter: SPACE.lg,
      color: COLORS.textSub,
      align: "center",
    });
  } else {
    layout.y += SPACE.lg;
  }

  layout.y += SPACE.lg;

  const rawBodyText = sanitizeText(text || "");
  const paragraphs = buildParagraphs(rawBodyText).slice(0, 3);
  const bodyWidth = Math.round(contentWidth(doc) * 0.82);
  const bodyX = layout.x + (contentWidth(doc) - bodyWidth) / 2;
  const lineGap = Math.round(bumpFont(TYPE.body) * 0.6);
  const paragraphGap = SPACE.lg;
  doc.font("body").fontSize(bumpFont(15)).fillColor(COLORS.textMainLight);
  paragraphs.forEach((para, idx) => {
    const height = doc.heightOfString(para, { width: bodyWidth, align: "center", lineGap });
    const gap = idx < paragraphs.length - 1 ? paragraphGap : SPACE.lg;
    ensurePageSpace(doc, layout, height + gap);
    doc.text(para, bodyX, layout.y, { width: bodyWidth, align: "center", lineGap });
    layout.y = doc.y + gap;
  });
}

function renderMobilePlanetsIntro({ doc }) {
  const layout = addPage(doc);
  layout.y += SPACE.lg;
  const bg = [
    { glyph: "♇", size: 140, x: 0.5, y: 0.46, opacity: 0.05, rotate: 0 },
    { glyph: "☉", size: 86, x: 0.14, y: 0.18, opacity: 0.08, rotate: -12 },
    { glyph: "☽", size: 74, x: 0.86, y: 0.2, opacity: 0.06, rotate: 10 },
    { glyph: "☿", size: 56, x: 0.2, y: 0.6, opacity: 0.06, rotate: -8 },
    { glyph: "♀", size: 58, x: 0.82, y: 0.6, opacity: 0.06, rotate: 12 },
    { glyph: "♄", size: 66, x: 0.16, y: 0.82, opacity: 0.06, rotate: 0 },
    { glyph: "♇", size: 92, x: 0.86, y: 0.8, opacity: 0.07, rotate: 6 },
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
  drawTextBlock(doc, layout, "天体", {
    font: "title",
    size: bumpFont(27),
    lineGap: SPACE.sm,
    marginAfter: SPACE.xs,
    align: "center",
  });
  drawTextBlock(doc, layout, "Planets", {
    font: "title",
    size: bumpFont(14),
    lineGap: SPACE.sm,
    marginAfter: SPACE.sm,
    align: "center",
    color: COLORS.textSub,
  });
  drawTextBlock(doc, layout, "10 Bodies — Structural Descriptions", {
    font: "note",
    size: bumpFont(TYPE.meta) - 2,
    lineGap: SPACE.sm,
    marginAfter: SPACE.xl,
    align: "center",
    color: COLORS.textSub,
  });
  const glyphs = ["☉", "☽", "☿", "♀", "♂", "♃", "♄", "♅", "♆", "♇"];
  const glyphSize = 40;
  const glyphGap = 20;
  const totalHeight = glyphs.length * glyphSize + (glyphs.length - 1) * glyphGap;
  const startY = layout.y;
  const centerX = layout.x + contentWidth(doc) / 2;
  glyphs.forEach((g, idx) => {
    const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, g);
    doc.font(fontName).fontSize(bumpFont(glyphSize)).fillColor(COLORS.textSub);
    const w = doc.widthOfString(g);
    const y = startY + idx * (glyphSize + glyphGap);
    doc.text(g, centerX - w / 2, y, { lineBreak: false });
  });
}

function renderMobilePlanets({
  doc,
  rowsMain,
  rowsExtra,
  rowsAngles,
  bodyTextByKey,
  nodeText,
  chironText,
  lilithText,
  angleTextByKey,
}) {
  const chunkSize = 1;
  for (let i = 0; i < rowsMain.length; i += chunkSize) {
    const layout = addPage(doc);
    layout.y += SPACE.lg;
    const slice = rowsMain.slice(i, i + chunkSize);
    slice.forEach((row, idx) => {
      const text = bodyTextByKey?.get(row.key) || "";
      renderMobilePlanetBlock({ doc, layout, row, text });
      if (idx < slice.length - 1) {
        layout.y += 8;
      }
    });
  }

  const extraOrder = ["north_node", "south_node", "chiron", "lilith"];
  const angleOrder = ["asc", "mc", "ic", "dc"];
  const angleJa = { asc: "アセンダント", mc: "ミッドヘブン", ic: "イムム・コエリ", dc: "ディセンダント" };
  const angleEn = { asc: "ASC", mc: "MC", ic: "IC", dc: "DC" };

  extraOrder
    .map((key) => rowsExtra?.find((row) => row.key === key))
    .filter(Boolean)
    .forEach((row) => {
      const text =
        row.key === "north_node"
          ? nodeText?.north
          : row.key === "south_node"
            ? nodeText?.south
            : row.key === "chiron"
              ? chironText
              : lilithText;
      const body = sanitizeText(text || "") || "（本文は準備中）";
      const layout = addPage(doc);
      layout.y += SPACE.lg;
      renderMobilePlanetBlock({ doc, layout, row, text: body });
    });

  angleOrder
    .map((key) => rowsAngles?.find((row) => row.key === key))
    .filter(Boolean)
    .forEach((row) => {
      const body = sanitizeText(angleTextByKey?.[row.key] || "") || "（本文は準備中）";
      const layout = addPage(doc);
      layout.y += SPACE.lg;
      renderMobilePlanetBlock({
        doc,
        layout,
        row,
        text: body,
        labelOverride: `${row.key.toUpperCase()} ${angleJa[row.key] || row.label || ""}`.trim(),
        enOverride: angleEn[row.key] || "",
      });
    });
}

module.exports = {
  renderMobilePlanetsIntro,
  renderMobilePlanets,
};
