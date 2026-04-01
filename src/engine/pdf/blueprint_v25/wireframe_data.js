"use strict";

const { buildSoraWheelSvg } = require("../../graphics/sora_wheel");
const { CORE_PLANETS } = require("../../../domain/astro/constants");
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
  SIGN_EN,
  SIGN_SYMBOL,
} = require("./constants");
const {
  toNumber,
  resolveSignKey,
  formatSignJa,
} = require("./utils");
const { buildStructureLinesFromPlanets } = require("../../../utils/data/chart_type");

function extractFromKernel({ kernel, input, p }) {
  const story = input?.story || input?.kernel?.story;
  if (story) {
    try {
      const rotationDeg = Number.isFinite(Number(input?.wheelRotationDeg))
        ? Number(input.wheelRotationDeg)
        : 0;
      const ascLonDeg = Number.isFinite(Number(input?.wheelAscLon)) ? Number(input.wheelAscLon) : null;
      const mcLonDeg = Number.isFinite(Number(input?.wheelMcLon)) ? Number(input.wheelMcLon) : null;
      p.natalWheelSvg = buildSoraWheelSvg({
        story,
        size: 900,
        rotationDeg,
        showHouses: true,
        showAspects: false,
        ascLonDeg,
        mcLonDeg,
      });
    } catch (_) {
      // keep placeholder if wheel fails
    }
  }
  if (!kernel) return;

  const signKeys = (kernel?.bodies || [])
    .map((row) => row?.kernel?.meta?.sign_key)
    .filter(Boolean);
  const uniqueSymbols = Array.from(new Set(signKeys.map((key) => SIGN_SYMBOL[key]).filter(Boolean)));
  const baseSymbols = uniqueSymbols.length ? uniqueSymbols : ["♌︎"];
  p.signatureLineSymbols = Array.from({ length: 10 }, (_, i) => baseSymbols[i % baseSymbols.length]).join(" ");

  const formatJaDeg = (signJa, deg, houseNo) => {
    const degText = Number.isFinite(Number(deg)) ? ` ${Number(deg)}°` : "";
    const houseText = Number.isFinite(Number(houseNo)) ? `｜${Number(houseNo)}H` : "";
    return `${signJa || ""}${degText}${houseText}`.trim();
  };
  const northNodeMeta = kernel?.nodes?.north?.kernel?.meta || {};
  const southNodeMeta = kernel?.nodes?.south?.kernel?.meta || {};
  const chironMeta = kernel?.chiron?.kernel?.meta || {};
  const lilithMeta = kernel?.lilith?.kernel?.meta || {};
  const angleRows = Array.isArray(kernel?.angles) ? kernel.angles : [];
  const angleMetaMap = new Map(
    angleRows.map((row) => [String(row?.key || "").toLowerCase(), row?.kernel?.meta || {}])
  );
  const placements = Array.isArray(kernel?.houses?.placements) ? kernel.houses.placements : [];
  const houseByKey = new Map(placements.map((row) => [row.key, row.house_no]));

  const nodeSigns = [];
  if (northNodeMeta.sign_ja) {
    nodeSigns.push({
      glyph: "☊",
      sign: northNodeMeta.sign_ja,
      symbol: SIGN_SYMBOL[northNodeMeta.sign_key] || "",
    });
  }
  if (southNodeMeta.sign_ja) {
    nodeSigns.push({
      glyph: "☋",
      sign: southNodeMeta.sign_ja,
      symbol: SIGN_SYMBOL[southNodeMeta.sign_key] || "",
    });
  }
  if (nodeSigns.length) {
    p.nodeSigns = nodeSigns;
  }

  const formatSignWithGlyph = (meta) => {
    if (!meta) return "";
    const sign = formatSignJa(meta.sign_ja || meta.sign || "");
    if (!sign) return "";
    const signKey = meta.sign_key || SIGN_JA_TO_KEY[sign] || SIGN_NAME_TO_KEY[String(sign || "").toLowerCase()];
    const signGlyph = SIGN_SYMBOL[signKey] || "";
    return `${signGlyph ? `${signGlyph} ` : ""}${formatJaDeg(sign, meta.deg, meta.house_no)}`.trim();
  };

  const formatAxisNode = (meta) => {
    if (!meta) return "";
    const sign = formatSignJa(meta.sign_ja || meta.sign || "");
    if (!sign) return "";
    const signKey = meta.sign_key || SIGN_JA_TO_KEY[sign] || SIGN_NAME_TO_KEY[String(sign || "").toLowerCase()];
    const signGlyph = SIGN_SYMBOL[signKey] || "";
    const degText = Number.isFinite(Number(meta.deg)) ? ` ${Number(meta.deg)}°` : "";
    const houseText = Number.isFinite(Number(meta.house_no)) ? `｜${Number(meta.house_no)}H` : "";
    return `${signGlyph ? `${signGlyph} ` : ""}${sign}${degText}${houseText}`.trim();
  };

  const formatAxisSummary = (meta) => {
    if (!meta) return "";
    const sign = formatSignJa(meta.sign_ja || meta.sign || "");
    const house = Number.isFinite(Number(meta.house_no)) ? Number(meta.house_no) : null;
    if (sign && house) return `${sign}${house}H`;
    if (sign) return sign;
    if (house) return `${house}H`;
    return "";
  };

  const formatNodeWithGlyph = (meta, label) => {
    if (!meta) return "";
    const sign = formatSignJa(meta.sign_ja || meta.sign || "");
    if (!sign) return "";
    const signKey = meta.sign_key || SIGN_JA_TO_KEY[sign] || SIGN_NAME_TO_KEY[String(sign || "").toLowerCase()];
    const signGlyph = SIGN_SYMBOL[signKey] || "";
    return `${label}　${signGlyph ? `${signGlyph} ` : ""}${formatJaDeg(sign, meta.deg, meta.house_no)}`.trim();
  };

  p.deepAxisMeta = {
    north: (northNodeMeta.sign_ja || northNodeMeta.sign)
      ? formatNodeWithGlyph(northNodeMeta, "☊ North Node")
      : "",
    south: (southNodeMeta.sign_ja || southNodeMeta.sign)
      ? formatNodeWithGlyph(southNodeMeta, "☋ South Node")
      : "",
    nodes: [
      (northNodeMeta.sign_ja || northNodeMeta.sign)
        ? `☊ ${formatSignWithGlyph(northNodeMeta)}`
        : "",
      (southNodeMeta.sign_ja || southNodeMeta.sign)
        ? `☋ ${formatSignWithGlyph(southNodeMeta)}`
        : "",
    ].filter(Boolean).join(" / "),
    northMeta: (northNodeMeta.sign_ja || northNodeMeta.sign)
      ? formatAxisNode(northNodeMeta)
      : "",
    southMeta: (southNodeMeta.sign_ja || southNodeMeta.sign)
      ? formatAxisNode(southNodeMeta)
      : "",
    northSummary: (northNodeMeta.sign_ja || northNodeMeta.sign)
      ? formatAxisSummary(northNodeMeta)
      : "",
    southSummary: (southNodeMeta.sign_ja || southNodeMeta.sign)
      ? formatAxisSummary(southNodeMeta)
      : "",
    chiron: (chironMeta.sign_ja || chironMeta.sign)
      ? `${formatSignWithGlyph(chironMeta)}`
      : "",
    lilith: (lilithMeta.sign_ja || lilithMeta.sign)
      ? `${formatSignWithGlyph(lilithMeta)}`
      : "",
  };

  const formatAngleMeta = (meta, label) => {
    if (!meta) return "";
    const sign = formatSignJa(meta.sign_ja || meta.sign || "");
    if (!sign) return "";
    const signKey = meta.sign_key || SIGN_JA_TO_KEY[sign] || SIGN_NAME_TO_KEY[String(sign || "").toLowerCase()];
    const signGlyph = SIGN_SYMBOL[signKey] || "";
    const degText = Number.isFinite(Number(meta.deg)) ? ` ${Number(meta.deg)}°` : "";
    const axisHouseMap = { ASC: 1, MC: 10, IC: 4, DC: 7 };
    const houseText = axisHouseMap[label] ? `｜${axisHouseMap[label]}H` : "";
    return `${signGlyph ? `${signGlyph} ` : ""}${sign}${degText}${houseText}`.trim();
  };
  p.angleMeta = {
    asc: formatAngleMeta(angleMetaMap.get("asc"), "ASC"),
    mc: formatAngleMeta(angleMetaMap.get("mc"), "MC"),
    ic: formatAngleMeta(angleMetaMap.get("ic"), "IC"),
    dc: formatAngleMeta(angleMetaMap.get("dc"), "DC"),
  };

  const normalizeHouseNo = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const i = Math.round(n);
    if (i < 1 || i > 12) return null;
    return i;
  };

  const pickHouseNo = (key, meta) => {
    const direct = normalizeHouseNo(meta?.house_no);
    if (direct) return direct;
    return normalizeHouseNo(houseByKey.get(key));
  };

  const formatKeyPoint = (label, meta, houseFallback = null) => {
    if (!meta) return "";
    const sign = formatSignJa(meta.sign_ja || meta.sign || "");
    if (!sign) return "";
    const houseNo = normalizeHouseNo(meta.house_no) || normalizeHouseNo(houseFallback);
    return `${label} ${formatJaDeg(sign, meta.deg, houseNo)}`.trim();
  };

  const keyPoints = [];
  const ascMeta = angleMetaMap.get("asc");
  const mcMeta = angleMetaMap.get("mc");
  if (ascMeta?.sign_ja || ascMeta?.sign) keyPoints.push(formatKeyPoint("ASC", ascMeta, 1));
  if (mcMeta?.sign_ja || mcMeta?.sign) keyPoints.push(formatKeyPoint("MC", mcMeta, 10));
  if (northNodeMeta?.sign_ja || northNodeMeta?.sign) {
    keyPoints.push(formatKeyPoint("☊ ノード", { ...northNodeMeta, house_no: pickHouseNo("north_node", northNodeMeta) }));
  }
  if (chironMeta?.sign_ja || chironMeta?.sign) {
    keyPoints.push(formatKeyPoint("⚷ キロン", { ...chironMeta, house_no: pickHouseNo("chiron", chironMeta) }));
  }
  if (lilithMeta?.sign_ja || lilithMeta?.sign) {
    keyPoints.push(formatKeyPoint("⚸ リリス", { ...lilithMeta, house_no: pickHouseNo("lilith", lilithMeta) }));
  }
  if (keyPoints.length) p.keyPointsList = keyPoints;

  const signCounts = new Map();
  (kernel.bodies || []).forEach((row) => {
    const sign = row?.kernel?.meta?.sign_ja || "";
    if (!sign) return;
    signCounts.set(sign, (signCounts.get(sign) || 0) + 1);
  });
  const sortedSigns = [...signCounts.entries()].sort((a, b) => b[1] - a[1]).map(([sign]) => sign);
  if (sortedSigns.length) p.dominantSigns = sortedSigns.slice(0, 3);

  const houseCounts = kernel?.houses?.counts || {};
  const houseSorted = Object.entries(houseCounts)
    .map(([house, count]) => ({ house: Number(house), count: toNumber(count) }))
    .sort((a, b) => (b.count - a.count) || (a.house - b.house));
  if (houseSorted.length) p.dominantHouses = houseSorted.slice(0, 3).map((row) => `${row.house}H`);
  const planetEntriesForStructure = (kernel?.bodies || []).map((row) => {
    const meta = row?.kernel?.meta || {};
    return {
      key: row?.key,
      sign_key: meta.sign_key,
      sign_ja: meta.sign_ja,
      sign: meta.sign,
      degree: meta.deg,
      house: houseByKey.get(row?.key),
    };
  });

  if (placements.length) {
    const byHouse = new Map();
    placements.forEach((row) => {
      const house = row?.house_no;
      const key = row?.key;
      if (!house || !key || !BODY_GLYPH[key]) return;
      if (!byHouse.has(house)) byHouse.set(house, []);
      byHouse.get(house).push(BODY_GLYPH[key]);
    });
    const rows = [...byHouse.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([house, glyphs]) => `${house}H ${glyphs.join(" ")}`);
    if (rows.length) p.planetDistribution = rows;
  }

  let elementCounts = null;
  const elementSummary = kernel?.summary?.element || {};
  if (elementSummary.counts) {
    elementCounts = {
      fire: toNumber(elementSummary.counts.fire),
      earth: toNumber(elementSummary.counts.earth),
      air: toNumber(elementSummary.counts.air),
      water: toNumber(elementSummary.counts.water),
    };
  } else {
    const countsLine = (elementSummary.counts_line || "").match(/\d+/g) || [];
    if (countsLine.length >= 4) {
      const [fire, earth, air, water] = countsLine.map((v) => toNumber(v));
      elementCounts = { fire, earth, air, water };
    }
  }
  if (elementCounts) {
    p.elementCounts = elementCounts;
    const total = elementCounts.fire + elementCounts.earth + elementCounts.air + elementCounts.water || 1;
    p.elementBars = {
      fire: Math.round((elementCounts.fire / total) * 100),
      earth: Math.round((elementCounts.earth / total) * 100),
      air: Math.round((elementCounts.air / total) * 100),
      water: Math.round((elementCounts.water / total) * 100),
    };
    const yang = elementCounts.fire + elementCounts.air;
    const yin = elementCounts.earth + elementCounts.water;
    if (!p.polarityText) {
      p.polarityText = yang >= yin
        ? "陽が優勢で、外側へエネルギーが流れやすい構造になる。"
        : "陰が優勢で、内側へエネルギーが集まりやすい構造になる。";
    }
  }

  if (!p.structureLines?.length) {
    const structureLines = buildStructureLinesFromPlanets(planetEntriesForStructure);
    if (structureLines?.length) p.structureLines = structureLines;
  }

  const modalitySummary = kernel?.summary?.modality || {};
  if (modalitySummary.counts) {
    const counts = {
      cardinal: toNumber(modalitySummary.counts.cardinal),
      fixed: toNumber(modalitySummary.counts.fixed),
      mutable: toNumber(modalitySummary.counts.mutable),
    };
    p.modalityCounts = counts;
    const total = counts.cardinal + counts.fixed + counts.mutable || 1;
    p.modalityBars = {
      cardinal: Math.round((counts.cardinal / total) * 100),
      fixed: Math.round((counts.fixed / total) * 100),
      mutable: Math.round((counts.mutable / total) * 100),
    };
  }

  const elementDominant = kernel?.summary?.element?.dominant?.[0];
  const modalityDominant = kernel?.summary?.modality?.dominant?.[0];
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
  const topHouse = houseSorted[0]?.house;
  if (elementDominant || modalityDominant || topHouse) {
    const elementText = elementJaMap[elementDominant] || elementDominant;
    const modalityText = modalityJaMap[modalityDominant] || modalityDominant;
    p.dominanceLines = [
      elementText ? `エレメント　${elementText}` : p.dominanceLines[0],
      modalityText ? `モード　　　${modalityText}宮` : p.dominanceLines[1],
      topHouse ? `強調ハウス　${topHouse}H` : p.dominanceLines[2],
    ];
  }

  const signByKey = new Map((kernel.bodies || []).map((row) => [row.key, row?.kernel?.meta?.sign_ja || ""]));
  const degByKey = new Map((kernel.bodies || []).map((row) => [row.key, row?.kernel?.meta?.deg ?? null]));
  const sunSign = signByKey.get("sun") || "";
  const moonSign = signByKey.get("moon") || "";
  const ascSign = kernel?.houses?.asc_sign_ja || "";
  const ascLine = p.angleMeta?.asc
    ? `ASC ${p.angleMeta.asc}`
    : ascSign
      ? `ASC ${ascSign}`
      : "";
  const sunHouse = houseByKey.get("sun");
  const moonHouse = houseByKey.get("moon");
  p.coreAxisLines = [
    sunSign && sunHouse ? `☉太陽 ${sunSign}｜${sunHouse}H` : p.coreAxisLines[0],
    moonSign && moonHouse ? `☽月 ${moonSign}｜${moonHouse}H` : p.coreAxisLines[1],
    ascLine || p.coreAxisLines[2],
  ];

  const formatBodyLine = (key) => {
    const sign = signByKey.get(key);
    const house = houseByKey.get(key);
    if (!sign) return "";
    const label = BODY_LABEL_JA[key] || key;
    const glyph = BODY_GLYPH[key] || "";
    const houseText = house ? `｜${house}H` : "";
    return `${glyph}${label}${sign}${houseText}`.trim();
  };

  p.systemLayerLines = {
    core: [
      formatBodyLine("sun"),
      formatBodyLine("moon"),
      ascLine,
    ].filter(Boolean),
    personal: [
      formatBodyLine("mercury"),
      formatBodyLine("venus"),
      formatBodyLine("mars"),
    ].filter(Boolean),
    collective: [
      formatBodyLine("jupiter"),
      formatBodyLine("saturn"),
      formatBodyLine("uranus"),
      formatBodyLine("neptune"),
      formatBodyLine("pluto"),
    ].filter(Boolean),
  };

  const coverOrder = CORE_PLANETS;
  p.coverBodies = coverOrder
    .map((key) => {
      const sign = signByKey.get(key);
      if (!sign) return "";
      const glyph = BODY_GLYPH[key] || "";
      const label = BODY_LABEL_JA[key] || key;
      return `${glyph} ${label} ${sign}`.trim();
    })
    .filter(Boolean);
  const coverSignSymbols = order
    .map((key) => {
      const sign = signByKey.get(key);
      if (!sign) return "";
      const signKey = SIGN_JA_TO_KEY[sign] || SIGN_NAME_TO_KEY[String(sign).toLowerCase()];
      return SIGN_SYMBOL[signKey] || "";
    })
    .filter(Boolean);
  if (coverSignSymbols.length) {
    p.signatureLineSymbols = coverSignSymbols.join(" ");
  }

  const aspectEdges = Array.isArray(kernel?.aspects) ? kernel.aspects : [];
  if (aspectEdges.length) {
    const nodes = new Set();
    aspectEdges.forEach((edge) => {
      if (edge?.a) nodes.add(edge.a);
      if (edge?.b) nodes.add(edge.b);
    });
    const nodeList = Array.from(nodes);
    p.aspectNetwork = {
      nodes: nodeList.map((key, idx) => ({ key, idx })),
      edges: aspectEdges.map((edge) => ({
        a: edge.a,
        b: edge.b,
        type: edge.type || "",
      })),
    };
  }
}

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
      return trimmed.slice(roleLine.length).replace(/^\s*\n/, "");
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
    const parts = String(rawKey).toLowerCase().split(/[_\-]/g).filter(Boolean);
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
    p.dominantSigns = aggregateForDominance.sortedSigns
      .slice(0, 3)
      .map(([key]) => SIGN_JA[key] || SIGN_EN[key] || key)
      .filter(Boolean);
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

