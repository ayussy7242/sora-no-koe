"use strict";

const { COLORS } = require("../../assets");

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

module.exports = {
  drawShapeSymbol,
};
