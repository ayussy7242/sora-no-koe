"use strict";

const fs = require("fs");
const path = require("path");
const dict = require("../../content/dict");
const HOUSE_DEFAULT_ASC = 1;

const SIGN_EN_MAP = Object.freeze({
  aries: "Aries",
  taurus: "Taurus",
  gemini: "Gemini",
  cancer: "Cancer",
  leo: "Leo",
  virgo: "Virgo",
  libra: "Libra",
  scorpio: "Scorpio",
  sagittarius: "Sagittarius",
  capricorn: "Capricorn",
  aquarius: "Aquarius",
  pisces: "Pisces",
});

function mapSignEn(signKey, signJa) {
  if (signKey && SIGN_EN_MAP[signKey]) return SIGN_EN_MAP[signKey];
  return signJa || "";
}

function buildFallbackCounts(planets) {
  const element = { fire: 0, earth: 0, air: 0, water: 0 };
  const modality = { cardinal: 0, fixed: 0, mutable: 0 };
  const signDict = dict?.SIGNS_V2?.signs || {};
  planets.forEach((p) => {
    const key = p?.sign_key;
    if (!key || !signDict[key]) return;
    const meta = signDict[key] || {};
    if (meta.element && element[meta.element] !== undefined) element[meta.element] += 1;
    if (meta.modality && modality[meta.modality] !== undefined) modality[meta.modality] += 1;
  });
  return { element, modality };
}

function hasNonZeroCounts(counts, keys) {
  return keys.some((k) => Number(counts?.[k] || 0) > 0);
}