function finalizeWireframeData({ p, placeholders, elementCountsInput, modalityCountsInput, masterChart }) {
  if (!p.signatureLineSymbols) {
    if (masterChart?.planets?.length) {
      const signKeys = masterChart.planets
        .map((row) => row?.sign_key)
        .filter(Boolean);
      const uniqueSymbols = Array.from(new Set(signKeys.map((key) => SIGN_SYMBOL[key]).filter(Boolean)));
      const baseSymbols = uniqueSymbols.length ? uniqueSymbols : ["♌︎"];
      p.signatureLineSymbols = Array.from({ length: 10 }, (_, i) => baseSymbols[i % baseSymbols.length]).join(" ");
    } else {
      p.signatureLineSymbols = "♌︎ ♌︎ ♌︎ ♌︎ ♌︎ ♌︎ ♌︎ ♌︎ ♌︎ ♌︎";
    }
  }

  if (!p.coverBodies || !p.coverBodies.length) {
    p.coverBodies = placeholders.coverBodies || [];
  }

  if (!p.coverHeading) {
    const primary = p.dominantSigns?.[0];
    p.coverHeading = primary ? `${primary}の強い輝き` : "星の強い輝き";
  }

  if (!p.coverBodyText) {
    p.coverBodyText = p.starSignatureText || p.coreSnapshot || "";
  }

  if (!p.dominantSignsText && p.dominantSigns?.length) {
    const list = p.dominantSigns.join("・");
    p.dominantSignsText = `${list}がチャートの重心になり、全体のテーマがそこに集まりやすい構造になる。`;
  }
  if (!p.dominantHousesText && p.dominantHouses?.length) {
    const list = p.dominantHouses.join("・");
    p.dominantHousesText = `${list}が強調され、その領域が人生の焦点になりやすい。`;
  }
  if (!p.planetDistributionText && p.planetDistribution?.length) {
    const top = p.planetDistribution[0]?.split(" ")[0] || "";
    p.planetDistributionText = top
      ? `${top}に天体が集まり、そこが活動の中心テーマになりやすい。`
      : "天体が特定のハウスに集まり、そこが活動の焦点になりやすい。";
  }

  const resolveDominanceLines = () => {
    const elementCounts = elementCountsInput || masterChart?.element_balance || null;
    const modalityCounts = modalityCountsInput || masterChart?.modality_balance || null;
    const elementOrder = ["fire", "earth", "air", "water"];
    const modalityOrder = ["cardinal", "fixed", "mutable"];
    const elementJaMap = { fire: "火", earth: "地", air: "風", water: "水" };
    const modalityJaMap = { cardinal: "活動", fixed: "不動", mutable: "柔軟" };
    const pickTopKeys = (counts, order) => {
      if (!counts) return [];
      const entries = order.map((key) => ({ key, count: Number(counts[key] || 0) }));
      const max = Math.max(...entries.map((e) => e.count));
      if (!Number.isFinite(max) || max <= 0) return [];
      return entries.filter((e) => e.count === max).map((e) => e.key);
    };
    const elementKeys = pickTopKeys(elementCounts, elementOrder);
    const modalityKeys = pickTopKeys(modalityCounts, modalityOrder);
    const elementText = elementKeys.length
      ? elementKeys.map((k) => elementJaMap[k] || k).join("・")
      : null;
    const modalityText = modalityKeys.length
      ? modalityKeys.map((k) => modalityJaMap[k] || k).join("・")
      : null;

    let topHouses = [];
    let entries = [];
    if (masterChart?.planet_distribution && typeof masterChart.planet_distribution === "object") {
      entries = Object.entries(masterChart.planet_distribution)
        .map(([house, list]) => ({ house: Number(house), count: Array.isArray(list) ? list.length : 0 }));
    } else if (masterChart?.house_counts) {
      entries = Object.entries(masterChart.house_counts)
        .map(([house, count]) => ({ house: Number(house), count: Number(count || 0) }));
    }

    entries = entries.filter((row) => Number.isFinite(row.house) && Number.isFinite(row.count));
    const sorted = entries
      .filter((e) => e.count > 0)
      .sort((a, b) => (b.count - a.count) || (a.house - b.house));
    if (sorted.length) {
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
      topHouses = picked.map((e) => e.house);

      const houseByKey = new Map((masterChart?.planets || []).map((p) => [p.key, p.house]));
      const mcHouse = Number(masterChart?.angles?.mc?.house);
      const focusKeys = ["sun", "moon", "mercury"];
      const focusScore = (house) => focusKeys.reduce((sum, key) => sum + (houseByKey.get(key) === house ? 1 : 0), 0);
      const maxCount = sorted[0]?.count ?? null;
      const tied = sorted.filter((e) => e.count === maxCount);
      if (tied.length) {
        const focusPick = tied
          .map((row) => ({
            ...row,
            focus: focusScore(row.house),
            mc: Number.isFinite(mcHouse) && mcHouse === row.house ? 1 : 0,
          }))
          .sort((a, b) => (b.focus - a.focus) || (b.mc - a.mc) || (a.house - b.house))[0];
        if (focusPick?.house) p.dominancePrimaryHouse = focusPick.house;
      }
    } else if (Array.isArray(masterChart?.dominant_houses) && masterChart.dominant_houses.length) {
      topHouses = masterChart.dominant_houses.map((row) => row?.house).filter(Number.isFinite);
      if (topHouses.length) p.dominancePrimaryHouse = topHouses[0];
    }

    if (!p.dominanceLines || p.dominanceLines.length < 3) {
      p.dominanceLines = placeholders.dominanceLines || [];
    }
    if (elementText) p.dominanceLines[0] = `エレメント　${elementText}`;
    if (modalityText) p.dominanceLines[1] = `モード　　　${modalityText}宮`;
    if (topHouses.length) {
      let primaryHouse = Number.isFinite(p.dominancePrimaryHouse) ? p.dominancePrimaryHouse : null;
      if (!Number.isFinite(primaryHouse) && Array.isArray(p.dominantHouses) && p.dominantHouses.length) {
        const first = Number(String(p.dominantHouses[0]).replace(/H/i, ""));
        if (Number.isFinite(first)) primaryHouse = first;
      }
      if (!Number.isFinite(primaryHouse)) primaryHouse = topHouses[0];
      if (Number.isFinite(primaryHouse)) {
        p.dominanceLines[2] = `強調ハウス　${primaryHouse}H`;
      }
    }
  };
  resolveDominanceLines();
  if (!p.starStructureText && p.coreSnapshot) p.starStructureText = p.coreSnapshot;
  if (!p.natalObservation && p.coreSnapshot) p.natalObservation = p.coreSnapshot;
  if (!p.aspectEnergyText && p.aspectMap?.length) {
    p.aspectEnergyText = p.aspectMap.slice(0, 2).join(" / ");
  }
  if (!p.aspectSummaryText && p.aspectMap?.length) {
    p.aspectSummaryText = p.aspectMap.slice(-1)[0] || "";
  }
  if (!p.patternName && p.chartPattern) p.patternName = "Star Pattern";
  if (!p.structuralFlow && p.chartPattern) p.structuralFlow = p.chartPattern;

  if (!p.planetRolesAll || !p.planetRolesAll.length) {
    p.planetRolesAll = placeholders.planetRolesAll || [];
  }
  if (!p.systemLayerLines || !p.systemLayerLines.core?.length) {
    p.systemLayerLines = placeholders.systemLayerLines || p.systemLayerLines || {};
  }
  if (!p.drivingForceLines || !p.drivingForceLines.length) {
    p.drivingForceLines = placeholders.drivingForceLines || placeholders.starFocusLines || [];
  }
  if (!p.nodeSigns || !p.nodeSigns.length) {
    p.nodeSigns = placeholders.nodeSigns || [];
  }
  const roleByKey = new Map(p.planetRolesAll.map((card) => [card.key, card]));
  const pickRoles = (keys) => keys.map((key) => roleByKey.get(key)).filter(Boolean);
  p.planetRolesCore = pickRoles(["sun", "moon"]);
  p.planetRolesPersonal = pickRoles(["mercury", "venus", "mars"]);
  p.planetRolesSocial = pickRoles(["jupiter", "saturn"]);
  p.planetRolesTrans = pickRoles(["uranus", "neptune", "pluto"]);

  const formatAngularPlanets = (angular) => {
    if (!angular || typeof angular !== "object") return [];
    const parts = [];
    const order = ["asc", "mc", "ic", "dc"];
    const labelMap = { asc: "ASC", mc: "MC", ic: "IC", dc: "DC" };
    order.forEach((key) => {
      const list = Array.isArray(angular[key]) ? angular[key] : [];
      if (!list.length) return;
      list.forEach((row) => {
        const planetKey = row?.planet || "";
        const glyph = BODY_GLYPH[planetKey] || "";
        const label = BODY_LABEL_JA[planetKey] || planetKey;
        const orb = Number.isFinite(Number(row?.orb)) ? `orb ${Number(row.orb).toFixed(1)}°` : "";
        parts.push(`${labelMap[key]}近接　${glyph}${label}｜${orb}`.trim());
      });
    });
    return parts;
  };
  if (p.angularPlanets && !Array.isArray(p.angularPlanets)) {
    p.angularPlanets = formatAngularPlanets(p.angularPlanets);
  }
  if (Array.isArray(p.angularPlanets) && p.angularPlanets.length === 0) {
    p.angularPlanets = ["なし"];
  }

  if (elementCountsInput && !p.elementCounts) {
    p.elementCounts = {
      fire: toNumber(elementCountsInput.fire),
      earth: toNumber(elementCountsInput.earth),
      air: toNumber(elementCountsInput.air),
      water: toNumber(elementCountsInput.water),
    };
  }
  if (modalityCountsInput && !p.modalityCounts) {
    p.modalityCounts = {
      cardinal: toNumber(modalityCountsInput.cardinal),
      fixed: toNumber(modalityCountsInput.fixed),
      mutable: toNumber(modalityCountsInput.mutable),
    };
  }
  if (p.elementCounts && !p.elementBars) {
    const total =
      (p.elementCounts.fire || 0) +
      (p.elementCounts.earth || 0) +
      (p.elementCounts.air || 0) +
      (p.elementCounts.water || 0) ||
      1;
    p.elementBars = {
      fire: Math.round(((p.elementCounts.fire || 0) / total) * 100),
      earth: Math.round(((p.elementCounts.earth || 0) / total) * 100),
      air: Math.round(((p.elementCounts.air || 0) / total) * 100),
      water: Math.round(((p.elementCounts.water || 0) / total) * 100),
    };
  }
  if (p.modalityCounts && !p.modalityBars) {
    const total =
      (p.modalityCounts.cardinal || 0) +
      (p.modalityCounts.fixed || 0) +
      (p.modalityCounts.mutable || 0) ||
      1;
    p.modalityBars = {
      cardinal: Math.round(((p.modalityCounts.cardinal || 0) / total) * 100),
      fixed: Math.round(((p.modalityCounts.fixed || 0) / total) * 100),
      mutable: Math.round(((p.modalityCounts.mutable || 0) / total) * 100),
    };
  }
  if (p.modalityCounts) {
    const cardinal = Number(p.modalityCounts.cardinal || 0);
    const fixed = Number(p.modalityCounts.fixed || 0);
    const mutable = Number(p.modalityCounts.mutable || 0);
    const tieTop = cardinal === fixed && cardinal > 0;
    const noneMutable = mutable === 0;
    if (tieTop && noneMutable) {
      p.modalityBalanceText = "活動宮と不動宮が拮抗し、柔軟宮が欠ける構造。";
    } else if (noneMutable && cardinal > fixed) {
      p.modalityBalanceText = "活動宮が強く、柔軟宮が欠ける構造。";
    } else if (noneMutable && fixed > cardinal) {
      p.modalityBalanceText = "不動宮が強く、柔軟宮が欠ける構造。";
    }
  }

  if (!p.deepAxis) p.deepAxis = placeholders.deepAxis || {};
  if (!p.deepAxisMeta) p.deepAxisMeta = placeholders.deepAxisMeta || {};
  if (!p.anglesText) p.anglesText = placeholders.anglesText || {};
  if (!p.anglesIntro) p.anglesIntro = placeholders.anglesIntro || "";
  if (!p.angularPlanets) p.angularPlanets = placeholders.angularPlanets || {};
  if (!p.angleMeta) p.angleMeta = placeholders.angleMeta || {};
}

