"use strict";

const PDFDocument = require("pdfkit");

const { registerFonts } = require("./assets");
const { getLayoutConfig, applyLayoutConfig } = require("./core/layout");
const { initSymbolFonts } = require("./symbols");
const { addPage, contentWidth, ensurePageSpace } = require("./layout");
const {
  drawTextBlock,
  drawBilingualHeading,
  drawSignBlock,
  drawCenteredSymbolStack,
  getGlyphAdjust,
  sanitizeText,
} = require("./core/components");
const { BODY_EN, BODY_GLYPH, BODY_LABEL, SIGN_EN, SIGN_SYMBOL, SIGN_KEYS } = require("./shared");
const { COLORS } = require("./assets");
const { pickSymbolFontName } = require("./symbols");
const path = require("path");
const puppeteer = require("puppeteer");
const { buildBlueprintV25WireframeHtml, PAGE_WIDTH, PAGE_HEIGHT } = require("../blueprint_v25/wireframe");
const { buildBlueprintV25BgImages, buildStoryStub } = require("../blueprint_v25/backgrounds");

function normalizeSymbol(glyph) {
  return String(glyph || "").replace(/\uFE0E|\uFE0F/g, "");
}

function calcAscLon(rowsAngles = []) {
  const ascRow = Array.isArray(rowsAngles) ? rowsAngles.find((row) => row?.key === "asc") : null;
  const meta = ascRow?.meta;
  const signKey = meta?.sign_key;
  const idx = SIGN_KEYS.indexOf(String(signKey || ""));
  if (idx < 0) return null;
  const deg = Number(meta?.deg);
  if (!Number.isFinite(deg)) return null;
  const min = Number(meta?.min);
  const minPart = Number.isFinite(min) ? min / 60 : 0;
  return idx * 30 + deg + minPart;
}

function calcMcLon(rowsAngles = []) {
  const mcRow = Array.isArray(rowsAngles) ? rowsAngles.find((row) => row?.key === "mc") : null;
  const meta = mcRow?.meta;
  const signKey = meta?.sign_key;
  const idx = SIGN_KEYS.indexOf(String(signKey || ""));
  if (idx < 0) return null;
  const deg = Number(meta?.deg);
  if (!Number.isFinite(deg)) return null;
  const min = Number(meta?.min);
  const minPart = Number.isFinite(min) ? min / 60 : 0;
  return idx * 30 + deg + minPart;
}

const SPACE = Object.freeze({
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
});

const TYPE = Object.freeze({
  title: 28,
  h1: 20,
  h2: 16,
  body: 14.5,
  meta: 12,
  glyph: 40,
});

const FONT_BUMP = 1;
const bumpFont = (size) => size + FONT_BUMP;

const V25_SCALE = 1.1;
const V25_TITLE_SCALE = 1.2;

function drawShapeSymbol(doc, { x, y, size, kind, filled }) {
  const half = size / 2;
  doc.save();
  doc.lineWidth(1);
  if (filled) {
    doc.fillColor(COLORS.textMainLight).fillOpacity(0.9);
  } else {
    doc.strokeColor(COLORS.textMainLight).strokeOpacity(0.9);
  }
  if (kind === "triangle") {
    const top = y + 1;
    const left = x;
    const right = x + size;
    const bottom = y + size;
    doc.moveTo((left + right) / 2, top).lineTo(right, bottom).lineTo(left, bottom).closePath();
    filled ? doc.fill() : doc.stroke();
  } else if (kind === "square") {
    filled ? doc.rect(x, y + 1, size, size).fill() : doc.rect(x, y + 1, size, size).stroke();
  } else if (kind === "diamond") {
    const cx = x + half;
    const cy = y + half + 1;
    doc
      .moveTo(cx, cy - half)
      .lineTo(cx + half, cy)
      .lineTo(cx, cy + half)
      .lineTo(cx - half, cy)
      .closePath();
    filled ? doc.fill() : doc.stroke();
  } else {
    filled
      ? doc.circle(x + half, y + half + 1, half).fill()
      : doc.circle(x + half, y + half + 1, half).stroke();
  }
  doc.restore();
}

