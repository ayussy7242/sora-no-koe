"use strict";

const MAIN_PLANET_KEYS = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

const SIGN_ORDER = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
];

const SIGN_INDEX = new Map(SIGN_ORDER.map((key, idx) => [key, idx]));

const SIGN_JA_TO_KEY = {
  牡羊座: "aries",
  牡牛座: "taurus",
  双子座: "gemini",
  蟹座: "cancer",
  獅子座: "leo",
  乙女座: "virgo",
  天秤座: "libra",
  蠍座: "scorpio",
  射手座: "sagittarius",
  山羊座: "capricorn",
  水瓶座: "aquarius",
  魚座: "pisces",
};

const SIGN_NAME_TO_KEY = {
  aries: "aries",
  taurus: "taurus",
  gemini: "gemini",
  cancer: "cancer",
  leo: "leo",
  virgo: "virgo",
  libra: "libra",
  scorpio: "scorpio",
  sagittarius: "sagittarius",
  capricorn: "capricorn",
  aquarius: "aquarius",
  pisces: "pisces",
};

const SIGN_ELEMENT_MAP = {
  aries: "fire",
  leo: "fire",
  sagittarius: "fire",
  taurus: "earth",
  virgo: "earth",
  capricorn: "earth",
  gemini: "air",
  libra: "air",
  aquarius: "air",
  cancer: "water",
  scorpio: "water",
  pisces: "water",
};

const CHART_PATTERN_LABELS = {
  bundle: "天体集中配置",
  bowl: "半円集中配置",
  locomotive: "推進配置",
  seesaw: "二極配置",
  splash: "全域分散配置",
  splay: "多点分散配置",
};

function normalizePlanetKey(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveSignKey(sign) {
  if (!sign) return "";
  if (SIGN_JA_TO_KEY[sign]) return SIGN_JA_TO_KEY[sign];
  const lowered = String(sign).toLowerCase();
  return SIGN_NAME_TO_KEY[lowered] || "";
}

function toLongitude(signKey, deg) {
  if (!signKey || !Number.isFinite(Number(deg))) return null;
  const index = SIGN_INDEX.get(signKey);
  if (!Number.isFinite(index)) return null;
  const d = ((Number(deg) % 30) + 30) % 30;
  return index * 30 + d;
}

function buildPlanetEntries(planets) {
  const rows = Array.isArray(planets) ? planets : [];
  const byKey = new Map();
  rows.forEach((row) => {
    const key = normalizePlanetKey(row?.key || row?.planet || row?.name);
    if (key) byKey.set(key, row);
  });
  return MAIN_PLANET_KEYS.map((key) => {
    const row = byKey.get(key);
    const signKey = row?.sign_key || resolveSignKey(row?.sign_ja || row?.sign || "");
    const deg = Number(row?.degree ?? row?.deg);
    const house = Number(row?.house);
    const lon = toLongitude(signKey, deg);
    return {
      key,
      signKey,
      deg: Number.isFinite(deg) ? deg : null,
      house: Number.isFinite(house) ? house : null,
      lon,
    };
  }).filter((row) => Number.isFinite(row.lon));
}

function buildHemisphereLine(planets) {
  let upper = 0;
  let lower = 0;
  planets.forEach((row) => {
    if (!Number.isFinite(row.house)) return;
    if (row.house >= 7 && row.house <= 12) upper += 1;
    if (row.house >= 1 && row.house <= 6) lower += 1;
  });
  return `半球分布　上${upper} / 下${lower}`;
}

function buildPolarityLine(planets) {
  let yang = 0;
  let yin = 0;
  planets.forEach((row) => {
    const element = SIGN_ELEMENT_MAP[row.signKey];
    if (element === "fire" || element === "air") yang += 1;
    if (element === "earth" || element === "water") yin += 1;
  });
  return `極性分布　陽${yang} / 陰${yin}`;
}

function buildStructureLinesFromPlanets(planets) {
  if (!Array.isArray(planets) || planets.length === 0) return null;
  const entries = buildPlanetEntries(planets);
  if (!entries.length) return null;
  const patternKey = classifyChartPattern(entries.map((row) => row.lon));
  const label = CHART_PATTERN_LABELS[patternKey] || CHART_PATTERN_LABELS.splash;
  return [label, buildHemisphereLine(entries), buildPolarityLine(entries)];
}

function buildChartTypeFromPlanets(planets) {
  const entries = buildPlanetEntries(planets);
  if (!entries.length) return { pattern: "", hemisphere: "", polarity: "" };
  const patternKey = classifyChartPattern(entries.map((row) => row.lon));
  const pattern = CHART_PATTERN_LABELS[patternKey] || CHART_PATTERN_LABELS.splash;
  return {
    pattern,
    hemisphere: buildHemisphereLine(entries).replace("半球分布　", ""),
    polarity: buildPolarityLine(entries).replace("極性分布　", ""),
  };
}

function classifyChartPattern(longitudes) {
  const list = longitudes.filter((lon) => Number.isFinite(lon));
  if (list.length <= 2) return "bundle";
  const sorted = [...list].sort((a, b) => a - b);
  const gaps = sorted.map((lon, idx) => {
    const next = idx === sorted.length - 1 ? sorted[0] + 360 : sorted[idx + 1];
    return next - lon;
  });
  const maxGap = Math.max(...gaps);
  const arcSpan = 360 - maxGap;
  const clusters = buildClusters(sorted, gaps, 60);
  const seesaw = isSeeSaw(clusters);
  if (arcSpan <= 120) return "bundle";
  if (seesaw) return "seesaw";
  if (arcSpan <= 180) return "bowl";
  if (arcSpan <= 240) return "locomotive";
  const largeGapCount = gaps.filter((gap) => gap >= 60).length;
  if (largeGapCount <= 1 && maxGap <= 70) return "splash";
  if (clusters.length >= 3) return "splay";
  return "splash";
}

function buildClusters(sorted, gaps, threshold) {
  if (!sorted.length) return [];
  const splitIndexes = gaps
    .map((gap, idx) => (gap >= threshold ? idx : -1))
    .filter((idx) => idx >= 0);
  if (!splitIndexes.length) return [sorted.slice()];
  const startIdx = (splitIndexes[0] + 1) % sorted.length;
  const clusters = [];
  let current = [];
  for (let step = 0; step < sorted.length; step += 1) {
    const idx = (startIdx + step) % sorted.length;
    current.push(sorted[idx]);
    if (gaps[idx] >= threshold) {
      clusters.push(current);
      current = [];
    }
  }
  if (current.length) clusters.push(current);
  return clusters;
}

function circularMean(degrees) {
  if (!degrees.length) return 0;
  let sumSin = 0;
  let sumCos = 0;
  degrees.forEach((deg) => {
    const rad = (deg * Math.PI) / 180;
    sumSin += Math.sin(rad);
    sumCos += Math.cos(rad);
  });
  const mean = Math.atan2(sumSin, sumCos) * (180 / Math.PI);
  return (mean + 360) % 360;
}

function circularDistance(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function isSeeSaw(clusters) {
  if (clusters.length !== 2) return false;
  if (clusters.some((cluster) => cluster.length < 3)) return false;
  const centerA = circularMean(clusters[0]);
  const centerB = circularMean(clusters[1]);
  const separation = circularDistance(centerA, centerB);
  return separation >= 140 && separation <= 220;
}

module.exports = {
  CHART_PATTERN_LABELS,
  MAIN_PLANET_KEYS,
  buildStructureLinesFromPlanets,
  buildChartTypeFromPlanets,
};
