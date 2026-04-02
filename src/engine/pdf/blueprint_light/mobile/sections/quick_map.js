"use strict";

const { addPage, contentWidth, ensurePageSpace } = require("../../layout");
const {
  drawTextBlock,
  drawBilingualHeading,
  sanitizeText,
  getGlyphAdjust,
} = require("../../core/components");
const { BODY_EN, SIGN_EN, SIGN_SYMBOL } = require("../../shared");
const { COLORS } = require("../../assets");
const { pickSymbolFontName } = require("../../symbols");
const { SPACE, TYPE, bumpFont } = require("../constants");
const { normalizeSymbol } = require("../formatters");
const { drawShapeSymbol } = require("../components/shape_symbol");

function drawMobileQuickMapBlock(
  doc,
  layout,
  { glyph, shape, labelJa, labelEn, meta, blockGap = 16, labelColWidth = 0, signColWidth = 0 }
) {
  const glyphSize = 31;
  const signSize = 23;
  const jpSize = 17;
  const enSize = 9;
  const lineGap = 9;
  const glyphCell = 34;
  const glyphYOffset = -1.2;
  const signYOffset = -1.2;
  const enYOffset = 2;

  const signSymbol = normalizeSymbol(SIGN_SYMBOL[meta?.sign_key] || "");
  const signJa = sanitizeText(meta?.sign_ja || "");
  const signEn = sanitizeText(SIGN_EN[meta?.sign_key] || "");
  const mm = String(meta?.min ?? "").padStart(2, "0");
  const deg = Number.isFinite(meta?.deg) ? `${meta.deg}°${mm}’` : "";

  doc.font("title").fontSize(bumpFont(jpSize));
  const line1H = doc.currentLineHeight(true);
  doc.font("note").fontSize(bumpFont(enSize));
  const line2H = doc.currentLineHeight(true);
  ensurePageSpace(doc, layout, line1H + line2H + lineGap + blockGap + enYOffset);

  const labelStart = layout.x + glyphCell + 6;
  let x = layout.x;
  const y1 = layout.y;
  if (shape) {
    drawShapeSymbol(doc, {
      x: x + (glyphCell - (glyphSize - 4)) / 2,
      y: y1 + glyphYOffset,
      size: glyphSize - 4,
      kind: shape.kind,
      filled: shape.filled,
    });
    x += glyphCell + 6;
  } else if (glyph) {
    const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, glyph);
    doc.font(fontName).fontSize(bumpFont(glyphSize)).fillColor(COLORS.textMainLight);
    const w = doc.widthOfString(glyph);
    const adjust = getGlyphAdjust(glyph, bumpFont(glyphSize));
    const gx = x + (glyphCell - w) / 2 + adjust.x;
    doc.text(glyph, gx, y1 + adjust.y + glyphYOffset, { lineBreak: false });
    x += glyphCell + 6;
  }
  const safeJa = sanitizeText(labelJa);
  const safeEn = sanitizeText(labelEn);
  doc.font("bold").fontSize(bumpFont(jpSize)).fillColor(COLORS.textMainLight);
  doc.text(safeJa, labelStart, y1, { lineBreak: false });
  const jpWidth = doc.widthOfString(safeJa);
  const enX = labelStart + Math.max(labelColWidth, jpWidth) + 8;
  if (safeEn) {
    doc.font("note").fontSize(bumpFont(enSize)).fillColor(COLORS.textSub);
    doc.text(` — ${safeEn}`, enX, y1 + enYOffset, { lineBreak: false });
  }

  const y2 = y1 + line1H + lineGap;
  const hasGlyph = Boolean(glyph);
  x = hasGlyph ? labelStart : layout.x;
  if (signSymbol) {
    const signFont = doc._symbolUniversalFontName || pickSymbolFontName(doc, signSymbol);
    doc.font(signFont).fontSize(bumpFont(signSize)).fillColor(COLORS.textMainLight);
    const w = doc.widthOfString(signSymbol);
    const adjust = getGlyphAdjust(signSymbol, bumpFont(signSize));
    const sx = hasGlyph ? labelStart - w - 6 + adjust.x : x + adjust.x;
    doc.text(signSymbol, sx, y2 + adjust.y + signYOffset, { lineBreak: false });
    if (!hasGlyph) {
      x = x + w + 6;
    }
  }
  doc.font("body").fontSize(bumpFont(jpSize - 1)).fillColor(COLORS.textMainLight);
  doc.text(signJa, x, y2, { lineBreak: false });
  const signWidth = doc.widthOfString(signJa);
  const tailX = x + Math.max(signColWidth, signWidth) + 8;
  let tail = "";
  if (deg && signEn) tail = `${deg} — ${signEn}`;
  else tail = [deg, signEn].filter(Boolean).join(" ");
  if (tail) {
    doc.font("note").fontSize(bumpFont(enSize)).fillColor(COLORS.textSub);
    doc.text(` ${tail}`, tailX, y2 + enYOffset, { lineBreak: false });
  }

  layout.y = y2 + line2H + blockGap + enYOffset;
}

