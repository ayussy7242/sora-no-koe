"use strict";

const { BODY_GLYPH, SIGN_SYMBOL, SIGN_KEYS } = require("../../shared");
const { COLORS } = require("../assets");
const { addPage, contentWidth } = require("../layout");
const { drawTextBlock, getGlyphAdjust } = require("../typography");
const { pickSymbolFontName } = require("../symbols");

function drawHoroscopeCircle({ doc, centerX, centerY, radius, rowsMain }) {
  const outerWidth = 0.35;
  const zodiacBand = radius * 0.08;
  const outerRadius = radius;
  const zodiacRadius = outerRadius - zodiacBand / 2 - radius * 0.05;
  const planetRadius = radius * 0.66;
  const zodiacSize = 12;
  const planetSize = 12;
  const step = (Math.PI * 2) / 12;
  const startAngle = -Math.PI / 2;

  const normalizeSymbol = (glyph) => String(glyph || "").replace(/\uFE0E|\uFE0F/g, "");
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
  doc.strokeColor(COLORS.textMainLight).strokeOpacity(0.25).lineWidth(outerWidth);
  doc.circle(centerX, centerY, outerRadius).stroke();
  doc.restore();

  doc.save();
  doc.strokeColor(COLORS.textMainLight).strokeOpacity(0.18).lineWidth(0.6);
  for (let i = 0; i < 12; i += 1) {
    const angle = startAngle + step * i;
    const x = centerX + outerRadius * Math.cos(angle);
    const y = centerY + outerRadius * Math.sin(angle);
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
    doc.font(fontName).fontSize(zodiacSize).fillColor(COLORS.textMainLight).fillOpacity(0.85);
    const w = doc.widthOfString(glyph);
    const h = doc.currentLineHeight(true);
    const adjust = getGlyphAdjust(glyph, zodiacSize);
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
    const opacity = offset ? 0.85 : 0.9;
    doc.font(fontName).fontSize(planetSize).fillColor(COLORS.textSub).fillOpacity(opacity);
    const w = doc.widthOfString(glyph);
    const h = doc.currentLineHeight(true);
    const adjust = getGlyphAdjust(glyph, planetSize);
    doc.text(glyph, x - w / 2 + adjust.x, y - h / 2 + adjust.y, { lineBreak: false });
  });
}

function renderCoverV2({ doc, displayName, birthText, rowsMain }) {
  const layout = addPage(doc);
  const pageHeight = doc.page.height;
  const pageWidth = doc.page.width;
  layout.y = Math.round(pageHeight * 0.15);

  const normalizeSymbol = (glyph) => String(glyph || "").replace(/\uFE0E|\uFE0F/g, "");
  const sunRow = rowsMain.find((r) => r.key === "sun");
  const sunSign = sunRow?.meta?.sign_key ? normalizeSymbol(SIGN_SYMBOL[sunRow.meta.sign_key] || "") : "";
  if (BODY_GLYPH.sun && sunSign) {
    const fontSize = 20;
    const glyphFont = pickSymbolFontName(doc, BODY_GLYPH.sun);
    const signFont = pickSymbolFontName(doc, sunSign);
    doc.font(glyphFont).fontSize(fontSize);
    const glyphW = doc.widthOfString(BODY_GLYPH.sun);
    doc.font(signFont).fontSize(fontSize);
    const signW = doc.widthOfString(sunSign);
    const gap = 6;
    const totalW = glyphW + gap + signW;
    const x = layout.x + (doc.page.width - layout.x * 2) / 2 - totalW / 2;
    const y = layout.y;
    doc.fillColor(COLORS.textSub);
    doc.font(glyphFont).fontSize(fontSize).text(BODY_GLYPH.sun, x, y, { lineBreak: false });
    doc.font(signFont).fontSize(fontSize).text(sunSign, x + glyphW + gap, y, { lineBreak: false });
    layout.y = y + doc.currentLineHeight(true) + 18;
  }

  drawTextBlock(doc, layout, "星の設計図", {
    font: "body",
    size: 32,
    lineGap: 12,
    marginAfter: 8,
    align: "center",
  });

  drawTextBlock(doc, layout, "Star Blueprint", {
    font: "title",
    size: 18,
    lineGap: 10,
    marginAfter: 6,
    align: "center",
  });

  drawTextBlock(doc, layout, "— Cosmic Structure Archive —", {
    font: "note",
    size: 12,
    lineGap: 10,
    marginAfter: 14,
    align: "center",
    color: COLORS.textSub,
  });

  if (birthText) {
    drawTextBlock(doc, layout, birthText, {
      font: "note",
      size: 12,
      lineGap: 10,
      marginAfter: 20,
      align: "center",
      color: COLORS.textSub,
    });
  } else if (displayName) {
    drawTextBlock(doc, layout, displayName, {
      font: "note",
      size: 12,
      lineGap: 10,
      marginAfter: 20,
      align: "center",
      color: COLORS.textSub,
    });
  }

  const centerX = pageWidth / 2;
  const circleTop = layout.y + 8;
  const bottomLimit = pageHeight * 0.85;
  const maxRadiusByHeight = Math.max((bottomLimit - circleTop) / 2, 80);
  const radius = Math.min(pageWidth * 0.32, maxRadiusByHeight);
  const centerY = circleTop + radius;
  drawHoroscopeCircle({ doc, centerX, centerY, radius, rowsMain });
}

module.exports = {
  renderCoverV2,
};
