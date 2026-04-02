"use strict";

const { SIGN_JA, SIGN_EN } = require("../constants");
const { toNumber } = require("../utils");

function buildDominantSignsFromKernel(kernel) {
  const signCounts = new Map();
  (kernel?.bodies || []).forEach((row) => {
    const sign = row?.kernel?.meta?.sign_ja || "";
    if (!sign) return;
    signCounts.set(sign, (signCounts.get(sign) || 0) + 1);
  });
  return [...signCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sign]) => sign)
    .slice(0, 3);
}

function buildHouseSorted(houseCounts) {
  return Object.entries(houseCounts || {})
    .map(([house, count]) => ({ house: Number(house), count: toNumber(count) }))
    .sort((a, b) => (b.count - a.count) || (a.house - b.house));
}

function parseElementCounts(elementSummary) {
  if (!elementSummary) return null;
  if (elementSummary.counts) {
    return {
      fire: toNumber(elementSummary.counts.fire),
      earth: toNumber(elementSummary.counts.earth),
      air: toNumber(elementSummary.counts.air),
      water: toNumber(elementSummary.counts.water),
    };
  }
  const countsLine = (elementSummary.counts_line || "").match(/\d+/g) || [];
  if (countsLine.length >= 4) {
    const [fire, earth, air, water] = countsLine.map((v) => toNumber(v));
    return { fire, earth, air, water };
  }
  return null;
}

function buildElementBars(elementCounts) {
  if (!elementCounts) return null;
  const total = elementCounts.fire + elementCounts.earth + elementCounts.air + elementCounts.water || 1;
  return {
    fire: Math.round((elementCounts.fire / total) * 100),
    earth: Math.round((elementCounts.earth / total) * 100),
    air: Math.round((elementCounts.air / total) * 100),
    water: Math.round((elementCounts.water / total) * 100),
  };
}

function parseModalityCounts(modalitySummary) {
  if (!modalitySummary || !modalitySummary.counts) return null;
  return {
    cardinal: toNumber(modalitySummary.counts.cardinal),
    fixed: toNumber(modalitySummary.counts.fixed),
    mutable: toNumber(modalitySummary.counts.mutable),
  };
}

function buildModalityBars(modalityCounts) {
  if (!modalityCounts) return null;
  const total = modalityCounts.cardinal + modalityCounts.fixed + modalityCounts.mutable || 1;
  return {
    cardinal: Math.round((modalityCounts.cardinal / total) * 100),
    fixed: Math.round((modalityCounts.fixed / total) * 100),
    mutable: Math.round((modalityCounts.mutable / total) * 100),
  };
}

function buildDominanceLines({ elementDominant, modalityDominant, topHouse, currentLines = [] }) {
  const elementJaMap = {
    Fire: "火",
    Earth: "地",
    Air: "風",
    Water: "水",
    fire: "火",
    earth: "地",
    air: "風",
    water: "水",
  };
  const modalityJaMap = {
    Cardinal: "活動",
    Fixed: "不動",
    Mutable: "柔軟",
    cardinal: "活動",
    fixed: "不動",
    mutable: "柔軟",
  };
  const elementText = elementJaMap[elementDominant] || elementDominant;
  const modalityText = modalityJaMap[modalityDominant] || modalityDominant;
  if (!elementText && !modalityText && !topHouse) return currentLines;
  return [
    elementText ? `エレメント　${elementText}` : currentLines[0],
    modalityText ? `モード　　　${modalityText}宮` : currentLines[1],
    topHouse ? `強調ハウス　${topHouse}H` : currentLines[2],
  ];
}

function buildDominantSignsFromAggregate(aggregate) {
  if (!aggregate?.sortedSigns?.length) return [];
  return aggregate.sortedSigns
    .slice(0, 3)
    .map(([key]) => SIGN_JA[key] || SIGN_EN[key] || key)
    .filter(Boolean);
}

module.exports = {
  buildDominantSignsFromKernel,
  buildHouseSorted,
  parseElementCounts,
  buildElementBars,
  parseModalityCounts,
  buildModalityBars,
  buildDominanceLines,
  buildDominantSignsFromAggregate,
};
