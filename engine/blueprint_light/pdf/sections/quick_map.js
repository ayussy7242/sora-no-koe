"use strict";

const { BODY_EN, BODY_GLYPH, SIGN_SYMBOL, SIGN_EN } = require("../../shared");
const { addPage, ensurePageSpace, contentWidth, keepTogether } = require("../layout");
const {
  drawTextBlock,
  addOutlineItem,
  drawBilingualHeading,
  drawBilingualSubheading,
  getGlyphAdjust,
  sanitizeText,
} = require("../typography");
const { COLORS } = require("../assets");
const { pickSymbolFontName } = require("../symbols");

const SYMBOL_CELL = 22;
const SIGN_CELL = 22;
const SYMBOL_FONT_SIZE = 11;
const SIGN_FONT_SIZE = 11;
const ROW_FONT_SIZE = 14;
const ROW_EN_SIZE = 12;
const ROW_DEG_SIZE = 12;
const ANGLE_LABEL_JA = {
  asc: "アセンダント",
  mc: "ミッドヘブン",
  ic: "イムム・コエリ",
  dc: "ディセンダント",
};
const ANGLE_LABEL_EN = {
  asc: "ASC",
  mc: "MC",
  ic: "IC",
  dc: "DC",
};

function normalizeSymbol(glyph) {
  return String(glyph || "").replace(/\uFE0E|\uFE0F/g, "");
}

