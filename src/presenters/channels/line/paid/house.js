"use strict";

const { glyphForSign } = require("../../../format/format/line_common");
const { SPEC } = require("../../../../config/sora_spec");

function formatHouse({ rows = [] }) {
  if (!rows.length) return ["該当なし"];

  const lines = [];
  rows.forEach((row) => {
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
