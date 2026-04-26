"use strict";

const { glyphForSign } = require("../../format/format/common");

function formatBodyLabel(dict, key) {
  const k = String(key || "").toLowerCase();
  if (k === "north_node") return "北ノード";
  if (k === "south_node") return "南ノード";
  return dict?.PLANETS_V2?.bodies?.[k]?.label_ja || dict?.POINTS_V1?.points?.[k]?.label_ja || key;
}

function formatHouse({ rows = [], dict } = {}) {
  const visibleRows = rows.filter((row) => Number(row?.count || 0) > 0);
  if (!visibleRows.length) return ["該当なし"];

  const lines = [];
  visibleRows.forEach((row) => {
    const meaning = dict?.HOUSES_V1?.houses?.[row.houseNo]?.focus_short || "";
    const signKey = row.signKey || "";
    const signGlyph = glyphForSign(signKey);
    const signJa = row.signJa || "";
    const signLine = [signGlyph, signJa].filter(Boolean).join("");
    const bodies = Array.isArray(row.bodies) ? row.bodies : [];
    const bodyText = bodies
      .map((body) => {
        const label = formatBodyLabel(dict, body?.key);
        const bodySign = body?.signJa ? `（${body.signJa}）` : "";
        return `${label}${bodySign}`;
      })
      .join("、");

    lines.push(
      `第${row.houseNo}ハウス｜${meaning}`,
      `${signLine}｜score ${Number(row.score || 0).toFixed(2)}`,
      `天体${bodies.length}：${bodyText}`,
      ""
    );
  });
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

module.exports = { formatHouse };
