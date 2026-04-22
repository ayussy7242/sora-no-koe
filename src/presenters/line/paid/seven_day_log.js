"use strict";

function formatDayLabel(dateLocal) {
  const raw = String(dateLocal || "");
  const parts = raw.split("-");
  if (parts.length !== 3) return raw;
  return `${parts[1]}.${parts[2]}`;
}

function formatSevenDayLog({ title = "🌌 ななにちログ", resonanceRows = [], elementRows = [], modalityRows = [] } = {}) {
  const lines = [title, ""];

  lines.push("📊 そらの共鳴", "");
  resonanceRows.forEach((row, idx) => {
    if (idx > 0) lines.push("");
    lines.push(`${formatDayLabel(row.dateLocal)}：`);
    if (!row.item) {
      lines.push("該当なし");
      return;
    }
    lines.push(`(T) ${row.item.transitLabel}${row.item.transitSign}`);
    lines.push(` × (N) ${row.item.natalLabel}${row.item.natalSign}`);
    lines.push(`${row.item.aspectDeg}°｜${row.item.orbDeg.toFixed(1)}°`);
  });

  lines.push("", "📊 そらの属性", "");
  elementRows.forEach((row) => {
    lines.push(
      `${formatDayLabel(row.dateLocal)}：🔥火${row.fire} 🪨地${row.earth} 💨風${row.air} 💧水${row.water}`
    );
  });

  lines.push("", "📊 そらの動き", "");
  modalityRows.forEach((row) => {
    lines.push(
      `${formatDayLabel(row.dateLocal)}：🏃活動${row.cardinal} 🧱不動${row.fixed} 🌿柔軟${row.mutable}`
    );
  });

  return lines;
}

module.exports = { formatSevenDayLog };
