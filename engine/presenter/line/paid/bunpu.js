"use strict";

const {
  glyphForBody,
  signJa,
  aspectInfo,
} = require("../../../render_parts/format/line_common");
const { SPEC } = require("../../../config/sora_spec");

function formatBunpu({
  dateLabel,
  totalCount = 0,
  stats,
  quality = { same: 0, tension: 0, harmony: 0 },
  houseCounts = {},
  elementCounts = { fire: 0, earth: 0, air: 0, water: 0 },
  modalityCounts = { cardinal: 0, fixed: 0, mutable: 0 },
  ura = [],
  retroMap = {},
  dict,
}) {
  const lines = [];
  lines.push(`📊 ぶんぷ｜構造圧｜${dateLabel || "-"}`, "");

  lines.push("【接触（N×T）】");
  lines.push(`総接触：${Number(totalCount || 0)}件`, "");

  const s = stats || { avg: 0, min: 0, max: 0, bands: { "0-1": 0, "1-2": 0, "2-3": 0 } };
  lines.push("【強度（orb）】");
  lines.push(`orb < 1°：${s.bands["0-1"] || 0}`);
  lines.push(`orb 1–2°：${s.bands["1-2"] || 0}`);
  lines.push(`orb 2–3°：${s.bands["2-3"] || 0}`);
  lines.push(`平均orb：${Number(s.avg || 0).toFixed(1)}°（最小 ${Number(s.min || 0).toFixed(1)}°｜最大 ${Number(s.max || 0).toFixed(1)}°）`, "");

  lines.push("【質（角度構成）】");
  lines.push(`同化（0°）：${Number(quality.same || 0)}`);
  lines.push(`緊張（90°/180°）：${Number(quality.tension || 0)}`);
  lines.push(`協調（60°/120°）：${Number(quality.harmony || 0)}`, "");

  lines.push("【領域（接触ハウス）】");
  const houseLine = Object.entries(houseCounts)
    .map(([k, v]) => ({ h: Number(k), n: Number(v) }))
    .filter((x) => Number.isFinite(x.h) && Number.isFinite(x.n) && x.n > 0)
    .sort((a, b) => (b.n - a.n) || (a.h - b.h))
    .map((x) => `${x.h}H:${x.n}`)
    .join(" / ");
  lines.push(houseLine || "—", "");

  lines.push("【揺れ（N側属性）】");
  lines.push(`元素：火${Number(elementCounts.fire || 0)} 地${Number(elementCounts.earth || 0)} 風${Number(elementCounts.air || 0)} 水${Number(elementCounts.water || 0)}`);
  lines.push(`三区分：活動${Number(modalityCounts.cardinal || 0)} 不動${Number(modalityCounts.fixed || 0)} 柔軟${Number(modalityCounts.mutable || 0)}`, "");

  lines.push("─────────────");
  lines.push("🌑 うら｜きょうに出ていない接点（全件）", "");

  if (!ura.length) {
    lines.push("該当なし");
    return lines;
  }

  ura.forEach((row, idx) => {
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

    const aspectMeta = aspectInfo(dict, it?.aspect || it?.type || it?.aspectType || it?.aspect_label_ja, it?.aspect_deg);
    const aspectLabel = aspectMeta?.label_ja || String(it?.aspect || it?.type || it?.aspectType || "");
    const aspectDeg = Number.isFinite(Number(it?.aspect_deg))
      ? Number(it.aspect_deg)
      : Number.isFinite(Number(aspectMeta?.deg))
        ? Number(aspectMeta.deg)
        : null;
    const degText = aspectDeg != null ? `${Math.round(aspectDeg)}°` : "";
    const orb = Number.isFinite(Number(it?.orb_deg)) ? Number(it.orb_deg) : null;
    const orbText = orb != null ? `${orb.toFixed(1)}°` : "";

    lines.push(`${idx + 1}) (N) ${nGlyph ? `${nGlyph} ` : ""}${nLabel}${nSignText} × (T) ${tGlyph ? `${tGlyph} ` : ""}${tLabelR}${tSignText}`);
    lines.push(`   ${aspectLabel} ${degText}｜orb ${orbText}`.trim());
  });

  return lines;
}

module.exports = { formatBunpu };
