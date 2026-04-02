"use strict";

const { COLORS } = require("../../assets");
const { SIGN_KEYS, SIGN_SYMBOL } = require("../../shared");
const { pickSymbolFontName } = require("../../symbols");
const { getGlyphAdjust } = require("../../core/components");
const { bumpFont } = require("../constants");
const { normalizeSymbol } = require("../formatters");

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

module.exports = {
  drawMobileHoroscopeCircle,
};
