"use strict";

function formatBunpu({
  totalCount = 0,
  stats,
  quality = { same: 0, tension: 0, harmony: 0 },
  micro = {
    c30_150: 0,
    c45_135: 0,
    c72_144: 0,
    c40_80_160: 0,
    c36_108: 0,
    other: 0,
  },
}) {
  const lines = [];
  lines.push("📊 あなたのぶんぷ（共鳴分布）", "");

  lines.push(`共鳴：${Number(totalCount || 0)}`, "");

  const s = stats || { bands: { "0-1": 0, "1-2": 0 } };
  lines.push("orb：");
  lines.push(`0–1°：${s.bands["0-1"] || 0}`);
  lines.push(`1–2°：${s.bands["1-2"] || 0}`, "");

  lines.push("◆ 主要角度", "");
  lines.push("コンジャンクション");
  lines.push(`0°：${Number(quality.same || 0)}`);
  lines.push("");
  lines.push("スクエア／オポジション");
  lines.push(`90°/180°：${Number(quality.tension || 0)}`);
  lines.push("");
  lines.push("セクスタイル／トライン");
  lines.push(`60°/120°：${Number(quality.harmony || 0)}`, "");

  lines.push("◆ その他角度", "");
  lines.push("セミセクスタイル／クインカンクス");
  lines.push(`30°/150°：${Number(micro.c30_150 || 0)}`);
  lines.push("");
  lines.push("ノヴァイル系");
  lines.push(`40°/80°/160°：${Number(micro.c40_80_160 || 0)}`);
  lines.push("");
  lines.push("セミスクエア／セスキスクエア");
  lines.push(`45°/135°：${Number(micro.c45_135 || 0)}`);
  lines.push("");
  lines.push("クインタイル／バイクインタイル");
  lines.push(`72°/144°：${Number(micro.c72_144 || 0)}`);
  lines.push("");
  lines.push("デシル／トリデシル");
  lines.push(`36°/108°：${Number(micro.c36_108 || 0)}`);
  if (Number(micro.other || 0) > 0) {
    lines.push("");
    lines.push("その他");
    lines.push(`${Number(micro.other || 0)}（未分類）`);
  }

  return lines;
}

module.exports = { formatBunpu };
