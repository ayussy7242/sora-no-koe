"use strict";

const { glyphForBody, signJa, formatAspectDisplay } = require("../../../format/format/line_common");
const { SPEC } = require("../../../../config/sora_spec");

function formatTsukiji({ approachRows = [], retroRows = [], dict }) {
  if (!approachRows.length && !retroRows.length) return ["該当なし"];

  const lines = [];

  if (approachRows.length) {
    lines.push(SPEC.labels.tsukiji.approach);
    approachRows.forEach((row, idx) => {
      if (idx > 0) lines.push("");
      const aKind = row.aKind || "T";
      const bKind = row.bKind || "T";
      const aKey = row.aKey;
      const bKey = row.bKey;
      const aGlyph = glyphForBody(aKey);
      const bGlyph = glyphForBody(bKey);
      const aLabel = dict?.PLANETS_V2?.bodies?.[aKey]?.label_ja || dict?.POINTS_V1?.points?.[aKey]?.label_ja || aKey;
      const bLabel = dict?.PLANETS_V2?.bodies?.[bKey]?.label_ja || dict?.POINTS_V1?.points?.[bKey]?.label_ja || bKey;
      const aSign = row.aSign || signJa(dict, row.aSignKey || "");
      const bSign = row.bSign || signJa(dict, row.bSignKey || "");
      const aSignText = aSign ? `（${aSign}）` : "";
      const bSignText = bSign ? `（${bSign}）` : "";
      const aspectMeta = formatAspectDisplay({
        dict,
        rawType: row.aspectType,
        aspectDeg: row.aspectDeg,
        orbDeg: row.orb,
        orbPrecision: 1,
      });
      const degText = aspectMeta.degText || "";
      const orbText = aspectMeta.orbText ? `orb ${aspectMeta.orbText}` : "";
      lines.push(`${idx + 1}) (${aKind}) ${aGlyph ? `${aGlyph} ` : ""}${aLabel}${aSignText}`);
      lines.push(`   × (${bKind}) ${bGlyph ? `${bGlyph} ` : ""}${bLabel}${bSignText}`);
      lines.push(`   ${aspectMeta.label} ${degText}`.trim());
      if (orbText) lines.push(`   ${orbText}`);
      lines.push(`   ${row.startText} → ${row.endText}`);
      lines.push(`   ${SPEC.labels.tsukiji.remaining} ${row.remainingDays}日`);
    });
  }

  if (retroRows.length) {
    if (lines.length) lines.push("");
    lines.push(SPEC.labels.tsukiji.retro);
    retroRows.forEach((row, idx) => {
      if (idx > 0) lines.push("");
      const glyph = glyphForBody(row.bodyKey);
      const label = dict?.PLANETS_V2?.bodies?.[row.bodyKey]?.label_ja || row.bodyKey;
      lines.push(`${glyph ? `${glyph} ` : ""}${label} ${SPEC.retro.short}`);
      lines.push(`${row.startText} → ${row.endText}`);
      lines.push(`${SPEC.labels.tsukiji.remaining} ${row.remainingDays}日`);
    });
  }

  return lines;
}

module.exports = { formatTsukiji };
