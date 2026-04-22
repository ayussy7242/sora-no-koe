"use strict";

function formatBunpu({
  totalCount = 0,
  stats,
  quality = { same: 0, tension: 0, harmony: 0 },
  micro = { c30_150: 0, c45_135: 0, c72_144: 0, c40_80_160: 0 },
}) {
  const lines = [];
  lines.push("📊 あなたのぶんぷ（共鳴分布）", "");

  lines.push(`共鳴：${Number(totalCount || 0)}`, "");

  const s = stats || { bands: { "0-1": 0, "1-2": 0 } };
  lines.push("orb：");
  lines.push(`0–1°：${s.bands["0-1"] || 0}`);
  lines.push(`1–2°：${s.bands["1-2"] || 0}`, "");

  lines.push("角度：");
  lines.push(`0°：${Number(quality.same || 0)}`);
  lines.push(`90°/180°：${Number(quality.tension || 0)}`);
  lines.push(`60°/120°：${Number(quality.harmony || 0)}`, "");

  lines.push("微細：");
  lines.push(`30°/150°：${Number(micro.c30_150 || 0)}`);
  lines.push(`45°/135°：${Number(micro.c45_135 || 0)}`);
  lines.push(`72°/144°：${Number(micro.c72_144 || 0)}`);

  return lines;
}

module.exports = { formatBunpu };
