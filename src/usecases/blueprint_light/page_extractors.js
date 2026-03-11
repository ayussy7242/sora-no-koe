"use strict";

function getSysPageData(master, identity = {}) {
  const planets = master?.planets || [];
  const sun = findPlanet(planets, "sun");
  const moon = findPlanet(planets, "moon");
  const asc = master?.ascendant || {};
  const dominantElement = pickDominantElement(master?.element_balance);
  const dominantModality = pickDominantModality(master?.modality_balance);
  const dominantHouse = pickDominantHouse(master?.house_counts);
  const dominantHouses = pickDominantHouses(master?.house_counts);
  const focusHouse = dominantHouse || (dominantHouses[0] ?? null);
  const focusPlanets = (focusHouse && master?.planet_distribution?.[focusHouse]) || [];
  return {
    identity,
    core_axis: {
      sun: pickPlacement(sun),
      moon: pickPlacement(moon),
      asc: pickPoint(asc),
    },
    cosmic_focus: {
      focus_planets: focusPlanets,
      focus_house: focusHouse,
      focus_label: focusHouse ? `${focusHouse}ハウス集中` : "",
    },
    dominance: {
      dominant_element: dominantElement,
      dominant_modality: dominantModality,
      dominant_house: dominantHouse,
    },
    chart_type: buildChartType(master),
    traits: buildTraits(master),
    supporting_facts: {
      house_cluster: dominantHouses,
      dominant_planets: pickDominantPlanets(planets),
    },
  };
}

function getMapPageData(master) {
  const dominantSigns = Array.isArray(master?.dominant_signs) && master.dominant_signs.length
    ? master.dominant_signs.map((row) => ({
        sign: row.sign_ja || row.sign || row.sign_key || "",
        reason: `count:${row.count ?? ""}`,
      }))
    : pickDominantSignsWithReason(master);
  const dominantHouses = pickDominantHousesWithReason(master?.house_counts);
  const dominantElement = pickDominantElement(master?.element_balance);
  const dominantModality = pickDominantModality(master?.modality_balance);
  const secondaryElement = pickSecondaryElement(master?.element_balance, dominantElement);
  const focusHouse = pickDominantHouse(master?.house_counts);
  const focusPlanets = (focusHouse && master?.planet_distribution?.[focusHouse]) || [];
  return {
    element_balance: master?.element_balance || {},
    modality_balance: master?.modality_balance || {},
    dominant_signs: dominantSigns,
    dominant_houses: dominantHouses,
    planet_distribution: master?.planet_distribution || {},
    energy_flow_inputs: {
      dominant_element: dominantElement,
      dominant_modality: dominantModality,
      secondary_element: secondaryElement,
      focus_planets: focusPlanets,
      focus_house: focusHouse,
    },
    structure_inputs: {
      outer_axis: dominantHouses[0]?.house ?? null,
      inner_axis: dominantHouses[1]?.house ?? null,
      pattern: buildChartType(master).pattern || "",
    },
  };
}

function getObsPageData(master) {
  return {
    wheel: {
      planets: master?.planets || [],
      asc: master?.ascendant || {},
      house_cusps: master?.house_cusps || [],
      major_aspects: master?.aspects || [],
    },
    observation_focus: buildObservationFocus(master),
  };
}

function getAnglesPageData(master) {
  const angles = master?.angles || {};
  return {
    angles: {
      asc: pickPointWithDegree(angles?.asc),
      mc: pickPointWithDegree(angles?.mc),
      ic: pickPointWithDegree(angles?.ic),
      dc: pickPointWithDegree(angles?.dc),
    },
    angular_planets: master?.angular_planets || null,
  };
}

function getPlanetPageData(master) {
  return {
    planets: (master?.planets || []).map((p) => ({
      planet: p.name,
      sign: p.sign,
      degree: p.degree,
      house: p.house,
      major_aspects: [],
    })),
  };
}

function getLayersPageData(master) {
  return {
    core_system: {
      members: [
        pickPlacement(findPlanet(master?.planets, "sun")),
        pickPlacement(findPlanet(master?.planets, "moon")),
        { point: "ASC", sign: master?.ascendant?.sign || "" },
      ],
      theme: "identity / emotion / outer entrance",
    },
    personal_system: {
      members: [
        pickPlacement(findPlanet(master?.planets, "mercury")),
        pickPlacement(findPlanet(master?.planets, "venus")),
        pickPlacement(findPlanet(master?.planets, "mars")),
      ],
      theme: "thought / attachment / action",
    },
    collective_system: {
      members: [
        pickPlacement(findPlanet(master?.planets, "jupiter")),
        pickPlacement(findPlanet(master?.planets, "saturn")),
        pickPlacement(findPlanet(master?.planets, "uranus")),
        pickPlacement(findPlanet(master?.planets, "neptune")),
        pickPlacement(findPlanet(master?.planets, "pluto")),
      ],
      theme: "growth / structure / change / ideal / transformation",
    },
    flow_links: {
      core_to_personal: [],
      personal_to_collective: [],
    },
  };
}

function getDeepPageData(master) {
  return {
    nodes: master?.nodes || {},
    chiron: master?.extras?.chiron || {},
    lilith: master?.extras?.lilith || {},
    deep_pattern_inputs: {
      outer_theme: "achievement / public role",
      inner_theme: "emotional safety / inner nourishment",
    },
  };
}

function getAspectPageData(master) {
  return {
    major_aspects: master?.aspects || [],
    network_focus: {
      core_cluster: pickDominantPlanets(master?.planets || []),
      supportive: [],
      tension: [],
      depth: [],
    },
  };
}