function buildMasterChartFromKernel(kernel = {}, longitudes = null) {
  const bodies = Array.isArray(kernel.bodies) ? kernel.bodies : [];
  const placements = Array.isArray(kernel?.houses?.placements) ? kernel.houses.placements : [];
  const houseByKey = new Map(placements.map((row) => [row.key, row.house_no]));

  const planets = bodies.map((row) => {
    const meta = row?.kernel?.meta || {};
    const signKey = meta.sign_key || "";
    const signJa = meta.sign_ja || "";
    return {
      key: row.key,
      name: meta.label || row.key,
      sign: mapSignEn(signKey, signJa),
      sign_ja: signJa,
      sign_key: signKey,
      degree: meta.deg ?? null,
      house: houseByKey.get(row.key) || null,
    };
  });

  const ascSignKey = kernel?.houses?.asc_sign_key || "";
  const ascSignJa = kernel?.houses?.asc_sign_ja || "";
  const ascendant = {
    sign: mapSignEn(ascSignKey, ascSignJa),
    sign_ja: ascSignJa,
    sign_key: ascSignKey,
    house: HOUSE_DEFAULT_ASC,
  };

  const north = kernel?.nodes?.north?.kernel?.meta || {};
  const south = kernel?.nodes?.south?.kernel?.meta || {};
  const chiron = kernel?.chiron?.kernel?.meta || {};
  const lilith = kernel?.lilith?.kernel?.meta || {};

  const nodes = {
    north: {
      sign: mapSignEn(north.sign_key, north.sign_ja),
      sign_ja: north.sign_ja || "",
      sign_key: north.sign_key || "",
      degree: north.deg ?? null,
      house: north.house_no ?? null,
    },
    south: {
      sign: mapSignEn(south.sign_key, south.sign_ja),
      sign_ja: south.sign_ja || "",
      sign_key: south.sign_key || "",
      degree: south.deg ?? null,
      house: south.house_no ?? null,
    },
  };

  const extras = {
    chiron: {
      sign: mapSignEn(chiron.sign_key, chiron.sign_ja),
      sign_ja: chiron.sign_ja || "",
      sign_key: chiron.sign_key || "",
      degree: chiron.deg ?? null,
      house: chiron.house_no ?? null,
    },
    lilith: {
      sign: mapSignEn(lilith.sign_key, lilith.sign_ja),
      sign_ja: lilith.sign_ja || "",
      sign_key: lilith.sign_key || "",
      degree: lilith.deg ?? null,
      house: lilith.house_no ?? null,
    },
  };

  const aspects = Array.isArray(kernel.aspects)
    ? kernel.aspects.map((row) => ({
        p1: row.a_label || row.a,
        p2: row.b_label || row.b,
        p1_key: row.a,
        p2_key: row.b,
        type: row.type,
        orb: row.orb_deg ?? null,
      }))
    : [];

  const aspectPlacements = planets.reduce((acc, p) => {
    if (!p?.key) return acc;
    acc[p.key] = {
      sign_ja: p.sign_ja || "",
      degree: Number.isFinite(Number(p.degree)) ? Number(p.degree) : null,
      house: Number.isFinite(Number(p.house)) ? Number(p.house) : null,
    };
    return acc;
  }, {});

  const aspectsEnriched = aspects.map((row) => ({
    ...row,
    p1: aspectPlacements[row.p1_key] || { sign_ja: "", degree: null, house: null },
    p2: aspectPlacements[row.p2_key] || { sign_ja: "", degree: null, house: null },
  }));

  const angleRows = Array.isArray(kernel?.angles) ? kernel.angles : [];
  const angles = angleRows.reduce((acc, row) => {
    const meta = row?.kernel?.meta || {};
    const key = String(row?.key || "").toLowerCase();
    if (!["asc", "mc", "ic", "dc"].includes(key)) return acc;
    acc[key] = {
      sign: mapSignEn(meta.sign_key, meta.sign_ja),
      sign_ja: meta.sign_ja || "",
      sign_key: meta.sign_key || "",
      degree: meta.deg ?? null,
      house: meta.house_no ?? null,
    };
    return acc;
  }, {});

  const angularPlanets = (() => {
    if (!longitudes || typeof longitudes !== "object") return null;
    const angleKeys = ["asc", "mc", "ic", "dc"];
    const planetKeys = planets.map((p) => p.key).filter(Boolean);
    const orbLimit = 8;
    const res = { asc: [], mc: [], ic: [], dc: [] };
    const norm = (n) => {
      const v = Number(n);
      if (!Number.isFinite(v)) return null;
      const m = v % 360;
      return m < 0 ? m + 360 : m;
    };
    const angularDistance = (a, b) => {
      const da = Math.abs(a - b);
      return da > 180 ? 360 - da : da;
    };
    const angleLon = {};
    angleKeys.forEach((k) => {
      const v = norm(longitudes[k]);
      if (v !== null) angleLon[k] = v;
    });
    planetKeys.forEach((key) => {
      const lon = norm(longitudes[key]);
      if (lon === null) return;
      angleKeys.forEach((angleKey) => {
        const aLon = angleLon[angleKey];
        if (aLon === undefined) return;
        const orb = angularDistance(lon, aLon);
        if (orb <= orbLimit) {
          res[angleKey].push({ planet: key, orb: Number(orb.toFixed(2)) });
        }
      });
    });
    return res;
  })();

  const elementCountsRaw = kernel?.summary?.element?.counts || {};
  const modalityCountsRaw = kernel?.summary?.modality?.counts || {};
  const fallbackCounts = buildFallbackCounts(planets);
  const elementCounts = hasNonZeroCounts(elementCountsRaw, ["fire", "earth", "air", "water"])
    ? elementCountsRaw
    : fallbackCounts.element;
  const modalityCounts = hasNonZeroCounts(modalityCountsRaw, ["cardinal", "fixed", "mutable"])
    ? modalityCountsRaw
    : fallbackCounts.modality;
  const houseCounts = kernel?.houses?.counts || {};

  const dominantHouses = (() => {
    const entries = Object.entries(houseCounts || {}).map(([k, v]) => [Number(k), Number(v || 0)]);
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    const top = sorted.filter(([, v]) => v > 0).slice(0, 2).map(([k, v]) => ({ house: k, count: v }));
    return top;
  })();

  const majorAspects = (() => {
    const list = aspectsEnriched
      .filter((a) => a && a.p1 && a.p2)
      .sort((a, b) => (a.orb ?? 99) - (b.orb ?? 99));
    return list.slice(0, 6);
  })();

  const energyCenter = (() => {
    if (dominantHouses.length) return dominantHouses[0];
    return null;
  })();

  const chartPattern = kernel?.summary?.pattern?.name || kernel?.summary?.chart_pattern || kernel?.summary?.pattern || null;

  const dominantSigns = (() => {
    const counts = new Map();
    planets.forEach((p) => {
      const key = p.sign_key || p.sign;
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const northKey = nodes?.north?.sign_key || nodes?.north?.sign;
    if (northKey) counts.set(northKey, (counts.get(northKey) || 0) + 0.5);
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const strong = sorted.filter(([, v]) => v >= 3).map(([k]) => k);
    const pick = strong.length ? strong : sorted.slice(0, 2).map(([k]) => k);
    return pick.map((key) => {
      const ja = planets.find((p) => p.sign_key === key)?.sign_ja || "";
      return { sign_key: key, sign_ja: ja, count: counts.get(key) || 0 };
    });
  })();

  const planetDistribution = placements.reduce((acc, row) => {
    const house = row?.house_no;
    if (!house) return acc;
    const label = row?.label || row?.key;
    if (!acc[house]) acc[house] = [];
    acc[house].push(label);
    return acc;
  }, {});

  return {
    planets,
    ascendant,
    nodes,
    extras,
    aspects,
    aspects_enriched: aspectsEnriched,
    angles,
    angular_planets: angularPlanets,
    dominant_signs: dominantSigns,
    dominant_houses: dominantHouses,
    energy_center: energyCenter,
    major_aspects: majorAspects,
    chart_pattern: chartPattern,
    element_balance: {
      fire: elementCounts.fire ?? 0,
      earth: elementCounts.earth ?? 0,
      air: elementCounts.air ?? 0,
      water: elementCounts.water ?? 0,
    },
    modality_balance: {
      cardinal: modalityCounts.cardinal ?? 0,
      fixed: modalityCounts.fixed ?? 0,
      mutable: modalityCounts.mutable ?? 0,
    },
    house_counts: houseCounts,
    planet_distribution: planetDistribution,
  };
}

function buildMasterChartPath(slug) {
  return path.join(process.cwd(), "tmp", "blueprint", "master_chart", `${slug}.json`);
}

function writeMasterChartTmp(slug, chart) {
  const outPath = buildMasterChartPath(slug);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(chart, null, 2), "utf8");
  return outPath;
}

module.exports = {
  buildMasterChartFromKernel,
  buildMasterChartPath,
  writeMasterChartTmp,
};
