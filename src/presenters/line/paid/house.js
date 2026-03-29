"use strict";

const { glyphForSign } = require("../../format/format/common");
const { SPEC } = require("../../../config/sora_spec");

function formatHouse({ rows = [] }) {
  const visibleRows = rows.filter((row) => Array.isArray(row?.items) && row.items.length > 0);
  if (!visibleRows.length) return ["該当なし"];

  const lines = [];
  visibleRows.forEach((row) => {
    const signGlyph = row?.signKey ? glyphForSign(row.signKey) : "";
    const signText = row?.signJa ? `${row.signJa}` : "";
    const itemsText = row.items && row.items.length ? row.items.join("、") : "—";
    const list = row.items.length > 5
      ? `${row.items.slice(0, 5).join("、")}…`
      : itemsText;
    lines.push(
      `第${row.houseNo}ハウス｜${signGlyph}${signText}｜score ${row.score.toFixed(2)}`,
      `${SPEC.labels.house.bodiesPrefix}${row.items.length}：${list}`,
      ""
    );
  });
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

module.exports = { formatHouse };
