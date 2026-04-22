"use strict";

const { glyphForBody } = require("../../format/format/common");

function formatDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "-";
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function formatRetrogradeBlock({ activeRows = [], upcomingRows = [], dict } = {}) {
  if (!activeRows.length && !upcomingRows.length) return ["該当なし"];

  const lines = ["🪐 逆行", ""];

  const renderRows = (title, rows) => {
    if (!rows.length) return;
    lines.push(title);
    rows.forEach((row, idx) => {
      if (idx > 0) lines.push("");
      const glyph = glyphForBody(row.bodyKey);
      const label = dict?.PLANETS_V2?.bodies?.[row.bodyKey]?.label_ja || row.bodyKey;
      lines.push(`　${glyph ? `${glyph} ` : ""}${label}`);
      lines.push(`　${formatDateOnly(row.startDate)}`);
      lines.push(`　→ ${formatDateOnly(row.endDate)}`);
    });
    lines.push("");
  };

  renderRows("✧ 逆行中：", activeRows);
  renderRows("✦ これから：", upcomingRows);

  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

module.exports = { formatRetrogradeBlock };
