"use strict";

const { signJa } = require("./format/common");

const DEFAULT_TIE_THRESHOLD = 0.03;
const ELEMENT_LABELS = {
  fire: "火",
  earth: "地",
  air: "風",
  water: "水",
  "火": "火",
  "地": "地",
  "風": "風",
  "水": "水",
};

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ratioOf(count, total) {
  const t = safeNumber(total);
  if (t <= 0) return 0;
  return safeNumber(count) / t;
}

function buildTopFromCounts({ counts, totalOverride = null }) {
  const entries = Object.entries(counts || {})
    .map(([label, count]) => ({ label: String(label || ""), count: safeNumber(count) }))
    .filter((row) => row.label && row.count > 0)
    .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));

  const hasOverride = totalOverride !== null && totalOverride !== undefined;
  const total = hasOverride && Number.isFinite(Number(totalOverride))
    ? safeNumber(totalOverride)
    : entries.reduce((sum, row) => sum + row.count, 0);

  if (!entries.length || total <= 0) {
    return { labels: [], count: 0, total, ratio: 0 };
  }

  const maxCount = entries[0].count;
  const topLabels = entries.filter((row) => row.count === maxCount).map((row) => row.label);
  return {
    labels: topLabels,
    count: maxCount,
    total,
    ratio: ratioOf(maxCount, total),
  };
}

function buildTopSign({ transitSigns, dict }) {
  const counts = {};
  const entries = Object.entries(transitSigns || {});
  entries.forEach(([, item]) => {
    if (!item) return;
    if (typeof item === "string") {
      counts[item] = (counts[item] || 0) + 1;
      return;
    }
    if (typeof item === "number") {
      counts[String(item)] = (counts[String(item)] || 0) + 1;
      return;
    }
    const signKey = item.sign_key || item.sign;
    const label = item.sign_ja || signJa(dict, signKey || "");
    if (!label) return;
    counts[label] = (counts[label] || 0) + 1;
  });

  if (!Object.keys(counts).length && entries.length) {
    entries.forEach(([key, value]) => {
      if (Number.isFinite(Number(value))) {
        counts[String(key)] = (counts[String(key)] || 0) + safeNumber(value);
      }
    });
  }
  return buildTopFromCounts({ counts });
}

function buildTopElement({ skyStrata }) {
  const raw = skyStrata?.element_count || {};
  const counts = {};
  Object.entries(raw).forEach(([key, count]) => {
    const label = ELEMENT_LABELS[key];
    if (!label) return;
    counts[label] = safeNumber(count);
  });
  return buildTopFromCounts({ counts });
}

function buildTopHouse({ houseFocus }) {
  const counts = { ...(houseFocus?.counts || {}) };
  if (!Object.keys(counts).length && Array.isArray(houseFocus?.top)) {
    houseFocus.top.forEach((row) => {
      const no = Number(row?.house_no);
      if (!Number.isFinite(no)) return;
      counts[no] = safeNumber(row?.count);
    });
  }

  const labeledCounts = {};
  Object.entries(counts).forEach(([houseNo, count]) => {
    const no = Number(houseNo);
    if (!Number.isFinite(no) || no <= 0) return;
    labeledCounts[`第${no}ハウス`] = safeNumber(count);
  });
  const total = Number.isFinite(Number(houseFocus?.total)) ? safeNumber(houseFocus?.total) : null;
  return buildTopFromCounts({ counts: labeledCounts, totalOverride: total });
}

function buildObservationAxisSummary({
  dict,
  transitSigns,
  skyStrata,
  houseFocus,
  tieThreshold = DEFAULT_TIE_THRESHOLD,
} = {}) {
  const sign = buildTopSign({ transitSigns, dict });
  const element = buildTopElement({ skyStrata });
  const house = buildTopHouse({ houseFocus });
  const categories = [
    { kind: "sign", ...sign },
    { kind: "element", ...element },
    { kind: "house", ...house },
  ];
  const maxRatio = Math.max(...categories.map((row) => row.ratio));
  const winners = categories.filter(
    (row) => row.ratio > 0 && (maxRatio - row.ratio) <= tieThreshold
  );

  return {
    sign,
    element,
    house,
    winners,
    maxRatio: Number.isFinite(maxRatio) ? maxRatio : 0,
    tieThreshold,
  };
}

function isHouseLabel(label) {
  return /^第\d+ハウス$/.test(String(label || ""));
}

function formatHouseLabelGroup(labels) {
  const nums = (labels || [])
    .map((label) => {
      const match = String(label || "").match(/^第(\d+)ハウス$/);
      return match ? Number(match[1]) : null;
    })
    .filter((n) => Number.isFinite(n));
  if (!nums.length || nums.length !== (labels || []).length) {
    return (labels || []).filter(Boolean).join("・");
  }
  nums.sort((a, b) => a - b);
  return `第${nums.join("・")}ハウス`;
}

function formatAxisLabel(kind, labels, { withSuffix = true } = {}) {
  const list = Array.isArray(labels) ? labels.filter(Boolean) : [];
  if (!list.length) return "";
  const base = list.every(isHouseLabel) ? formatHouseLabelGroup(list) : list.join("・");
  if (!withSuffix) return base;
  return base;
}

function formatObservationSubject(summary, { withSuffix = true } = {}) {
  const winners = summary?.winners || [];
  if (!winners.length) return "";
  const labels = winners
    .map((row) => formatAxisLabel(row.kind, row.labels, { withSuffix }))
    .filter(Boolean);
  if (!labels.length) return "";
  return labels.join("と");
}

function formatObservationFallback(summary) {
  if (!summary || !Array.isArray(summary.winners) || !summary.winners.length) {
    return "天体が全体に散る配置";
  }
  const subject = formatObservationSubject(summary, { withSuffix: true });
  const verb = summary.winners.length > 1 ? "が並ぶ" : "が強い";
  let text = `${subject}${verb}`;
  if (text.length < 10) text = `${text}配置`;
  if (text.length > 22) {
    const compactSubject = formatObservationSubject(summary, { withSuffix: false });
    const compactVerb = summary.winners.length > 1 ? "が並ぶ" : "が強い";
    text = `${compactSubject}${compactVerb}`;
    if (text.length < 10) text = `${text}配置`;
  }
  return text;
}

function formatAxisValue(axis) {
  if (!axis || !axis.labels || !axis.labels.length || axis.total <= 0) return "none";
  const label = axis.labels.every(isHouseLabel) ? formatHouseLabelGroup(axis.labels) : axis.labels.join("・");
  const ratio = Number.isFinite(Number(axis.ratio)) ? Number(axis.ratio).toFixed(2) : "0.00";
  return `${label} (${axis.count}/${axis.total}=${ratio})`;
}

function formatAxisWinner(summary) {
  const winners = summary?.winners || [];
  if (!winners.length) return "none";
  const labels = winners
    .map((row) => formatAxisLabel(row.kind, row.labels, { withSuffix: true }))
    .filter(Boolean);
  const ratio = Number.isFinite(Number(summary?.maxRatio)) ? Number(summary.maxRatio).toFixed(2) : "0.00";
  return `${labels.join(" / ")} (ratio=${ratio})`;
}

module.exports = {
  DEFAULT_TIE_THRESHOLD,
  buildObservationAxisSummary,
  formatObservationFallback,
  formatAxisValue,
  formatAxisWinner,
};
