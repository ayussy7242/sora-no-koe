"use strict";

function formatBunpu({
  dateLabel,
  totalCount = 0,
  stats,
  quality = { same: 0, tension: 0, harmony: 0 },
  micro = { c30_150: 0, c45_135: 0, c72_144: 0, c40_80_160: 0 },
  houseCounts = {},
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

  lines.push("【微細構造】");
  lines.push(`接触（30°/150°）：${Number(micro.c30_150 || 0)}`);
  lines.push(`刺激（45°/135°）：${Number(micro.c45_135 || 0)}`);
  lines.push(`創造（72°/144°）：${Number(micro.c72_144 || 0)}`);
  lines.push(`内側（40°/80°/160°）：${Number(micro.c40_80_160 || 0)}`, "");

  const houseLine = Object.entries(houseCounts)
    .map(([k, v]) => ({ h: Number(k), n: Number(v) }))
    .filter((x) => Number.isFinite(x.h) && Number.isFinite(x.n) && x.n > 0)
    .sort((a, b) => (b.n - a.n) || (a.h - b.h))
    .map((x) => `${x.h}H:${x.n}`)
    .join(" / ");
  if (houseLine) {
    lines.push("【領域（接触ハウス）】");
    lines.push(houseLine, "");
  }

  return lines;
}

module.exports = { formatBunpu };
