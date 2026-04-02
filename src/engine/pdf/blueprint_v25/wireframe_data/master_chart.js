"use strict";

const { CORE_PLANETS } = require("../../../../domain/astro/constants");
const {
  BODY_GLYPH,
  BODY_LABEL_JA,
  PLANET_ROLE_TAGLINES,
  AXIS_ROLE_TAGLINES,
  DEEP_AXIS_ROLE_TAGLINES,
  SIGN_JA,
  SIGN_ELEMENT_MAP,
  SIGN_MODALITY_MAP,
  SIGN_NAME_TO_KEY,
  SIGN_JA_TO_KEY,
  SIGN_SYMBOL,
} = require("../constants");
const {
  toNumber,
  resolveSignKey,
  formatSignJa,
} = require("../utils");
const { buildDominantSignsFromAggregate } = require("./counts");
const { buildStructureLinesFromPlanets } = require("../../../../utils/data/chart_type");

function extractFromMasterChart({ masterChart, p }) {
  if (!masterChart) return;

  if (Number.isFinite(Number(masterChart.primary_house))) {
    p.dominancePrimaryHouse = Number(masterChart.primary_house);
  }

  const structureLines = buildStructureLinesFromPlanets(masterChart?.planets || []);
  if (structureLines?.length) p.structureLines = structureLines;

  const planetByKey = new Map((masterChart.planets || []).map((pRow) => [pRow.key, pRow]));
  const formatExtraLine = (extra) => {
    if (!extra) return "";
    const sign = formatSignJa(extra.sign_ja || extra.sign || "");
    if (!sign) return "";
    const signKey = extra.sign_key || SIGN_JA_TO_KEY[sign] || SIGN_NAME_TO_KEY[String(sign || "").toLowerCase()];
    const signGlyph = SIGN_SYMBOL[signKey] || "";
    const deg = Number(extra.degree);
    const degText = Number.isFinite(deg) ? ` ${deg}°` : "";
    const house = Number(extra.house);
    const houseText = Number.isFinite(house) ? `｜${house}H` : "";
    return `${signGlyph ? `${signGlyph} ` : ""}${sign}${degText}${houseText}`.trim();
  };
  const distOrder = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
  const buildPlanetLine = (key) => {
    const planet = planetByKey.get(key);
    if (!planet) return "";
    const sign = formatSignJa(planet.sign_ja || planet.sign || "");
    const deg = Number(planet.degree);
    const degText = Number.isFinite(deg) ? ` ${deg}°` : "";
    const house = Number.isFinite(Number(planet.house)) ? `｜${Number(planet.house)}H` : "";
    const signText = sign ? `${sign}${degText}`.trim() : "";
    const label = BODY_LABEL_JA[key] || key;
    const glyph = BODY_GLYPH[key] || "";
    return `${glyph} ${label} ${signText}${house}`.trim();
  };
  const leftOrder = distOrder.slice(0, 5);
  const rightOrder = distOrder.slice(5);
  const interleaved = [];
  for (let i = 0; i < Math.max(leftOrder.length, rightOrder.length); i += 1) {
    if (leftOrder[i]) interleaved.push(leftOrder[i]);
    if (rightOrder[i]) interleaved.push(rightOrder[i]);
  }
  const distLines = interleaved.map(buildPlanetLine).filter(Boolean);
  p.planetDistributionList = distLines;
  if (!p.signatureLineSymbols) {
    const order = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
    const coverSignSymbols = order
      .map((key) => {
        const planet = planetByKey.get(key);
        if (!planet) return "";
        const signKey = SIGN_JA_TO_KEY[planet.sign_ja] || SIGN_NAME_TO_KEY[String(planet.sign || "").toLowerCase()];
        return SIGN_SYMBOL[signKey] || "";
      })
      .filter(Boolean);
    if (coverSignSymbols.length) {
      p.signatureLineSymbols = coverSignSymbols.join(" ");
    }
  }

  if (masterChart.extras) {
    if (!p.deepAxisMeta?.chiron && masterChart.extras.chiron) {
      p.deepAxisMeta = { ...(p.deepAxisMeta || {}), chiron: formatExtraLine(masterChart.extras.chiron) };
    }
    if (!p.deepAxisMeta?.lilith && masterChart.extras.lilith) {
      p.deepAxisMeta = { ...(p.deepAxisMeta || {}), lilith: formatExtraLine(masterChart.extras.lilith) };
    }
  }
  if (masterChart?.nodes) {
    const formatNodeMeta = (node) => {
      if (!node) return "";
      const sign = formatSignJa(node.sign_ja || node.sign || "");
      if (!sign) return "";
      const signKey = node.sign_key || SIGN_JA_TO_KEY[sign] || SIGN_NAME_TO_KEY[String(sign || "").toLowerCase()];
      const signGlyph = SIGN_SYMBOL[signKey] || "";
      const deg = Number(node.degree);
      const degText = Number.isFinite(deg) ? ` ${deg}°` : "";
      const house = Number(node.house);
      const houseText = Number.isFinite(house) ? `｜${house}H` : "";
      return `${signGlyph ? `${signGlyph} ` : ""}${sign}${degText}${houseText}`.trim();
    };
    const north = masterChart.nodes.north;
    const south = masterChart.nodes.south;
    const nextMeta = { ...(p.deepAxisMeta || {}) };
    if (!nextMeta.northMeta && north) nextMeta.northMeta = formatNodeMeta(north);
    if (!nextMeta.southMeta && south) nextMeta.southMeta = formatNodeMeta(south);
    p.deepAxisMeta = nextMeta;
  }
  const formatSignDeg = (planet) => {
    if (!planet) return "";
    const sign = formatSignJa(planet.sign_ja || planet.sign || "");
    const signKey = SIGN_JA_TO_KEY[sign] || SIGN_NAME_TO_KEY[String(planet.sign || "").toLowerCase()];
    const signGlyph = SIGN_SYMBOL[signKey] || "";
    const degText = Number.isFinite(Number(planet.degree)) ? ` ${Number(planet.degree)}°` : "";
    const signText = signGlyph ? `${signGlyph} ${sign}` : sign;
    return `${signText}${degText}`.trim();
  };

  const formatAngleMetaFromMaster = (angle, label) => {
    if (!angle) return "";
    const sign = formatSignJa(angle.sign_ja || angle.sign || "");
    if (!sign) return "";
    const signKey = angle.sign_key || SIGN_JA_TO_KEY[sign] || SIGN_NAME_TO_KEY[String(angle.sign || "").toLowerCase()];
    const signGlyph = SIGN_SYMBOL[signKey] || "";
    const degText = Number.isFinite(Number(angle.degree)) ? ` ${Number(angle.degree)}°` : "";
    const axisHouseMap = { ASC: 1, MC: 10, IC: 4, DC: 7 };
    const houseText = axisHouseMap[label] ? `｜${axisHouseMap[label]}H` : "";
    return `${signGlyph ? `${signGlyph} ` : ""}${sign}${degText}${houseText}`.trim();
  };

  if (masterChart.angles) {
    const nextAngleMeta = { ...(p.angleMeta || {}) };
    if (masterChart.angles.asc) {
      const val = formatAngleMetaFromMaster(masterChart.angles.asc, "ASC");
      if (val) nextAngleMeta.asc = val;
    }
    if (masterChart.angles.mc) {
      const val = formatAngleMetaFromMaster(masterChart.angles.mc, "MC");
      if (val) nextAngleMeta.mc = val;
    }
    if (masterChart.angles.ic) {
      const val = formatAngleMetaFromMaster(masterChart.angles.ic, "IC");
      if (val) nextAngleMeta.ic = val;
    }
    if (masterChart.angles.dc) {
      const val = formatAngleMetaFromMaster(masterChart.angles.dc, "DC");
      if (val) nextAngleMeta.dc = val;
    }
    p.angleMeta = nextAngleMeta;
  }

  if (p.planetRolesAll?.length) {
    const toRoleLabel = (line) => {
      if (!line) return "";
      const raw = String(line).trim();
      const match = raw.match(/^([^（]+)（(.+)）$/);
      if (match) return `${match[1]}｜${match[2]}`.trim();
      return raw;
    };
    const stripRoleLine = (text, roleLine) => {
      if (!text) return "";
      if (!roleLine) return text;
      const trimmed = String(text).trimStart();
      if (!trimmed.startsWith(roleLine)) return text;
      return trimmed.slice(roleLine.length).replace(/^\\s*\\n/, "");
    };
    const stripMetaSentence = (text) => {
      const trimmed = String(text || "").trim();
      if (!trimmed) return "";
      const end = trimmed.indexOf("。");
      if (end === -1) return trimmed;
      const first = trimmed.slice(0, end + 1);
      if ((/配置|位置/.test(first)) && (/(ハウス|\\dH|H)/.test(first))) {
        return trimmed.slice(end + 1).trimStart();
      }
      return trimmed;
    };
    p.planetRolesAll = p.planetRolesAll.map((card) => {
      const planet = planetByKey.get(card.key);
      const sign = formatSignDeg(planet);
      const house = Number.isFinite(Number(planet?.house)) ? `${Number(planet.house)}H` : "";
      const meta = sign && house ? `${sign}｜${house}` : sign || house || card.meta;
      const roleLine = PLANET_ROLE_TAGLINES[card.key] || "";
      const roleLabel = toRoleLabel(roleLine);
      let text = stripRoleLine(card.text || "", roleLine);
      text = stripMetaSentence(text);
      return { ...card, meta, roleLabel, text };
    });
  }

  const formatLine = (key) => {
    const planet = planetByKey.get(key);
    if (!planet) return "";
    const sign = formatSignDeg(planet);
    const house = Number.isFinite(Number(planet.house)) ? ` ${Number(planet.house)}H` : "";
    const glyph = BODY_GLYPH[key] || "";
    const label = BODY_LABEL_JA[key] || key;
    return `${glyph}${label} ${sign}${house}`.trim();
  };
  const ascMetaLine = p.angleMeta?.asc || "";
  const ascLine = ascMetaLine ? `ASC ${ascMetaLine}` : "";
  const ascSignJa = formatSignJa(masterChart?.ascendant?.sign_ja || masterChart?.ascendant?.sign || "");
  const ascSignKey = SIGN_JA_TO_KEY[ascSignJa] || SIGN_NAME_TO_KEY[String(masterChart?.ascendant?.sign || "").toLowerCase()];
  const ascSignGlyph = SIGN_SYMBOL[ascSignKey] || "";
  const ascDeg = masterChart?.ascendant?.degree ?? masterChart?.ascendant?.deg ?? null;
  const ascDegText = Number.isFinite(Number(ascDeg)) ? ` ${Number(ascDeg)}°` : "";
  const ascSignFallback = ascSignJa ? `${ascSignGlyph ? `${ascSignGlyph} ` : ""}${ascSignJa}${ascDegText}｜1H` : "";
  const formatAxisLine = (key, label) => {
    const planet = planetByKey.get(key);
    if (!planet) return "";
    const sign = formatSignDeg(planet);
    const house = Number.isFinite(Number(planet.house)) ? `｜${Number(planet.house)}H` : "";
    const glyph = BODY_GLYPH[key] || "";
    return `${glyph}${label} ${sign}${house}`.trim();
  };
  p.coreAxisLines = [
    formatAxisLine("sun", "太陽"),
    formatAxisLine("moon", "月"),
    ascLine || (ascSignFallback ? `ASC ${ascSignFallback}` : ""),
  ].filter(Boolean);
  p.systemLayerLines = {
    core: [formatLine("sun"), formatLine("moon"), ascLine || (ascSignFallback ? `ASC ${ascSignFallback}` : "")].filter(Boolean),
    personal: [formatLine("mercury"), formatLine("venus"), formatLine("mars")].filter(Boolean),
    collective: [
      formatLine("jupiter"),
      formatLine("saturn"),
      formatLine("uranus"),
      formatLine("neptune"),
      formatLine("pluto"),
    ].filter(Boolean),
  };

  const order = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
  p.coverBodies = order
    .map((key) => {
      const planet = planetByKey.get(key);
      if (!planet) return "";
      const sign = formatSignJa(planet.sign_ja || planet.sign || "");
      if (!sign) return "";
      const glyph = BODY_GLYPH[key] || "";
      const label = BODY_LABEL_JA[key] || key;
      return `${glyph} ${label} ${sign}`.trim();
    })
    .filter(Boolean);

  const aspectTypes = new Set(["conjunction","opposition","square","trine","sextile","quincunx","sesquisquare","semisquare"]);
  const aspectOrder = [...CORE_PLANETS, "asc", "mc", "ic", "dc"];
  const orderIdx = new Map(aspectOrder.map((key, idx) => [key, idx]));
  const normKey = (a, b) => {
    const ak = String(a || "").toLowerCase();
    const bk = String(b || "").toLowerCase();
    const ai = orderIdx.has(ak) ? orderIdx.get(ak) : 999;
    const bi = orderIdx.has(bk) ? orderIdx.get(bk) : 999;
    return ai <= bi ? `${ak}_${bk}` : `${bk}_${ak}`;
  };
  const aspectLookup = new Map(
    (masterChart.aspects || []).map((edge) => {
      const a = edge?.p1_key || edge?.p1;
      const b = edge?.p2_key || edge?.p2;
      return [normKey(a, b), edge];
    })
  );

  const parseAspectKey = (rawKey = "") => {
    const parts = String(rawKey).toLowerCase().split(/[_\\-]/g).filter(Boolean);
    if (!parts.length) return null;
    let type = "";
    const filtered = parts.filter((p) => {
      if (aspectTypes.has(p)) { type = p; return false; }
      return true;
    });
    if (filtered.length < 2) return null;
    const a = filtered[0];
    const b = filtered[1];
    return { a, b, type };
  };

  const signLabelFor = (key) => {
    const planet = planetByKey.get(key);
    if (planet?.sign_ja) return formatSignJa(planet.sign_ja);
    if (planet?.sign) return formatSignJa(planet.sign);
    if (key === "asc") return formatSignJa(masterChart?.ascendant?.sign_ja || masterChart?.ascendant?.sign || "");
    if (key === "mc") return formatSignJa(masterChart?.mc?.sign_ja || masterChart?.mc?.sign || "");
    if (key === "ic") return formatSignJa(masterChart?.ic?.sign_ja || masterChart?.ic?.sign || "");
    if (key === "dc") return formatSignJa(masterChart?.dc?.sign_ja || masterChart?.dc?.sign || "");
    return "";
  };

  const aspectRows = Array.isArray(p.aspectMapRows) ? p.aspectMapRows : [];
  const parsedEdges = aspectRows
    .map((row) => {
      const parsed = parseAspectKey(row.key);
      if (!parsed) return null;
      return { ...parsed, type: row.type || parsed.type || "" };
    })
    .filter(Boolean);

  if (parsedEdges.length) {
    const nodesSet = new Set();
    const edges = parsedEdges.map((edge) => {
      const key = normKey(edge.a, edge.b);
      const lookup = aspectLookup.get(key);
      const type = edge.type || lookup?.type || "";
      nodesSet.add(edge.a);
      nodesSet.add(edge.b);
      return { a: edge.a, b: edge.b, type };
    });
    const nodeList = Array.from(nodesSet);
    p.aspectNetwork = {
      nodes: nodeList.map((key, idx) => ({ key, idx, sign: signLabelFor(key) })),
      edges,
    };
  } else if (!p.aspectNetwork && Array.isArray(masterChart.aspects) && masterChart.aspects.length) {
    const nodes = new Set();
    masterChart.aspects.forEach((edge) => {
      const a = edge?.p1_key || edge?.p1;
      const b = edge?.p2_key || edge?.p2;
      if (a) nodes.add(a);
      if (b) nodes.add(b);
    });
    const nodeList = Array.from(nodes);
    p.aspectNetwork = {
      nodes: nodeList.map((key, idx) => ({ key, idx, sign: signLabelFor(key) })),
      edges: masterChart.aspects.map((edge) => ({
        a: edge?.p1_key || edge?.p1,
        b: edge?.p2_key || edge?.p2,
        type: edge?.type || "",
      })),
    };
  }
  const aggregateForDominance = (() => {
    const planets = masterChart?.planets || [];
    const extras = [
      masterChart?.angles?.asc,
      masterChart?.angles?.mc,
      masterChart?.nodes?.north,
      masterChart?.extras?.chiron,
      masterChart?.extras?.lilith,
    ].filter(Boolean);
    if (!planets.length && !extras.length) return null;

    const signCounts = new Map();
    const houseCounts = new Map();
    const housePlanetCounts = new Map();
    const houseCoreCounts = new Map();
    const inc = (map, key, by = 1) => {
      map.set(key, (map.get(key) || 0) + by);
    };

    planets.forEach((row) => {
      const signKey = resolveSignKey(row);
      if (signKey) inc(signCounts, signKey);
      const house = Number(row.house);
      if (Number.isFinite(house)) {
        inc(houseCounts, house);
        inc(housePlanetCounts, house);
      }
      if (["sun", "moon", "mercury"].includes(String(row.key))) {
        if (Number.isFinite(house)) inc(houseCoreCounts, house);
      }
    });

    extras.forEach((row) => {
      const signKey = resolveSignKey(row);
      if (signKey) inc(signCounts, signKey);
      const house = Number(row.house);
      if (Number.isFinite(house)) inc(houseCounts, house);
    });

    const mcHouse = Number(masterChart?.angles?.mc?.house);
    if (Number.isFinite(mcHouse)) inc(houseCoreCounts, mcHouse);

    const sortedSigns = Array.from(signCounts.entries())
      .sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0])));
    const sortedHouses = Array.from(houseCounts.entries())
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

    const coreRanks = Array.from(houseCoreCounts.entries())
      .map(([house, count]) => ({ house, count, total: houseCounts.get(house) || 0 }))
      .sort((a, b) => (b.count - a.count) || (b.total - a.total) || (a.house - b.house));

    return { sortedSigns, sortedHouses, coreRanks };
  })();

  if (aggregateForDominance?.sortedSigns?.length) {
    p.dominantSigns = buildDominantSignsFromAggregate(aggregateForDominance);
  } else if (Array.isArray(masterChart.dominant_signs) && masterChart.dominant_signs.length) {
    p.dominantSigns = masterChart.dominant_signs
      .map((row) => {
        if (row.sign_ja) return formatSignJa(row.sign_ja);
        if (row.sign) return formatSignJa(row.sign);
        if (row.sign_key) return SIGN_JA[row.sign_key] || row.sign_key;
        return "";
      })
      .filter(Boolean);
  }

  if (aggregateForDominance?.sortedHouses?.length) {
    p.dominantHouses = aggregateForDominance.sortedHouses
      .slice(0, 3)
      .map((row) => `${row.house}H`);
    if (aggregateForDominance.coreRanks?.length) {
      p.dominancePrimaryHouse = aggregateForDominance.coreRanks[0]?.house;
    }
  } else {
    const houseCounts = masterChart?.house_counts || {};
    const houseSorted = Object.entries(houseCounts)
      .map(([house, count]) => ({ house: Number(house), count: toNumber(count) }))
      .sort((a, b) => (b.count - a.count) || (a.house - b.house));
    if (houseSorted.length) p.dominantHouses = houseSorted.slice(0, 3).map((row) => `${row.house}H`);
  }
  if (masterChart?.element_balance) {
    p.elementCounts = {
      fire: toNumber(masterChart.element_balance.fire),
      earth: toNumber(masterChart.element_balance.earth),
      air: toNumber(masterChart.element_balance.air),
      water: toNumber(masterChart.element_balance.water),
    };
    const total = (p.elementCounts.fire || 0) + (p.elementCounts.earth || 0) + (p.elementCounts.air || 0) + (p.elementCounts.water || 0) || 1;
    p.elementBars = {
      fire: Math.round(((p.elementCounts.fire || 0) / total) * 100),
      earth: Math.round(((p.elementCounts.earth || 0) / total) * 100),
      air: Math.round(((p.elementCounts.air || 0) / total) * 100),
      water: Math.round(((p.elementCounts.water || 0) / total) * 100),
    };
  }
  if (masterChart?.modality_balance) {
    p.modalityCounts = {
      cardinal: toNumber(masterChart.modality_balance.cardinal),
      fixed: toNumber(masterChart.modality_balance.fixed),
      mutable: toNumber(masterChart.modality_balance.mutable),
    };
    const total = (p.modalityCounts.cardinal || 0) + (p.modalityCounts.fixed || 0) + (p.modalityCounts.mutable || 0) || 1;
    p.modalityBars = {
      cardinal: Math.round(((p.modalityCounts.cardinal || 0) / total) * 100),
      fixed: Math.round(((p.modalityCounts.fixed || 0) / total) * 100),
      mutable: Math.round(((p.modalityCounts.mutable || 0) / total) * 100),
    };
  }
  const elementSum =
    (p.elementCounts?.fire || 0) +
    (p.elementCounts?.earth || 0) +
    (p.elementCounts?.air || 0) +
    (p.elementCounts?.water || 0);
  const modalitySum =
    (p.modalityCounts?.cardinal || 0) +
    (p.modalityCounts?.fixed || 0) +
    (p.modalityCounts?.mutable || 0);
  if ((!elementSum || !modalitySum) && Array.isArray(masterChart?.planets)) {
    const elementFallback = { fire: 0, earth: 0, air: 0, water: 0 };
    const modalityFallback = { cardinal: 0, fixed: 0, mutable: 0 };
    masterChart.planets.forEach((row) => {
      const signKey = resolveSignKey(row);
      const element = SIGN_ELEMENT_MAP[signKey];
      const modality = SIGN_MODALITY_MAP[signKey];
      if (element && elementFallback[element] !== undefined) elementFallback[element] += 1;
      if (modality && modalityFallback[modality] !== undefined) modalityFallback[modality] += 1;
    });
    if (!elementSum) p.elementCounts = elementFallback;
    if (!modalitySum) p.modalityCounts = modalityFallback;
  }
  if (p.elementCounts && !p.elementBars) {
    const total = (p.elementCounts.fire || 0) + (p.elementCounts.earth || 0) + (p.elementCounts.air || 0) + (p.elementCounts.water || 0) || 1;
    p.elementBars = {
      fire: Math.round(((p.elementCounts.fire || 0) / total) * 100),
      earth: Math.round(((p.elementCounts.earth || 0) / total) * 100),
      air: Math.round(((p.elementCounts.air || 0) / total) * 100),
      water: Math.round(((p.elementCounts.water || 0) / total) * 100),
    };
  }
  if (p.modalityCounts && !p.modalityBars) {
    const total = (p.modalityCounts.cardinal || 0) + (p.modalityCounts.fixed || 0) + (p.modalityCounts.mutable || 0) || 1;
    p.modalityBars = {
      cardinal: Math.round(((p.modalityCounts.cardinal || 0) / total) * 100),
      fixed: Math.round(((p.modalityCounts.fixed || 0) / total) * 100),
      mutable: Math.round(((p.modalityCounts.mutable || 0) / total) * 100),
    };
  }
  if (masterChart?.planet_distribution) {
    const rows = Object.entries(masterChart.planet_distribution)
      .map(([house, labels]) => ({
        house,
        houseNum: Number(house),
        labels: Array.isArray(labels) ? labels : [],
      }))
      .filter((row) => row.labels.length)
      .sort((a, b) => {
        const aNum = Number.isFinite(a.houseNum) ? a.houseNum : -1;
        const bNum = Number.isFinite(b.houseNum) ? b.houseNum : -1;
        if (aNum === bNum) return 0;
        return bNum - aNum;
      })
      .map(({ house, labels }) => `${house}H：${labels.join("　")}`);
    if (rows.length) p.planetDistribution = rows;
  }
  if (masterChart?.angles) {
    const formatAngleMeta = (angle, label) => {
      if (!angle) return "";
      const sign = formatSignJa(angle.sign_ja || angle.sign || "");
      if (!sign) return "";
      const signKey = angle.sign_key || SIGN_JA_TO_KEY[sign] || SIGN_NAME_TO_KEY[String(sign || "").toLowerCase()];
      const signGlyph = SIGN_SYMBOL[signKey] || "";
      const degRaw = angle.degree ?? angle.deg;
      const degText = Number.isFinite(Number(degRaw)) ? ` ${Number(degRaw)}°` : "";
      const axisHouseMap = { ASC: 1, MC: 10, IC: 4, DC: 7 };
      const houseText = axisHouseMap[label] ? `｜${axisHouseMap[label]}H` : "";
      return `${signGlyph ? `${signGlyph} ` : ""}${sign}${degText}${houseText}`.trim();
    };
    const next = {
      asc: formatAngleMeta(masterChart.angles.asc, "ASC"),
      mc: formatAngleMeta(masterChart.angles.mc, "MC"),
      ic: formatAngleMeta(masterChart.angles.ic, "IC"),
      dc: formatAngleMeta(masterChart.angles.dc, "DC"),
    };
    const merged = { ...(p.angleMeta || {}) };
    Object.entries(next).forEach(([key, value]) => {
      if (value) merged[key] = value;
    });
    p.angleMeta = merged;
  }
  if (masterChart?.nodes) {
    const formatJaDeg = (sign, deg, houseNo, signKey) => {
      const signGlyph = SIGN_SYMBOL[signKey] ? `${SIGN_SYMBOL[signKey]} ` : "";
      const degText = Number.isFinite(Number(deg)) ? ` ${Number(deg)}°` : "";
      const houseText = Number.isFinite(Number(houseNo)) ? `｜${Number(houseNo)}H` : "";
      return `${signGlyph}${sign || ""}${degText}${houseText}`.trim();
    };
    const north = masterChart.nodes?.north || {};
    const south = masterChart.nodes?.south || {};
    const chiron = masterChart.extras?.chiron || {};
    const lilith = masterChart.extras?.lilith || {};
    const nextMeta = { ...(p.deepAxisMeta || {}) };
    if (!nextMeta.north && (north.sign_ja || north.sign)) {
      nextMeta.north = `☊ North Node　${formatJaDeg(north.sign_ja || north.sign, north.degree, north.house, north.sign_key)}`;
    }
    if (!nextMeta.south && (south.sign_ja || south.sign)) {
      nextMeta.south = `☋ South Node　${formatJaDeg(south.sign_ja || south.sign, south.degree, south.house, south.sign_key)}`;
    }
    if (!nextMeta.nodes) {
      nextMeta.nodes = [
        north.sign_ja || north.sign ? `☊ ${formatJaDeg(north.sign_ja || north.sign, north.degree, north.house, north.sign_key)}` : "",
        south.sign_ja || south.sign ? `☋ ${formatJaDeg(south.sign_ja || south.sign, south.degree, south.house, south.sign_key)}` : "",
      ].filter(Boolean).join(" / ");
    }
    if (!nextMeta.northMeta && (north.sign_ja || north.sign)) {
      nextMeta.northMeta = formatJaDeg(north.sign_ja || north.sign, north.degree, north.house, north.sign_key);
    }
    if (!nextMeta.southMeta && (south.sign_ja || south.sign)) {
      nextMeta.southMeta = formatJaDeg(south.sign_ja || south.sign, south.degree, south.house, south.sign_key);
    }
    if (!nextMeta.chiron && (chiron.sign_ja || chiron.sign)) {
      nextMeta.chiron = `${formatJaDeg(chiron.sign_ja || chiron.sign, chiron.degree, chiron.house, chiron.sign_key)}`;
    }
    if (!nextMeta.lilith && (lilith.sign_ja || lilith.sign)) {
      nextMeta.lilith = `${formatJaDeg(lilith.sign_ja || lilith.sign, lilith.degree, lilith.house, lilith.sign_key)}`;
    }
    p.deepAxisMeta = nextMeta;
  }
  if (masterChart?.angular_planets) {
    p.angularPlanets = masterChart.angular_planets;
  }
  if (masterChart?.nodes) {
    const north = masterChart.nodes?.north || {};
    const south = masterChart.nodes?.south || {};
    const nodeSigns = [];
    if (north.sign_key || north.sign_ja || north.sign) {
      nodeSigns.push({
        glyph: "☊",
        sign: north.sign_ja || north.sign || "",
        symbol: SIGN_SYMBOL[north.sign_key] || "",
      });
    }
    if (south.sign_key || south.sign_ja || south.sign) {
      nodeSigns.push({
        glyph: "☋",
        sign: south.sign_ja || south.sign || "",
        symbol: SIGN_SYMBOL[south.sign_key] || "",
      });
    }
    if (nodeSigns.length) p.nodeSigns = nodeSigns;
  }

  const formatKeyPoint = (label, signValue, degValue, houseValue) => {
    const sign = formatSignJa(signValue || "");
    if (!sign) return "";
    const deg = Number(degValue);
    const degText = Number.isFinite(deg) ? ` ${deg}°` : "";
    const house = Number(houseValue);
    const houseText = Number.isFinite(house) ? `｜${house}H` : "";
    return `${label} ${sign}${degText}${houseText}`.trim();
  };
  const keyPoints = [];
  const asc = masterChart?.angles?.asc || null;
  const mc = masterChart?.angles?.mc || null;
  if (asc?.sign_ja || asc?.sign) keyPoints.push(formatKeyPoint("ASC", asc.sign_ja || asc.sign, asc.degree, 1));
  if (mc?.sign_ja || mc?.sign) keyPoints.push(formatKeyPoint("MC", mc.sign_ja || mc.sign, mc.degree, 10));
  const northNode = masterChart?.nodes?.north || null;
  if (northNode?.sign_ja || northNode?.sign) {
    keyPoints.push(formatKeyPoint("☊ ノード", northNode.sign_ja || northNode.sign, northNode.degree, northNode.house));
  }
  const chiron = masterChart?.extras?.chiron || null;
  if (chiron?.sign_ja || chiron?.sign) {
    keyPoints.push(formatKeyPoint("⚷ キロン", chiron.sign_ja || chiron.sign, chiron.degree, chiron.house));
  }
  const lilith = masterChart?.extras?.lilith || null;
  if (lilith?.sign_ja || lilith?.sign) {
    keyPoints.push(formatKeyPoint("⚸ リリス", lilith.sign_ja || lilith.sign, lilith.degree, lilith.house));
  }
  if (keyPoints.length) {
    p.keyPointsList = keyPoints;
  }
}

module.exports = {
  extractFromMasterChart,
};