function buildWireframeData(input, placeholders) {
  const p = { ...placeholders };
  const src = input || {};
  p.wheelRotationDeg = Number.isFinite(Number(src?.wheelRotationDeg)) ? Number(src.wheelRotationDeg) : 0;
  p.wheelAscLon = Number.isFinite(Number(src?.wheelAscLon)) ? Number(src.wheelAscLon) : null;
  p.wheelMcLon = Number.isFinite(Number(src?.wheelMcLon)) ? Number(src.wheelMcLon) : null;
  const blueprint = src.blueprint || src;
  const kernel = src.kernel || blueprint?.kernel || src.input?.kernel || null;
  const splitLines = (text) => {
    const raw = String(text || "");
    if (!raw) return [];
    return raw
      .split(/\n|・|•|·/g)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  if (src.displayName) p.displayName = src.displayName;
  if (src.ownerName) p.ownerName = src.ownerName;
  if (src.birthText) p.birthText = src.birthText;
  if (src.displayLabel) p.displayLabel = src.displayLabel;
  if (src.birth_text) p.birthText = src.birth_text;
  if (src.owner_name) p.ownerName = src.owner_name;

  if (blueprint?.core_tagline) p.coreTagline = blueprint.core_tagline;
  if (blueprint?.core_snapshot) p.coreSnapshot = blueprint.core_snapshot;
  const masterChart = blueprint?.master_chart || src?.master_chart || null;
  const elementCountsInput = src?.elementCounts || src?.element_counts || null;
  const modalityCountsInput = src?.modalityCounts || src?.modality_counts || null;
  if (blueprint?.core_snapshot && !p.starStructureText) p.starStructureText = blueprint.core_snapshot;
  if (blueprint?.dashboard?.element_balance) p.elementBalanceText = blueprint.dashboard.element_balance;
  if (blueprint?.dashboard?.modality_balance) p.modalityBalanceText = blueprint.dashboard.modality_balance;
  if (blueprint?.dashboard?.energy_flow) p.energyFlowText = blueprint.dashboard.energy_flow;
  if (blueprint?.chart_pattern) p.chartPattern = blueprint.chart_pattern;
  if (blueprint?.closing_summary) p.closingSummary = blueprint.closing_summary;
  if (blueprint?.deep_axis) p.deepAxis = blueprint.deep_axis;
  if (blueprint?.star_drive) p.drivingForceLines = splitLines(blueprint.star_drive);
  if (!p.drivingForceLines?.length && blueprint?.driving_force) {
    p.drivingForceLines = splitLines(blueprint.driving_force);
  }
  if (!p.drivingForceLines?.length && blueprint?.star_focus) p.drivingForceLines = splitLines(blueprint.star_focus);
  if (!p.drivingForceLines?.length && blueprint?.cosmic_focus) p.drivingForceLines = splitLines(blueprint.cosmic_focus);
  if (blueprint?.star_signature) {
    p.starSignatureText = blueprint.star_signature;
    p.starSignature = splitLines(blueprint.star_signature);
  } else if (blueprint?.cosmic_signature) {
    p.starSignatureText = blueprint.cosmic_signature;
    p.starSignature = splitLines(blueprint.cosmic_signature);
  }
  if (blueprint?.dashboard?.dominant_signs) {
    p.dominantSignsText = blueprint.dashboard.dominant_signs;
  }
  if (blueprint?.natal_observation) p.natalObservation = blueprint.natal_observation;
  if (blueprint?.aspect_dynamics) p.aspectEnergyText = blueprint.aspect_dynamics;
  if (blueprint?.pattern_name) p.patternName = blueprint.pattern_name;
  if (blueprint?.structural_flow) p.structuralFlow = blueprint.structural_flow;
  if (!p.structuralFlow && blueprint?.life_direction) p.structuralFlow = blueprint.life_direction;
  if (blueprint?.aspect_map) {
    let rows = [];
    if (Array.isArray(blueprint.aspect_map)) {
      rows = blueprint.aspect_map
        .map((row) => {
          if (typeof row === "string") return { key: "", type: "", text: row };
          return { key: row?.key || "", type: row?.type || "", text: row?.text || "" };
        })
        .filter((row) => row.text);
    } else if (typeof blueprint.aspect_map === "object") {
      rows = Object.entries(blueprint.aspect_map).map(([key, value]) => ({
        key,
        type: value?.type || "",
        text: value?.text || "",
      })).filter((row) => row.text);
    }
    if (rows.length) {
      p.aspectMapRows = rows;
      p.aspectMap = rows.map((row) => row.text).filter(Boolean);
    }
  }
  if (blueprint?.system_layers || blueprint?.planet_groups) {
    const systemLayers = blueprint?.system_layers || {};
    const planetGroups = blueprint?.planet_groups || {};
    p.planetGroups = {
      core: systemLayers.core || planetGroups.core || p.planetGroups?.core,
      personal: systemLayers.personal || planetGroups.personal || p.planetGroups?.personal,
      socialTranspersonal:
        systemLayers.collective ||
        planetGroups.social_transpersonal ||
        planetGroups.social ||
        p.planetGroups?.socialTranspersonal ||
        p.planetGroups?.social,
    };
  }

  if (blueprint?.planet_roles) {
    const order = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
    const signByKey = new Map();
    const degByKey = new Map();
    const houseByKey = new Map();

    (kernel?.bodies || []).forEach((row) => {
      const sign = row?.kernel?.meta?.sign_ja || "";
      const deg = row?.kernel?.meta?.deg;
      if (sign) signByKey.set(row.key, sign);
      if (deg !== undefined) degByKey.set(row.key, deg);
    });
    (kernel?.houses?.placements || []).forEach((row) => {
      if (row?.key) houseByKey.set(row.key, row.house_no);
    });

    if ((!signByKey.size || !houseByKey.size) && Array.isArray(masterChart?.planets)) {
      masterChart.planets.forEach((row) => {
        if (!row?.key) return;
        if (row.sign_ja) signByKey.set(row.key, formatSignJa(row.sign_ja));
        else if (row.sign) signByKey.set(row.key, formatSignJa(row.sign));
        if (row.degree !== undefined && row.degree !== null) degByKey.set(row.key, row.degree);
        if (row.house !== undefined && row.house !== null) houseByKey.set(row.key, row.house);
      });
    }

    const formatSignDegree = (key) => {
      const signJa = signByKey.get(key) || "";
      const deg = degByKey.get(key);
      const degText = Number.isFinite(Number(deg)) ? ` ${Number(deg)}°` : "";
      return `${signJa}${degText}`.trim();
    };
    p.planetRolesAll = order.map((key) => {
      const glyph = BODY_GLYPH[key] || "";
      const label = BODY_LABEL_JA[key] || key;
      const sign = formatSignDegree(key);
      const house = houseByKey.get(key);
      const meta = sign && house ? `${sign}｜${house}H` : sign || "";
      const text = blueprint.planet_roles?.[key] || "";
      return { key, label: `${glyph} ${label}`, meta, text };
    });
  }

  const prependLine = (text, line) => {
    if (!line) return text || "";
    const body = String(text || "");
    const trimmed = body.trimStart();
    if (!trimmed) return line;
    if (trimmed.startsWith(line)) return body;
    return `${line}\n${body}`.trim();
  };
  const stripRoleLine = (text, line) => {
    if (!line) return text || "";
    const body = String(text || "");
    const trimmed = body.trimStart();
    if (!trimmed.startsWith(line)) return body;
    return trimmed.slice(line.length).replace(/^\s*\n/, "");
  };

  if (blueprint?.deep_axis) {
    p.deepAxis = {
      nodes: blueprint.deep_axis.nodes || p.deepAxis?.nodes,
      nodes_north:
        blueprint.deep_axis.nodes_north ||
        blueprint.deep_axis.deep_nodes_north ||
        blueprint.deep_axis.north ||
        p.deepAxis?.nodes_north ||
        p.deepAxis?.north,
      nodes_south:
        blueprint.deep_axis.nodes_south ||
        blueprint.deep_axis.deep_nodes_south ||
        blueprint.deep_axis.south ||
        p.deepAxis?.nodes_south ||
        p.deepAxis?.south,
      chiron: blueprint.deep_axis.chiron || p.deepAxis?.chiron,
      lilith: blueprint.deep_axis.lilith || p.deepAxis?.lilith,
    };
  }
  if (p.deepAxis) {
    const splitAxisText = (text) => {
      const raw = String(text || "").trim();
      if (!raw) return { north: "", south: "" };
      const sentences = raw.match(/[^。]+。?/g)?.map((s) => s.trim()).filter(Boolean) || [];
      if (sentences.length === 0) return { north: "", south: "" };
      if (sentences.length === 1) return { north: sentences[0], south: "" };
      const north = [];
      const south = [];
      sentences.forEach((s, idx) => {
        if (idx % 2 === 0) north.push(s);
        else south.push(s);
      });
      return { north: north.join(""), south: south.join("") };
    };
    const axisSplit = splitAxisText(p.deepAxis.nodes);
    p.deepAxis = {
      ...p.deepAxis,
      nodes: p.deepAxis.nodes,
      nodesNorth:
        p.deepAxis?.nodes_north ||
        p.deepAxis?.deep_nodes_north ||
        p.deepAxis?.north ||
        axisSplit.north,
      nodesSouth:
        p.deepAxis?.nodes_south ||
        p.deepAxis?.deep_nodes_south ||
        p.deepAxis?.south ||
        axisSplit.south,
      chiron: prependLine(p.deepAxis.chiron, DEEP_AXIS_ROLE_TAGLINES.chiron),
      lilith: prependLine(p.deepAxis.lilith, DEEP_AXIS_ROLE_TAGLINES.lilith),
    };
  }

  if (blueprint?.angles) {
    p.anglesText = {
      asc: blueprint.angles.asc || p.anglesText?.asc,
      mc: blueprint.angles.mc || p.anglesText?.mc,
      ic: blueprint.angles.ic || p.anglesText?.ic,
      dc: blueprint.angles.dc || p.anglesText?.dc,
    };
    if (blueprint.angles.intro) p.anglesIntro = blueprint.angles.intro;
  }
  if (p.anglesText) {
    p.angleRoles = {
      asc: AXIS_ROLE_TAGLINES.asc,
      mc: AXIS_ROLE_TAGLINES.mc,
      ic: AXIS_ROLE_TAGLINES.ic,
      dc: AXIS_ROLE_TAGLINES.dc,
    };
    p.anglesText = {
      ...p.anglesText,
      asc: stripRoleLine(p.anglesText.asc, AXIS_ROLE_TAGLINES.asc),
      mc: stripRoleLine(p.anglesText.mc, AXIS_ROLE_TAGLINES.mc),
      ic: stripRoleLine(p.anglesText.ic, AXIS_ROLE_TAGLINES.ic),
      dc: stripRoleLine(p.anglesText.dc, AXIS_ROLE_TAGLINES.dc),
    };
  }
  if (blueprint?.angles_intro) p.anglesIntro = blueprint.angles_intro;
  if (!p.angularPlanets && blueprint?.angular_planets) {
    p.angularPlanets = blueprint.angular_planets;
  }
  if (!p.angularPlanets && masterChart?.angular_planets && typeof masterChart.angular_planets === "object") {
    p.angularPlanets = masterChart.angular_planets;
  }

  if (!p.aspectWheelAspects && Array.isArray(p.aspectMapRows) && Array.isArray(masterChart?.major_aspects)) {
    const normalizeKey = (a, b) => [String(a || "").toLowerCase(), String(b || "").toLowerCase()].sort().join("_");
    const mapKeys = new Map(
      p.aspectMapRows
        .filter((row) => row?.key)
        .map((row) => [normalizeKey(...String(row.key).split("_")), row])
    );
    const filtered = masterChart.major_aspects
      .map((row) => ({
        a: row?.p1_key || row?.p1 || "",
        b: row?.p2_key || row?.p2 || "",
        type: row?.type || "",
        orb: Number(row?.orb ?? row?.orb_deg ?? null),
      }))
      .filter((row) => row.a && row.b)
      .filter((row) => {
        const key = normalizeKey(row.a, row.b);
        const hit = mapKeys.get(key);
        if (!hit) return false;
        if (hit.type && String(hit.type).toLowerCase() !== String(row.type).toLowerCase()) return false;
        return true;
      });
    if (filtered.length) p.aspectWheelAspects = filtered;
  }

  extractFromKernel({ kernel, input, p });
  extractFromMasterChart({ masterChart, p });
  finalizeWireframeData({ p, placeholders, elementCountsInput, modalityCountsInput, masterChart });

  return p;
}

module.exports = {
  buildWireframeData,
};