function renderQuickMapPage({ doc, rowsMain, rowsExtra, rowsAngles, outlineDest }) {
  const layout = addPage(doc);
  if (outlineDest) {
    const prev = doc._outlineDest;
    doc.addNamedDestination(outlineDest);
    doc._outlineDest = outlineDest;
    addOutlineItem(doc, "ネイタル構造原図");
    doc._outlineDest = prev;
  } else {
    addOutlineItem(doc, "ネイタル構造原図");
  }
  layout.y += 8;
  drawBilingualHeading(doc, layout, {
    jp: "ネイタル構造原図",
    en: "Natal Structural Blueprint",
    colorJp: COLORS.textMainLight,
    colorEn: COLORS.textSub,
  });

  const formatSignLine = (meta) => {
    const key = meta?.sign_key || "";
    const ja = meta?.sign_ja || "";
    const en = SIGN_EN[key] || "";
    const mm = String(meta?.min ?? "").padStart(2, "0");
    const deg = Number.isFinite(meta?.deg) ? `${meta.deg}°${mm}’` : "";
    return { signKey: key, ja, en, deg };
  };

  const estimateLineHeight = (fontName, size) => {
    doc.font(fontName).fontSize(size);
    return doc.currentLineHeight(true);
  };

  const drawLayerTitle = (jp, en, { topSpace = 0, rows = [], rowGap = 12 } = {}) => {
    const jpH = jp ? estimateLineHeight("title", 16) : 0;
    const enH = en ? estimateLineHeight("note", 11) : 0;
    const headingH = (jp ? jpH : 0) + (en ? enH : 0) + 2 + 16;
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    const rowH = rowCount ? (estimateLineHeight("title", ROW_FONT_SIZE) + rowGap) * rowCount : 0;
    keepTogether(doc, layout, topSpace + headingH + rowH);
    if (topSpace) layout.y += topSpace;
    drawBilingualSubheading(doc, layout, {
      jp,
      en,
      colorJp: COLORS.textSub,
      colorEn: COLORS.textSub,
    });
  };

  const measureTextWidth = (fontName, size, text) => {
    doc.font(fontName).fontSize(size);
    return doc.widthOfString(text || "");
  };

  const calcColumns = ({ labelJa, labelEn } = {}) => {
    const width = Math.round(contentWidth(doc) * 0.82);
    const cols = {
      symbol: SYMBOL_CELL,
      jp: 60,
      en: 70,
      signSymbol: SIGN_CELL,
      signJa: 56,
      signEn: 70,
      deg: 44,
    };
    if (labelJa) {
      cols.jp = Math.max(cols.jp, Math.ceil(measureTextWidth("title", ROW_FONT_SIZE, labelJa) + 4));
    }
    if (labelEn) {
      cols.en = Math.max(cols.en, Math.ceil(measureTextWidth("title", ROW_EN_SIZE, labelEn) + 4));
    }
    const used = cols.symbol + cols.jp + cols.en + cols.signSymbol + cols.signJa + cols.signEn + cols.deg;
    cols.total = Math.max(width, used);
    return cols;
  };

  const drawNatalRow = ({ glyph, labelJa, labelEn, meta, lineGap = 14, autoWidth = false }) => {
    const cols = calcColumns(autoWidth ? { labelJa, labelEn } : undefined);
    const signInfo = formatSignLine(meta);
    const signSymbol = normalizeSymbol(SIGN_SYMBOL[signInfo.signKey] || "");
    const glyphSymbol = normalizeSymbol(glyph || "");
    const safeLabelJa = sanitizeText(labelJa);
    const safeLabelEn = sanitizeText(labelEn);
    const safeSignJa = sanitizeText(signInfo.ja);
    const safeSignEn = sanitizeText(signInfo.en);
    const safeDeg = sanitizeText(signInfo.deg);
    const baseLine = doc.font("title").fontSize(ROW_FONT_SIZE).currentLineHeight(true);
    ensurePageSpace(doc, layout, baseLine + lineGap);
    const y = layout.y;
    let x = layout.x;

    if (glyphSymbol) {
      const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, glyphSymbol);
      doc.font(fontName).fontSize(SYMBOL_FONT_SIZE).fillColor(COLORS.textMainLight);
      const w = doc.widthOfString(glyphSymbol);
      const adjust = getGlyphAdjust(glyphSymbol, SYMBOL_FONT_SIZE);
      const xOffset = (cols.symbol - w) / 2 + adjust.x;
      const yOffset = adjust.y;
      doc.text(glyphSymbol, x + xOffset, y + yOffset, { lineBreak: false });
    }
    x += cols.symbol;

    const jpText = safeLabelEn ? `${safeLabelJa}  |  ` : `${safeLabelJa}　`;
    doc.font("title").fontSize(ROW_FONT_SIZE).fillColor(COLORS.textMainLight);
    doc.text(jpText, x, y, { lineBreak: false, width: cols.jp });
    x += cols.jp;

    if (safeLabelEn) {
      doc.font("title").fontSize(ROW_EN_SIZE).fillColor(COLORS.textSub);
      doc.text(safeLabelEn, x, y, { lineBreak: false, width: cols.en });
    }
    x += cols.en;

    if (signSymbol) {
      const signFont = doc._symbolUniversalFontName || pickSymbolFontName(doc, signSymbol);
      doc.font(signFont).fontSize(SIGN_FONT_SIZE).fillColor(COLORS.textMainLight);
      const w = doc.widthOfString(signSymbol);
      const adjust = getGlyphAdjust(signSymbol, SIGN_FONT_SIZE);
      const xOffset = (cols.signSymbol - w) / 2 + adjust.x;
      const yOffset = adjust.y;
      doc.text(signSymbol, x + xOffset, y + yOffset, { lineBreak: false });
    }
    x += cols.signSymbol;

    doc.font("title").fontSize(ROW_FONT_SIZE).fillColor(COLORS.textMainLight);
    doc.text(safeSignJa, x, y, { lineBreak: false, width: cols.signJa });
    x += cols.signJa;

    doc.font("title").fontSize(ROW_EN_SIZE).fillColor(COLORS.textSub);
    doc.text(safeSignEn, x, y, { lineBreak: false, width: cols.signEn });
    x += cols.signEn;

    doc.font("note").fontSize(ROW_DEG_SIZE).fillColor(COLORS.textSub);
    doc.text(safeDeg, x, y, { lineBreak: false, width: cols.deg, align: "left" });

    layout.y = y + baseLine + lineGap;
  };

  drawLayerTitle("第一層｜天体配置", "Celestial Positions", {
    rows: rowsMain,
    rowGap: 18,
  });
  rowsMain.forEach((row) => {
    drawNatalRow({
      glyph: row.glyph || "",
      labelJa: row.label || "",
      labelEn: BODY_EN[row.key] || "",
      meta: row.meta || {},
      lineGap: 18,
    });
  });

  drawLayerTitle("第二層｜影と傷", "Shadow & Wound Points", {
    topSpace: 28,
    rows: [rowsExtra.find((r) => r.key === "lilith"), rowsExtra.find((r) => r.key === "chiron")].filter(Boolean),
    rowGap: 14,
  });
  const lilith = rowsExtra.find((r) => r.key === "lilith");
  const chiron = rowsExtra.find((r) => r.key === "chiron");
  [lilith, chiron].filter(Boolean).forEach((row) => {
    drawNatalRow({
      glyph: row.glyph || "",
      labelJa: row.label || "",
      labelEn: BODY_EN[row.key] || "",
      meta: row.meta || {},
      lineGap: 14,
    });
  });

  drawLayerTitle("第三層｜進行軸", "Karmic Axis", {
    topSpace: 28,
    rows: [rowsExtra.find((r) => r.key === "north_node"), rowsExtra.find((r) => r.key === "south_node")].filter(
      Boolean
    ),
    rowGap: 14,
  });
  const north = rowsExtra.find((r) => r.key === "north_node");
  const south = rowsExtra.find((r) => r.key === "south_node");
  [north, south].filter(Boolean).forEach((row) => {
    drawNatalRow({
      glyph: row.glyph || "",
      labelJa: row.label || "",
      labelEn: BODY_EN[row.key] || "",
      meta: row.meta || {},
      lineGap: 14,
      autoWidth: true,
    });
  });

  drawLayerTitle("地平線と天頂", "Angles of Emergence", {
    topSpace: 28,
    rows: rowsAngles,
    rowGap: 14,
  });
  rowsAngles.forEach((row) => {
    const labelJa = ANGLE_LABEL_EN[row.key] || BODY_EN[row.key] || row.label;
    const labelEn = "";
    drawNatalRow({
      glyph: "",
      labelJa,
      labelEn,
      meta: row.meta || {},
      lineGap: 14,
    });
  });
}

module.exports = {
  renderQuickMapPage,
};
