"use strict";

function buildHouseCounts(planets = []) {
  return planets.reduce((acc, row) => {
    const house = Number(row?.house);
    if (!Number.isFinite(house)) return acc;
    acc[house] = (acc[house] || 0) + 1;
    return acc;
  }, {});
}

function computeDominantSigns({ planets = [], nodeKeys = ["north_node"], nodeSignKeys = [] } = {}) {
  const counts = new Map();
  planets.forEach((p) => {
    const key = p?.sign_key || p?.sign;
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const nodeSignList = Array.isArray(nodeSignKeys) ? nodeSignKeys.filter(Boolean) : [];
  if (nodeSignList.length) {
    nodeSignList.forEach((nodeKeyVal) => {
      if (nodeKeyVal) counts.set(nodeKeyVal, (counts.get(nodeKeyVal) || 0) + 0.5);
    });
  } else {
    nodeKeys.forEach((nodeKey) => {
      const node = planets.find((p) => p?.key === nodeKey || p?.body_key === nodeKey);
      const nodeKeyVal = node?.sign_key || node?.sign;
      if (nodeKeyVal) counts.set(nodeKeyVal, (counts.get(nodeKeyVal) || 0) + 0.5);
    });
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const strong = sorted.filter(([, v]) => v >= 3).map(([k]) => k);
  const pick = strong.length ? strong : sorted.slice(0, 2).map(([k]) => k);
  return pick.map((key) => {
    const ja = planets.find((p) => p.sign_key === key)?.sign_ja || "";
    return { sign_key: key, sign_ja: ja, count: counts.get(key) || 0 };
  });
}

function computeDominantHouses({ planets = [], houseCounts = null } = {}) {
  const counts = houseCounts || buildHouseCounts(planets);
  let entries = Object.entries(counts || {}).map(([k, v]) => ({ house: Number(k), count: Number(v || 0) }));
  entries = entries.filter((row) => Number.isFinite(row.house) && Number.isFinite(row.count));
  const sorted = entries.filter((e) => e.count > 0).sort((a, b) => (b.count - a.count) || (a.house - b.house));
  if (!sorted.length) return [];
  const primary = sorted.filter((e) => e.count >= 3);
  const secondary = primary.length ? [] : sorted.filter((e) => e.count >= 2);
  const picked = (primary.length ? primary : secondary).slice(0, 3);
  const pickedSet = new Set(picked.map((e) => e.house));
  if (picked.length < 3) {
    for (const row of sorted) {
      if (picked.length >= 3) break;
      if (pickedSet.has(row.house)) continue;
      picked.push(row);
      pickedSet.add(row.house);
    }
  }
  return picked.map((row) => ({ house: row.house, count: row.count }));
}

function computePrimaryHouse({ planets = [], angles = {}, nodes = {}, extras = {} } = {}) {
  const houseCountsMap = new Map();
  const housePlanetCounts = new Map();
  const houseCoreCounts = new Map();
  const inc = (map, key, by = 1) => {
    map.set(key, (map.get(key) || 0) + by);
  };
  const houseByKey = new Map(planets.map((p) => [p?.key || p?.body_key, p?.house]));
  planets.forEach((p) => {
    const house = Number(p?.house);
    if (!Number.isFinite(house)) return;
    inc(houseCountsMap, house);
    inc(housePlanetCounts, house);
    if (["sun", "moon", "mercury"].includes(String(p?.key || p?.body_key))) {
      inc(houseCoreCounts, house);
    }
  });
  const extrasList = [
    angles?.asc,
    angles?.mc,
    nodes?.north,
    extras?.chiron,
    extras?.lilith,
  ].filter(Boolean);
  extrasList.forEach((row) => {
    const house = Number(row?.house);
    if (!Number.isFinite(house)) return;
    inc(houseCountsMap, house);
  });
  const mcHouse = Number(angles?.mc?.house);
  if (Number.isFinite(mcHouse)) inc(houseCoreCounts, mcHouse);
  const sorted = Array.from(houseCountsMap.entries())
    .map(([house, total]) => ({
      house,
      total,
      planets: housePlanetCounts.get(house) || 0,
      core: houseCoreCounts.get(house) || 0,
    }))
    .sort((a, b) =>
      (b.total - a.total) ||
      (b.planets - a.planets) ||
      (b.core - a.core) ||
      (a.house - b.house)
    );
  if (!sorted.length) return null;
  const max = sorted[0]?.total ?? null;
  const tied = sorted.filter((row) => row.total === max);
  const focusKeys = ["sun", "moon", "mercury"];
  const focusScore = (house) =>
    focusKeys.reduce((sum, key) => sum + (houseByKey.get(key) === house ? 1 : 0), 0);
  const pick = (tied.length ? tied : sorted)
    .map((row) => ({
      ...row,
      focus: focusScore(row.house),
      mc: Number.isFinite(mcHouse) && mcHouse === row.house ? 1 : 0,
    }))
    .sort((a, b) => (b.focus - a.focus) || (b.mc - a.mc) || (a.house - b.house))[0];
  return pick?.house ?? sorted[0]?.house ?? null;
}

module.exports = {
  buildHouseCounts,
  computeDominantSigns,
  computeDominantHouses,
  computePrimaryHouse,
};
