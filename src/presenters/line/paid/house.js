"use strict";

function formatHouse({ rows = [], dict } = {}) {
  const visibleRows = rows.filter((row) => Number(row?.count || 0) > 0);
  if (!visibleRows.length) return ["該当なし"];

  const lines = [];
  visibleRows.forEach((row) => {
    const meaning = dict?.HOUSES_V1?.houses?.[row.houseNo]?.focus_short || "";
    lines.push(
      `第${row.houseNo}ハウス｜${meaning}`,
      `score ${Number(row.score || 0)}`,
      `共鳴 ${Number(row.count || 0)}`,
      ""
    );
  });
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

module.exports = { formatHouse };
