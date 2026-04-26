"use strict";

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pickLeadingHouseFocus(houseFocus, { maxItems = 2, maxCountGap = 1 } = {}) {
  const top = Array.isArray(houseFocus?.top) ? houseFocus.top : [];
  if (!top.length) return [];

  const first = top[0];
  const firstCount = safeNumber(first?.count);
  const selected = [first];

  for (let i = 1; i < top.length && selected.length < maxItems; i += 1) {
    const current = top[i];
    const gap = firstCount - safeNumber(current?.count);
    if (gap <= maxCountGap) {
      selected.push(current);
      continue;
    }
    break;
  }

  return selected;
}

function formatLeadingHouseFocus(houseFocus, opts = {}) {
  const selected = pickLeadingHouseFocus(houseFocus, opts);
  if (!selected.length) return "none";

  const total = safeNumber(houseFocus?.total);
  const labels = selected
    .map((row) => {
      const houseNo = Number(row?.house_no);
      return Number.isFinite(houseNo) ? `第${houseNo}ハウス` : "";
    })
    .filter(Boolean);
  const counts = selected
    .map((row) => safeNumber(row?.count))
    .filter((count) => count > 0);

  if (!labels.length) return "none";
  if (labels.length === 1) {
    const count = counts[0] || 0;
    return total > 0 ? `${labels[0]}（${count}/${total}）` : labels[0];
  }

  const countLabel = counts.length ? `（${counts.join("・")}/${total || counts[0] || 0}）` : "";
  return `${labels.join("と")}${countLabel}`;
}

module.exports = {
  pickLeadingHouseFocus,
  formatLeadingHouseFocus,
};