function renderMobileQuickMap({ doc, rowsMain, rowsExtra, rowsAngles }) {
  let layout = addPage(doc);
  const blockGapMain = 50;
  const sectionGapMain = 52;
  const blockGapExtra = 50;
  const blockGapAngles = 58;
  const sectionGapExtra = 40;
  const measureLabelWidth = (rows) => {
    doc.font("bold").fontSize(bumpFont(16));
    return rows.reduce((max, row) => {
      const label = sanitizeText(row?.label || "");
      if (!label) return max;
      const w = doc.widthOfString(label);
      return Math.max(max, w);
    }, 0);
  };
  const measureSignWidth = (rows) => {
    doc.font("body").fontSize(bumpFont(15));
    return rows.reduce((max, row) => {
      const signJa = sanitizeText(row?.meta?.sign_ja || "");
      if (!signJa) return max;
      const w = doc.widthOfString(signJa);
      return Math.max(max, w);
    }, 0);
  };
  const labelColWidthMain = measureLabelWidth(rowsMain);
  const signColWidthMain = measureSignWidth(rowsMain);
  const allRows = [...rowsMain, ...rowsExtra, ...rowsAngles];
  const labelColWidth = measureLabelWidth(allRows);
  const signColWidth = measureSignWidth(allRows);
  const estimateBlockHeight = (gap = blockGapMain) => {
    doc.font("title").fontSize(bumpFont(16));
    const line1 = doc.currentLineHeight(true);
    doc.font("note").fontSize(bumpFont(11));
    const line2 = doc.currentLineHeight(true);
    return line1 + line2 + SPACE.xs + gap;
  };
  const drawSectionLabel = (label, { align = "left" } = {}) => {
    const minBlock = estimateBlockHeight();
    const headingHeight = doc.font("title").fontSize(bumpFont(18)).currentLineHeight(true) + SPACE.sm + SPACE.sm;
    ensurePageSpace(doc, layout, headingHeight + minBlock);
    drawTextBlock(doc, layout, label, { font: "title", size: bumpFont(18), marginAfter: SPACE.sm, align });
    layout.y += SPACE.sm;
  };
  drawBilingualHeading(doc, layout, {
    jp: "ネイタル構造原図",
    en: "Natal Structural Blueprint",
    align: "center",
    jpSize: bumpFont(27),
    enSize: bumpFont(14),
    marginAfter: 44,
  });

  drawSectionLabel("天体", { align: "center" });
  layout.y += 12;
  const colGap = SPACE.md;
  const colWidth = (contentWidth(doc) - colGap) / 2;
  doc.font("title").fontSize(bumpFont(16));
  const line1 = doc.currentLineHeight(true);
  doc.font("note").fontSize(bumpFont(11));
  const line2 = doc.currentLineHeight(true);
  const lineGap = 8;
  const drawRowsTwoCol = (rows, widths, gap) => {
    const blockHeight = line1 + line2 + lineGap + gap;
    for (let i = 0; i < rows.length; i += 2) {
      ensurePageSpace(doc, layout, blockHeight);
      const y = layout.y;
      const left = rows[i];
      const right = rows[i + 1];
      const drawAt = (x, row) => {
        if (!row) return;
        const local = { x, y };
        drawMobileQuickMapBlock(doc, local, {
          glyph: normalizeSymbol(row.glyph || ""),
          labelJa: row.label || "",
          labelEn: BODY_EN[row.key] || "",
          meta: row.meta || {},
          blockGap: gap,
          labelColWidth: widths.label,
          signColWidth: widths.sign,
        });
      };
      drawAt(layout.x, left);
      drawAt(layout.x + colWidth + colGap, right);
      layout.y = y + blockHeight;
    }
  };
  drawRowsTwoCol(rowsMain, { label: labelColWidthMain, sign: signColWidthMain }, blockGapMain);

  const lilith = rowsExtra.find((r) => r.key === "lilith");
  const chiron = rowsExtra.find((r) => r.key === "chiron");
  const hasExtras = lilith || chiron || rowsExtra.find((r) => r.key === "north_node") || rowsExtra.find((r) => r.key === "south_node") || rowsAngles.length;
  if (hasExtras) {
    layout = addPage(doc);
  }
  if (lilith || chiron) {
    drawSectionLabel("影と傷", { align: "center" });
    layout.y += 12;
    const rows = [lilith, chiron].filter(Boolean);
    const widths = { label: measureLabelWidth(rows), sign: measureSignWidth(rows) };
    drawRowsTwoCol(rows, widths, blockGapExtra);
    layout.y += sectionGapExtra;
  }

  const north = rowsExtra.find((r) => r.key === "north_node");
  const south = rowsExtra.find((r) => r.key === "south_node");
  if (north || south) {
    drawSectionLabel("進行軸", { align: "center" });
    layout.y += 12;
    const rows = [north, south].filter(Boolean);
    const widths = { label: measureLabelWidth(rows), sign: measureSignWidth(rows) };
    drawRowsTwoCol(rows, widths, blockGapExtra);
    layout.y += sectionGapExtra;
  }

  drawSectionLabel("軸", { align: "center" });
  layout.y += 12;
  const angleEn = { asc: "ASC", mc: "MC", ic: "IC", dc: "DC" };
  const angleShape = {
    asc: { kind: "triangle", filled: false },
    mc: { kind: "square", filled: false },
    ic: { kind: "circle", filled: false },
    dc: { kind: "diamond", filled: false },
  };
  const angleRows = rowsAngles.filter(Boolean);
  const angleWidths = { label: measureLabelWidth(angleRows), sign: measureSignWidth(angleRows) };
  for (let i = 0; i < angleRows.length; i += 2) {
    const y = layout.y;
    ensurePageSpace(doc, layout, estimateBlockHeight(blockGapAngles));
    const left = angleRows[i];
    const right = angleRows[i + 1];
    const drawAt = (x, row) => {
      if (!row) return;
      const local = { x, y };
      drawMobileQuickMapBlock(doc, local, {
        glyph: "",
        shape: angleShape[row.key],
        labelJa: row.label || "",
        labelEn: angleEn[row.key] || "",
        meta: row.meta || {},
        blockGap: blockGapAngles,
        labelColWidth: angleWidths.label,
        signColWidth: angleWidths.sign,
      });
    };
    drawAt(layout.x, left);
    drawAt(layout.x + colWidth + colGap, right);
    layout.y = y + estimateBlockHeight(blockGapExtra);
  }
}

module.exports = {
  renderMobileQuickMap,
};
