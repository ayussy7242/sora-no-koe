"use strict";

const {
  glyphForBody,
  signJa,
  formatAspectDisplay,
} = require("../../format/format/common");
const { SPEC } = require("../../../config/sora_spec");

function formatUra({ ura = [], retroMap = {}, dict }) {
  const lines = [];
  lines.push("🌑 うら｜きょうに出ていない接点（全件）", "");

  if (!ura.length) {
    lines.push("該当なし");
    return lines;
  }

  ura.forEach((row, idx) => {
    if (idx > 0) lines.push("");
    const it = row.item;
    const nKey = row?.nKey || String(it?.natal_body_or_point || it?.natal_body || it?.a || "").toLowerCase();
    const tKey = row?.tKey || String(it?.transit_body || it?.b || "").toLowerCase();
    const nGlyph = glyphForBody(nKey);
    const tGlyph = glyphForBody(tKey);
    const nLabel = dict?.PLANETS_V2?.bodies?.[nKey]?.label_ja || dict?.POINTS_V1?.points?.[nKey]?.label_ja || nKey;
    const tLabel = dict?.PLANETS_V2?.bodies?.[tKey]?.label_ja || dict?.POINTS_V1?.points?.[tKey]?.label_ja || tKey;
    const nSign = it?.natal_sign_ja || signJa(dict, it?.natal_sign_key || it?.natal_sign || "");
    const tSign = it?.transit_sign_ja || signJa(dict, it?.transit_sign_key || it?.transit_sign || "");
    const nSignText = nSign ? `（${nSign}）` : "";
    const tRetro = retroMap[tKey] ? SPEC.retro.suffix : "";
    const tSignText = tSign ? `（${tSign}）` : "";
    const tLabelR = `${tLabel}${tRetro}`;

    const aspectMeta = formatAspectDisplay({
      dict,
      rawType: it?.aspect || it?.type || it?.aspectType || it?.aspect_label_ja,
      aspectDeg: it?.aspect_deg,
      orbDeg: it?.orb_deg,
      orbPrecision: 1,
    });
    const degText = aspectMeta.degText || "";
    const orbText = aspectMeta.orbText || "";

    lines.push(`${idx + 1}) (N) ${nGlyph ? `${nGlyph} ` : ""}${nLabel}${nSignText}`);
    lines.push(`   × (T) ${tGlyph ? `${tGlyph} ` : ""}${tLabelR}${tSignText}`);
    lines.push(`   ${aspectMeta.label} ${degText}｜orb ${orbText}`.trim());
  });

  return lines;
}

module.exports = { formatUra };