function splitSentences(text) {
  return String(text || "")
    .replace(/([。！？])/g, "$1\n")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripStructureSymbols(text) {
  return String(text || "")
    .replace(/[\u0000-\u001f\u007f\uFEFF\uFFFD]/g, "")
    .replace(/[▲■◆●△□◇○☒]/g, "")
    .replace(
      /(?:火|地|風|水)\s*\d+\s*[/／]\s*(?:火|地|風|水)\s*\d+\s*[/／]\s*(?:火|地|風|水)\s*\d+\s*[/／]\s*(?:火|地|風|水)\s*\d+/g,
      ""
    )
    .replace(
      /(?:火|地|風|水)\s*\d+\s*(?:火|地|風|水)\s*\d+\s*(?:火|地|風|水)\s*\d+\s*(?:火|地|風|水)\s*\d+/g,
      ""
    )
    .replace(
      /(?:活動|不動|柔軟)\s*\d+\s*[/／]\s*(?:活動|不動|柔軟)\s*\d+\s*[/／]\s*(?:活動|不動|柔軟)\s*\d+/g,
      ""
    )
    .replace(
      /(?:活動|不動|柔軟)\s*\d+\s*(?:活動|不動|柔軟)\s*\d+\s*(?:活動|不動|柔軟)\s*\d+/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

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

function summarizeSentences(text, limit) {
  const sentences = splitSentences(text);
  if (!sentences.length) return "";
  return sentences.slice(0, Math.max(1, limit)).join("");
}

function collectElementCounts(rowsMain = []) {
  const counts = { fire: 0, earth: 0, air: 0, water: 0 };
  rowsMain.forEach((row) => {
    const element = row?.meta?.element;
    if (element && counts[element] !== undefined) counts[element] += 1;
  });
  return counts;
}

function collectModalityCounts(rowsMain = []) {
  const counts = { cardinal: 0, fixed: 0, mutable: 0 };
  rowsMain.forEach((row) => {
    const modality = row?.meta?.modality;
    if (modality && counts[modality] !== undefined) counts[modality] += 1;
  });
  return counts;
}

function buildParagraphs(text) {
  const raw = String(text || "").replace(/\r/g, "").trim();
  if (!raw) return [];
  const blocks = raw
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+/g, " ").trim())
    .filter(Boolean);
  if (blocks.length > 1) return blocks;
  const sentences = splitSentences(raw);
  return sentences.map((sentence) => {
    const first = sentence.indexOf("、");
    if (first < 0) return sentence;
    const second = sentence.indexOf("、", first + 1);
    if (second < 0) return sentence;
    return `${sentence.slice(0, first + 1)}\n${sentence.slice(first + 1).trim()}`;
  });
}

function drawMobileHoroscopeCircle({ doc, centerX, centerY, radius, rowsMain }) {
  const outerWidth = 0.4;
  const zodiacRadius = radius * 0.9;
  const planetRadius = radius * 0.62;
  const zodiacSize = 14;
  const planetSize = 14;
  const step = (Math.PI * 2) / 12;
  const startAngle = -Math.PI / 2;

  const minSepDeg = 4.0;
  const points = (rowsMain || [])
    .map((row) => {
      const signKey = row?.meta?.sign_key || "";
      const signIndex = SIGN_KEYS.indexOf(signKey);
      if (!row?.key || signIndex < 0) return null;
      const deg = Number(row?.meta?.deg || 0);
      const min = Number(row?.meta?.min || 0);
      const within = deg + min / 60;
      const angleDeg = signIndex * 30 + within;
      return { key: row.key, angleDeg };
    })
    .filter(Boolean)
    .sort((a, b) => a.angleDeg - b.angleDeg);
  const offsetMap = new Map();
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (curr.angleDeg - prev.angleDeg < minSepDeg) {
      offsetMap.set(curr.key, { angleOffset: 1.0, radialOffset: 4 });
    }
  }
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    const wrapDiff = 360 - last.angleDeg + first.angleDeg;
    if (wrapDiff < minSepDeg) {
      offsetMap.set(first.key, { angleOffset: 1.0, radialOffset: 4 });
    }
  }

  doc.save();
  doc.strokeColor(COLORS.textMainLight).strokeOpacity(0.22).lineWidth(outerWidth);
  doc.circle(centerX, centerY, radius).stroke();
  doc.restore();

  doc.save();
  doc.strokeColor(COLORS.textMainLight).strokeOpacity(0.18).lineWidth(0.5);
  for (let i = 0; i < 12; i += 1) {
    const angle = startAngle + step * i;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    doc.moveTo(centerX, centerY).lineTo(x, y).stroke();
  }
  doc.restore();

  SIGN_KEYS.forEach((key, idx) => {
    const glyph = normalizeSymbol(SIGN_SYMBOL[key] || "");
    if (!glyph) return;
    const angle = startAngle + step * idx;
    const x = centerX + zodiacRadius * Math.cos(angle);
    const y = centerY + zodiacRadius * Math.sin(angle);
    const fontName = pickSymbolFontName(doc, glyph);
    doc.save();
    doc.font(fontName).fontSize(bumpFont(zodiacSize)).fillColor(COLORS.textMainLight).fillOpacity(0.9);
    const w = doc.widthOfString(glyph);
    const h = doc.currentLineHeight(true);
    const adjust = getGlyphAdjust(glyph, bumpFont(zodiacSize));
    doc.text(glyph, x - w / 2 + adjust.x, y - h / 2 + adjust.y, { lineBreak: false });
    doc.restore();
  });

  (rowsMain || []).forEach((row) => {
    const glyph = normalizeSymbol(row?.glyph || "");
    const signKey = row?.meta?.sign_key || "";
    const signIndex = SIGN_KEYS.indexOf(signKey);
    if (!glyph || signIndex < 0) return;
    const deg = Number(row?.meta?.deg || 0);
    const min = Number(row?.meta?.min || 0);
    const within = deg + min / 60;
    const fullDeg = signIndex * 30 + within;
    const offset = offsetMap.get(row.key);
    const angleOffset = offset?.angleOffset || 0;
    const radialOffset = offset?.radialOffset || 0;
    const angle = startAngle + ((fullDeg + angleOffset) * Math.PI) / 180;
    const r = planetRadius + radialOffset;
    const x = centerX + r * Math.cos(angle);
    const y = centerY + r * Math.sin(angle);
    const fontName = pickSymbolFontName(doc, glyph);
    const opacity = offset ? 0.88 : 0.95;
    doc.font(fontName).fontSize(bumpFont(planetSize)).fillColor(COLORS.textSub).fillOpacity(opacity);
    const w = doc.widthOfString(glyph);
    const h = doc.currentLineHeight(true);
    const adjust = getGlyphAdjust(glyph, bumpFont(planetSize));
    doc.text(glyph, x - w / 2 + adjust.x, y - h / 2 + adjust.y, { lineBreak: false });
  });
}

