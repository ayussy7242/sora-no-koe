"use strict";

const { glyphForBody, signJa, formatAspectDisplay } = require("../../format/format/common");

function bodyLabelJa(dict, key) {
  const k = String(key || "").toLowerCase();
  if (k === "north_node") return "北ノード";
  if (k === "south_node") return "南ノード";
  return dict?.PLANETS_V2?.bodies?.[k]?.label_ja || dict?.POINTS_V1?.points?.[k]?.label_ja || key;
}

function formatPeakLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const mm = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  const hh = String(jst.getUTCHours()).padStart(2, "0");
  const mi = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${mm}.${dd} ${hh}:${mi}`;
}

function formatTsukiji({ personalRows = [], skyRows = [], dict }) {
  if (!personalRows.length && !skyRows.length) return ["該当なし"];

  const lines = [];

  const renderRows = (title, rows) => {
    if (!rows.length) return;
    lines.push(`✦ ${title}`);
    rows.forEach((row, idx) => {
      if (idx > 0) lines.push("");
      const aKind = row.aKind || "T";
      const bKind = row.bKind || "N";
      const aKey = row.aKey;
      const bKey = row.bKey;
      const aGlyph = glyphForBody(aKey);
      const bGlyph = glyphForBody(bKey);
      const aLabel = bodyLabelJa(dict, aKey);
      const bLabel = bodyLabelJa(dict, bKey);
      const aSign = row.aSign || signJa(dict, row.aSignKey || "");
      const bSign = row.bSign || signJa(dict, row.bSignKey || "");
      const aSignText = aSign ? `（${aSign}）` : "";
      const bSignText = bSign ? `（${bSign}）` : "";
      const aspectMeta = formatAspectDisplay({
        dict,
        rawType: row.aspectType,
        aspectDeg: row.aspectDeg,
        orbDeg: row.orbDeg,
        orbPrecision: 1,
      });
      lines.push(`${idx + 1}) (${aKind}) ${aGlyph ? `${aGlyph} ` : ""}${aLabel}${aSignText}`);
      lines.push(`   × (${bKind}) ${bGlyph ? `${bGlyph} ` : ""}${bLabel}${bSignText}`);
      lines.push(`   ${aspectMeta.degText || ""}｜${Number(row.orbDeg || 0).toFixed(1)}°`);
      lines.push(`   最接近：${formatPeakLabel(row.peakAt)}`);
    });
    lines.push("");
  };

  renderRows("個人", personalRows);
  renderRows("空", skyRows);

  if (lines[lines.length - 1] === "") lines.pop();

  return lines;
}

module.exports = { formatTsukiji };
