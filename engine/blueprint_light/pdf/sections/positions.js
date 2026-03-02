"use strict";

const { BODY_EN } = require("../../shared");
const { addPage } = require("../layout");
const { drawInlineSymbolAndText, addOutlineItem, drawBilingualHeading } = require("../typography");
const { formatSignEnglishName, formatSignEnglishWithDegree } = require("../formatters");

function renderCelestialPositionsPage({ doc, rowsMain }) {
  const layout = addPage(doc);
  addOutlineItem(doc, "天体配置｜Celestial Positions");
  drawBilingualHeading(doc, layout, {
    jp: "天体配置",
    en: "Celestial Positions",
  });
  rowsMain.forEach((row) => {
    const meta = row.meta || {};
    const signText = formatSignEnglishName(meta);
    const degText = formatSignEnglishWithDegree(meta);
    const rest = `${BODY_EN[row.key] || row.label}  ${degText || signText}`;
    drawInlineSymbolAndText(doc, layout, { glyph: row.glyph, text: rest, fontSize: 14, gap: 8, textFont: "title" });
  });
}

module.exports = {
  renderCelestialPositionsPage,
};