function renderMobileCover({ doc, displayName, birthText, rowsMain }) {
  const layout = addPage(doc);
  layout.y += SPACE.md;
  const glyphs = ["☉", "☽", "☿", "♀", "♂", "♃", "♄", "♅", "♆", "♇"];
  const glyphSize = 18;
  const glyphGap = SPACE.md;
  const rows = Array.isArray(rowsMain) ? rowsMain : [];
  const signCounts = rows.reduce((acc, row) => {
    const key = row?.meta?.sign_key || "";
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const dominantSigns = Object.entries(signCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
  const rowGlyphs = rows
    .filter((row) => row?.key)
    .map((row) => ({
      signKey: row?.meta?.sign_key || "",
      glyph: normalizeSymbol(row?.glyph || BODY_GLYPH[row?.key] || ""),
    }))
    .filter((row) => row.glyph);
  const highlightRows = [];
  dominantSigns.forEach((signKey) => {
    rowGlyphs
      .filter((row) => row.signKey === signKey)
      .forEach((row) => {
        if (highlightRows.length < 2) highlightRows.push(row);
      });
  });
  rowGlyphs.forEach((row) => {
    if (highlightRows.length < 2) highlightRows.push(row);
  });
  const highlightGlyphs = highlightRows.length
    ? highlightRows.slice(0, 2).map((row) => row.glyph)
    : ["☉", "☽"];
  doc.save();
  const glyphFont = doc._symbolUniversalFontName || pickSymbolFontName(doc, glyphs[0]);
  doc.font(glyphFont).fontSize(bumpFont(glyphSize)).fillColor(COLORS.textSub);
  const widths = glyphs.map((g) => doc.widthOfString(g));
  const total = widths.reduce((sum, w) => sum + w, 0) + glyphGap * (glyphs.length - 1);
  let gx = layout.x + (contentWidth(doc) - total) / 2;
  const gy = layout.y;
  glyphs.forEach((g, idx) => {
    const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, g);
    doc.font(fontName).fontSize(bumpFont(glyphSize)).fillColor(COLORS.textSub);
    doc.text(g, gx, gy, { lineBreak: false });
    gx += widths[idx] + glyphGap;
  });
  if (highlightGlyphs.length) {
    const hiSize = bumpFont(glyphSize + 10);
    const baseX = layout.x + contentWidth(doc) / 2;
    const hiY = gy - hiSize + 4;
    const leftGlyph = highlightGlyphs[0];
    const rightGlyph = highlightGlyphs[1] || highlightGlyphs[0];
    const leftFont = doc._symbolUniversalFontName || pickSymbolFontName(doc, leftGlyph);
    const rightFont = doc._symbolUniversalFontName || pickSymbolFontName(doc, rightGlyph);
    doc.font(leftFont).fontSize(hiSize).fillColor(COLORS.textSub);
    const leftW = doc.widthOfString(leftGlyph);
    doc.text(leftGlyph, baseX - leftW - 8, hiY, { lineBreak: false });
    doc.font(rightFont).fontSize(hiSize).fillColor(COLORS.textSub);
    const rightW = doc.widthOfString(rightGlyph);
    doc.text(rightGlyph, baseX + 8, hiY + 6, { lineBreak: false });
  }
  doc.restore();
  layout.y = gy + doc.currentLineHeight(true) + SPACE.lg;
  drawTextBlock(doc, layout, "星の設計図", {
    font: "body",
    size: bumpFont(TYPE.title) - 2,
    lineGap: SPACE.sm,
    marginAfter: SPACE.xs,
    align: "center",
  });
  drawTextBlock(doc, layout, "Star Blueprint", {
    font: "title",
    size: bumpFont(TYPE.h1) - 4,
    lineGap: SPACE.sm,
    marginAfter: SPACE.xs,
    align: "center",
    color: COLORS.textSub,
  });
  drawTextBlock(doc, layout, "Cosmic Structure Archive", {
    font: "note",
    size: bumpFont(TYPE.meta) - 2,
    lineGap: SPACE.sm,
    marginAfter: SPACE.md,
    align: "center",
    color: COLORS.textSub,
  });
  if (displayName) {
    layout.y += SPACE.lg;
    drawTextBlock(doc, layout, displayName, {
      font: "note",
      size: bumpFont(TYPE.meta),
      lineGap: SPACE.sm,
      marginAfter: SPACE.xs,
      align: "center",
      color: COLORS.textSub,
    });
  }
  const openingText = sanitizeText("あなたの星の構造を\n可視化した記録です。");
  const openingSize = 12;
  const openingWidth = Math.round(contentWidth(doc) * 0.88);
  const openingX = layout.x + (contentWidth(doc) - openingWidth) / 2;
  doc.font("body").fontSize(bumpFont(openingSize)).fillColor(COLORS.textSub);
  const openingHeight = doc.heightOfString(openingText, {
    width: openingWidth,
    align: "center",
    lineGap: 6,
  });
  const compactBirth = birthText ? sanitizeText(birthText).replace(/\s*\n+\s*/g, " / ") : "";
  const birthSize = bumpFont(TYPE.meta) - 2;
  const birthWidth = Math.round(contentWidth(doc) * 0.9);
  const birthHeight = compactBirth
    ? doc.heightOfString(compactBirth, { width: birthWidth, align: "center", lineGap: 6 })
    : 0;

  const headerBottom = layout.y;
  const centerX = doc.page.width / 2;
  const baseRadius = Math.min(doc.page.width * 0.38, doc.page.height * 0.26);
  const desiredRadius = baseRadius * 0.9;
  const bottomPad = doc._layoutPadBottom || 0;
  const circleTop = headerBottom + SPACE.md;
  const regionBottom = doc.page.height - bottomPad;
  const gapAfterCircle = SPACE.xl;
  const maxRadius = Math.max(0, (regionBottom - circleTop - gapAfterCircle - openingHeight - birthHeight) / 2);
  const radius = Math.max(baseRadius * 0.85, Math.min(desiredRadius, maxRadius));
  const centerY = circleTop + radius;
  const birthY = compactBirth ? Math.max(circleTop, regionBottom - birthHeight) : regionBottom;
  const openingTextY = Math.min(birthY - SPACE.lg - openingHeight, centerY + radius + gapAfterCircle);

  doc.save();
  drawMobileHoroscopeCircle({ doc, centerX, centerY, radius, rowsMain });
  doc.restore();
  doc.font("body").fontSize(bumpFont(openingSize)).fillColor(COLORS.textSub);
  doc.text(openingText, openingX, openingTextY, { width: openingWidth, align: "center", lineGap: 6 });
  if (compactBirth) {
    doc.font("note").fontSize(birthSize).fillColor(COLORS.textSub);
    const birthX = layout.x + (contentWidth(doc) - birthWidth) / 2;
    doc.text(compactBirth, birthX, birthY, { width: birthWidth, align: "center", lineGap: 6 });
  }
}

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

function renderMobileClosing({ doc, closingText, rowsMain }) {
  const paragraphs = buildParagraphs(sanitizeText(closingText || "")).slice(0, 3);
  const layout = addPage(doc);
  const signGlyphs = Array.from(
    new Set(
      (rowsMain || [])
        .map((row) => normalizeSymbol(SIGN_SYMBOL[row?.meta?.sign_key] || ""))
        .filter(Boolean)
    )
  );
  const fallbackSigns = ["♈", "♉", "♊", "♋", "♌", "♍"];
  const pool = signGlyphs.length ? signGlyphs : fallbackSigns;
  const pick = (idx) => pool[idx % pool.length];
  const bg = [
    { glyph: pick(0), size: 120, x: 0.2, y: 0.2, opacity: 0.05, rotate: -10 },
    { glyph: pick(1), size: 110, x: 0.78, y: 0.22, opacity: 0.05, rotate: 8 },
    { glyph: pick(2), size: 90, x: 0.22, y: 0.78, opacity: 0.05, rotate: 6 },
    { glyph: pick(3), size: 130, x: 0.8, y: 0.78, opacity: 0.04, rotate: -6 },
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
  drawBilingualHeading(doc, layout, {
    jp: "全体統括",
    en: "Closing",
    align: "center",
    jpSize: bumpFont(27),
    enSize: bumpFont(14),
    marginAfter: SPACE.xl,
  });
  const rowGlyphs = (rowsMain || [])
    .map((row) => normalizeSymbol(SIGN_SYMBOL[row?.meta?.sign_key] || ""))
    .filter(Boolean);
  const rowPool = rowGlyphs.length ? rowGlyphs : signGlyphs.length ? signGlyphs : fallbackSigns;
  const rowGap = 8;
  const cellSize = Math.floor((contentWidth(doc) - rowGap * (rowPool.length - 1)) / Math.max(1, rowPool.length));
  const baseSize = Math.max(18, Math.min(32, cellSize - 2));
  const glyphSize = bumpFont(baseSize);
  const gY = layout.y + 8;
  const total = rowPool.length * cellSize + rowGap * (rowPool.length - 1);
  let gx = layout.x + (contentWidth(doc) - total) / 2;
  doc.save();
  doc.fillColor(COLORS.textSub).fillOpacity(0.45);
  rowPool.forEach((glyph) => {
    const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, glyph);
    doc.font(fontName).fontSize(glyphSize);
    const w = doc.widthOfString(glyph);
    const adjust = getGlyphAdjust(glyph, glyphSize);
    doc.text(glyph, gx + (cellSize - w) / 2 + adjust.x, gY + adjust.y, { lineBreak: false });
    gx += cellSize + rowGap;
  });
  doc.restore();
  layout.y = gY + glyphSize + SPACE.lg + 8;
  paragraphs.forEach((para, idx) => {
    drawTextBlock(doc, layout, para, {
      font: "body",
      size: bumpFont(TYPE.body),
      lineGap: Math.round(bumpFont(TYPE.body) * 0.6),
      marginAfter: idx < paragraphs.length - 1 ? SPACE.lg : SPACE.xl,
      align: "center",
    });
  });
  layout.y += SPACE.xxl + SPACE.xl + SPACE.lg;
  drawTextBlock(doc, layout, "星は語る。\n解釈はあなたのもの。", {
    font: "body",
    size: bumpFont(TYPE.body) + 2,
    lineGap: Math.round(bumpFont(TYPE.body) * 0.6),
    marginAfter: 0,
    align: "center",
    color: COLORS.textSub,
  });
}

function renderV25Heading(doc, layout, { code, titleJa, titleEn }) {
  const titleSize = Math.round(bumpFont(TYPE.title) * V25_TITLE_SCALE);
  const subSize = Math.round(bumpFont(TYPE.meta) * V25_TITLE_SCALE);
  drawTextBlock(doc, layout, String(code || ""), {
    font: "note",
    size: subSize - 2,
    color: COLORS.textSub,
    marginAfter: SPACE.xs,
  });
  drawTextBlock(doc, layout, String(titleJa || ""), {
    font: "title",
    size: titleSize,
    marginAfter: SPACE.xs,
  });
  drawTextBlock(doc, layout, String(titleEn || ""), {
    font: "note",
    size: subSize,
    color: COLORS.textSub,
    marginAfter: SPACE.lg,
  });
}

function v25BodySize(base) {
  return Math.round(bumpFont(base) * V25_SCALE);
}

function renderV25Section(doc, layout, label, text, { marginAfter = SPACE.md } = {}) {
  if (!label && !text) return;
  if (label) {
    drawTextBlock(doc, layout, label, {
      font: "bold",
      size: v25BodySize(TYPE.h2),
      marginAfter: SPACE.xs,
    });
  }
  if (text) {
    drawTextBlock(doc, layout, sanitizeText(text), {
      font: "body",
      size: v25BodySize(TYPE.body),
      lineGap: Math.round(v25BodySize(TYPE.body) * 0.6),
      marginAfter,
    });
  } else {
    layout.y += marginAfter;
  }
}

function renderV25List(doc, layout, items, { gap = SPACE.sm, font = "body", size = TYPE.body } = {}) {
  const safe = (items || []).filter(Boolean);
  if (!safe.length) return;
  const lineGap = Math.round(v25BodySize(size) * 0.4);
  safe.forEach((item, idx) => {
    doc.font(font).fontSize(v25BodySize(size)).fillColor(COLORS.textMainLight);
    doc.text(sanitizeText(String(item)), layout.x, layout.y, { lineGap });
    layout.y += doc.currentLineHeight(true) + (idx === safe.length - 1 ? SPACE.md : gap);
  });
}

function renderV25InlineSymbols(doc, layout, entries, { gap = 8, symbolSize = 16, textSize = TYPE.body } = {}) {
  const safe = (entries || []).filter(Boolean);
  if (!safe.length) return;
  const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, "🜂");
  const lineGap = Math.round(v25BodySize(textSize) * 0.4);
  safe.forEach((entry) => {
    const sym = entry.symbol || "";
    doc.font(fontName).fontSize(v25BodySize(symbolSize)).fillColor(entry.color || COLORS.textMainLight);
    doc.text(sym, layout.x, layout.y - 1, { lineBreak: false });
    const textX = layout.x + symbolSize + gap;
    doc.font("body").fontSize(v25BodySize(textSize)).fillColor(COLORS.textMainLight);
    doc.text(sanitizeText(entry.text || ""), textX, layout.y, { lineGap });
    layout.y += doc.currentLineHeight(true) + SPACE.sm;
  });
  layout.y += SPACE.xs;
}

function renderV25TwoColumnBlocks(doc, layout, leftBlocks, rightBlocks, { colGap = 24 } = {}) {
  const colWidth = (contentWidth(doc) - colGap) / 2;
  const leftX = layout.x;
  const rightX = layout.x + colWidth + colGap;
  const startY = layout.y;
  let leftY = startY;
  let rightY = startY;
  leftBlocks.forEach((block) => {
    const local = { x: leftX, y: leftY };
    renderV25Section(doc, local, block.label, block.text, { marginAfter: SPACE.md });
    leftY = local.y;
  });
  rightBlocks.forEach((block) => {
    const local = { x: rightX, y: rightY };
    renderV25Section(doc, local, block.label, block.text, { marginAfter: SPACE.md });
    rightY = local.y;
  });
  layout.y = Math.max(leftY, rightY) + SPACE.sm;
}

function renderV25AspectNetwork(doc, layout, aspects, { size = 340 } = {}) {
  const safe = Array.isArray(aspects) ? aspects.slice(0, 6) : [];
  if (!safe.length) return;
  const centerX = layout.x + contentWidth(doc) / 2;
  const centerY = layout.y + size / 2;
  const radius = size * 0.38;
  const glyphFont = doc._symbolUniversalFontName || pickSymbolFontName(doc, "☉");
  const uniqueBodies = Array.from(
    new Set(
      safe
        .flatMap((a) => [a.p1_key || a.p1, a.p2_key || a.p2].filter(Boolean))
        .map((k) => String(k).toLowerCase())
    )
  );
  const angles = uniqueBodies.map((_, idx) => (Math.PI * 2 * idx) / uniqueBodies.length - Math.PI / 2);
  const pos = new Map();
  uniqueBodies.forEach((key, idx) => {
    pos.set(key, {
      x: centerX + Math.cos(angles[idx]) * radius,
      y: centerY + Math.sin(angles[idx]) * radius,
    });
  });
  const colorByType = (type) => {
    const t = String(type || "").toLowerCase();
    if (t.includes("conjunction")) return COLORS.textMainLight;
    if (t.includes("trine")) return "#66cdaa";
    if (t.includes("square")) return "#ff7b7b";
    if (t.includes("opposition")) return "#f0c36d";
    if (t.includes("sextile")) return "#7aa7ff";
    return COLORS.textSub;
  };
  doc.save();
  safe.forEach((a) => {
    const aKey = String(a.p1_key || a.p1 || "").toLowerCase();
    const bKey = String(a.p2_key || a.p2 || "").toLowerCase();
    const p1 = pos.get(aKey);
    const p2 = pos.get(bKey);
    if (!p1 || !p2) return;
    doc.strokeColor(colorByType(a.type)).lineWidth(1.2).moveTo(p1.x, p1.y).lineTo(p2.x, p2.y).stroke();
  });
  uniqueBodies.forEach((key) => {
    const p = pos.get(key);
    if (!p) return;
    const glyph = BODY_GLYPH[key] || key.slice(0, 1).toUpperCase();
    doc.font(glyphFont).fontSize(v25BodySize(18)).fillColor(COLORS.textMainLight);
    doc.text(glyph, p.x - 6, p.y - 8, { lineBreak: false });
  });
  doc.restore();
  layout.y = centerY + radius + SPACE.lg;
}

function buildBgCacheDir({ displayName = "", birthText = "" } = {}) {
  const raw = `${displayName}|${birthText}`;
  const safe = raw.replace(/[^a-z0-9]+/gi, "_").slice(0, 60) || "anon";
  return path.join(process.cwd(), "tmp", "blueprint_bg", safe);
}

async function renderPdfBufferMobileV25({
  manifest,
  displayName,
  birthText,
  rowsMain,
  rowsAngles,
  rowsExtra,
  blueprintText,
  bgImages: bgImagesInput,
  story: storyInput,
}) {
  const ascLon = calcAscLon(rowsAngles);
  const mcLon = calcMcLon(rowsAngles);
  const wheelRotationDeg = Number.isFinite(Number(ascLon)) ? 270 - Number(ascLon) : 0;
  const elementCounts = blueprintText?.master_chart?.element_balance || collectElementCounts(rowsMain || []);
  const dateLabel = birthText || "";
  const story = storyInput || buildStoryStub({
    rowsMain,
    rowsExtra,
    elementCounts,
    dateLabel,
  });
  const bgImages = bgImagesInput || await buildBlueprintV25BgImages({
    blueprint: blueprintText,
    rowsMain,
    rowsExtra,
    elementCounts,
    dateLabel,
    outDir: buildBgCacheDir({ displayName, birthText }),
    inline: true,
  });
  const html = buildBlueprintV25WireframeHtml({
    data: {
      blueprint: blueprintText || {},
      displayName,
      ownerName: displayName,
      birthText,
      story,
      bg_images: bgImages,
      elementCounts,
      modalityCounts: blueprintText?.master_chart?.modality_balance || collectModalityCounts(rowsMain || []),
      wheelRotationDeg,
      wheelAscLon: Number.isFinite(Number(ascLon)) ? Number(ascLon) : null,
      wheelMcLon: Number.isFinite(Number(mcLon)) ? Number(mcLon) : null,
    },
    useSpace: true,
  });

  const browser = await puppeteer.launch({
    headless: "new",
    protocolTimeout: 240000,
    args: ["--no-sandbox", "--font-render-hinting=medium"],
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    page.setDefaultNavigationTimeout(180000);
    await page.setViewport({ width: PAGE_WIDTH, height: PAGE_HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.emulateMediaType("screen");
    const pdfBuffer = await page.pdf({
      width: `${PAGE_WIDTH}px`,
      height: `${PAGE_HEIGHT}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      timeout: 240000,
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

async function renderPdfBufferMobile({
  manifest,
  displayName,
  birthText,
  rowsMain,
  rowsAngles,
  rowsExtra,
  summary,
  element,
  modality,
  bodyTextByKey,
  closingText,
  angleTextByKey,
  nodeText,
  chironText,
  lilithText,
}) {
  const layoutConfig = getLayoutConfig(manifest?.layout || "mobile_9x16");
  const doc = new PDFDocument({ size: layoutConfig.pageSize, margin: layoutConfig.padX, autoFirstPage: false });
  applyLayoutConfig(doc, layoutConfig);
  registerFonts(doc);
  initSymbolFonts(doc);
  doc._darkMode = true;

  const chunks = [];
  doc.on("data", (d) => chunks.push(d));

  renderMobileCover({ doc, displayName, birthText, rowsMain });
  renderMobileQuickMap({ doc, rowsMain, rowsExtra, rowsAngles });
  renderMobileStructure({ doc, element, modality, summary });
  renderMobilePlanetsIntro({ doc });
  renderMobilePlanets({
    doc,
    rowsMain,
    rowsExtra,
    rowsAngles,
    bodyTextByKey,
    nodeText,
    chironText,
    lilithText,
    angleTextByKey,
  });
  renderMobileClosing({ doc, closingText: closingText || "", rowsMain });

  doc.end();
  await new Promise((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });
  return Buffer.concat(chunks);
}

module.exports = {
  renderPdfBufferMobile,
  renderPdfBufferMobileV25,
};