function getPatternPageData(master) {
  return {
    pattern_inputs: {
      core_axis: ["Sun", "Moon", "ASC"],
      dominant_element: pickDominantElement(master?.element_balance),
      dominant_modality: pickDominantModality(master?.modality_balance),
      dominant_house: pickDominantHouse(master?.house_counts),
      chart_type: buildChartType(master).pattern || "",
      outer_theme: "social expression / public role",
      inner_theme: "inner safety / emotional nourishment",
      key_tension: "",
      key_support: "",
      core_flow: "",
    },
  };
}

function pickDominantElement(balance = {}) {
  const entries = Object.entries(balance).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  return entries[0]?.[0] || "";
}

function pickDominantModality(balance = {}) {
  const entries = Object.entries(balance).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  return entries[0]?.[0] || "";
}

function pickDominantHouse(counts = {}) {
  const entries = Object.entries(counts).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  return entries[0] ? Number(entries[0][0]) : null;
}

function pickDominantHouses(counts = {}) {
  const entries = Object.entries(counts).sort((a, b) => (b[1] || 0) - (a[1] || 0));
  return entries.slice(0, 2).map(([house]) => Number(house));
}

function pickDominantSigns(planets = []) {
  const tally = new Map();
  planets.forEach((p) => {
    if (!p.sign) return;
    tally.set(p.sign, (tally.get(p.sign) || 0) + 1);
  });
  return Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([sign]) => sign);
}

function pickDominantPlanets(planets = []) {
  return planets
    .filter((p) => p.house === 10 || p.house === 1)
    .slice(0, 3)
    .map((p) => p.name);
}

function buildChartType(master) {
  return {
    pattern: "Cluster",
    hemisphere: "",
    polarity: "",
  };
}

function pickDominantSignsWithReason(master = {}) {
  const tally = new Map();
  const planets = Array.isArray(master?.planets) ? master.planets : [];
  planets.forEach((p) => {
    const sign = p.sign_ja || p.sign;
    if (!sign) return;
    tally.set(sign, (tally.get(sign) || 0) + 1);
  });
  const north = master?.nodes?.north;
  if (north?.sign_ja || north?.sign) {
    const sign = north.sign_ja || north.sign;
    tally.set(sign, (tally.get(sign) || 0) + 0.5);
  }
  const rows = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  const hasStrong = rows.some(([, count]) => count >= 3);
  const filtered = hasStrong ? rows.filter(([, count]) => count >= 3) : rows.slice(0, 2);
  return filtered.map(([sign, count]) => ({ sign, reason: `count:${count}` }));
}

function pickDominantHousesWithReason(counts = {}) {
  return Object.entries(counts)
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .slice(0, 2)
    .map(([house, count]) => ({ house: Number(house), reason: `count:${count}` }));
}

function pickSecondaryElement(balance = {}, dominant) {
  const entries = Object.entries(balance).filter(([key]) => key !== dominant);
  entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
  return entries[0]?.[0] || "";
}

function buildTraits(master) {
  const dominantElement = pickDominantElement(master?.element_balance);
  const dominantModality = pickDominantModality(master?.modality_balance);
  const dominantHouse = pickDominantHouse(master?.house_counts);
  return [
    dominantElement ? `${dominantElement} dominant` : "",
    dominantModality ? `${dominantModality} dominant` : "",
    dominantHouse ? `${dominantHouse}H emphasis` : "",
  ].filter(Boolean);
}

function buildObservationFocus(master) {
  const dominantHouse = pickDominantHouse(master?.house_counts);
  const dominantSigns = pickDominantSigns(master?.planets || []);
  return {
    cluster_sign: dominantSigns[0] || "",
    cluster_house: dominantHouse,
    asc_sign: master?.ascendant?.sign || "",
    missing_element: pickMissingElement(master?.element_balance),
  };
}

function pickMissingElement(balance = {}) {
  const entries = Object.entries(balance);
  if (!entries.length) return "";
  entries.sort((a, b) => (a[1] || 0) - (b[1] || 0));
  return entries[0]?.[0] || "";
}

function findPlanet(planets = [], key) {
  if (!key) return null;
  const byKey = planets.find((p) => p.key === key);
  if (byKey) return byKey;
  const name = key[0].toUpperCase() + key.slice(1);
  return planets.find((p) => String(p.name || "").toLowerCase() === String(name).toLowerCase()) || null;
}

function pickPlacement(planet) {
  if (!planet) return {};
  return {
    planet: planet.name,
    sign: planet.sign_ja || planet.sign,
    degree: planet.degree,
    house: planet.house,
  };
}

function pickPoint(point) {
  if (!point) return {};
  return {
    sign: point.sign_ja || point.sign || "",
  };
}

function pickPointWithDegree(point) {
  if (!point) return {};
  return {
    sign: point.sign_ja || point.sign || "",
    degree: point.degree ?? null,
    house: point.house ?? null,
  };
}

module.exports = {
  getSysPageData,
  getMapPageData,
  getObsPageData,
  getAnglesPageData,
  getPlanetPageData,
  getLayersPageData,
  getDeepPageData,
  getAspectPageData,
  getPatternPageData,
  buildSysData: getSysPageData,
  buildMapData: getMapPageData,
  buildObsData: getObsPageData,
  buildAnglesData: getAnglesPageData,
  buildPlanetsData: getPlanetPageData,
  buildLayersData: getLayersPageData,
  buildDeepAxisData: getDeepPageData,
  buildAspectData: getAspectPageData,
  buildPatternData: getPatternPageData,
};
