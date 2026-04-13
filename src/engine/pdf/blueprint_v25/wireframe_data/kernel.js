"use strict";

const { buildSoraWheelSvg } = require("../../../graphics/sora_wheel");
const { CORE_PLANETS } = require("../../../../domain/astro/constants");
const {
  BODY_GLYPH,
  BODY_LABEL_JA,
  SIGN_JA_TO_KEY,
  SIGN_NAME_TO_KEY,
  SIGN_SYMBOL,
} = require("../constants");
const {
  formatSignWithGlyph,
  formatAxisNode,
  formatAxisSummary,
  formatNodeWithGlyph,
  formatAngleMeta,
  pickHouseNo,
  formatKeyPoint,
  formatBodyLine,
} = require("./formatters");
const {
  buildDominantSignsFromKernel,
  buildHouseSorted,
  parseElementCounts,
  buildElementBars,
  parseModalityCounts,
  buildModalityBars,
  buildDominanceLines,
} = require("./counts");
const { buildStructureLinesFromPlanets } = require("../../../../utils/data/chart_type");

function extractFromKernel({ kernel, input, p }) {
  const story = input?.story || input?.kernel?.story;
  if (story) {
    try {
      const normalizeCusps = (raw) => {
        if (!Array.isArray(raw)) return null;
        const list = raw.length === 13 ? raw.slice(1) : raw;
        if (list.length !== 12) return null;
        const vals = list.map((v) => Number(v));
        if (vals.some((v) => !Number.isFinite(v))) return null;
        return vals;
      };
      const houseCusps =
        normalizeCusps(input?.houseCusps || input?.house_cusps || input?.wheelHouseCusps || input?.wheel_house_cusps) ||
        normalizeCusps(input?.blueprint?.house_cusps || input?.blueprint?.houseCusps) ||
        null;
      const houseSystem = input?.houseSystem || input?.house_system || input?.wheelHouseSystem || input?.wheel_house_system || null;
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
        houseCusps,
        houseSystem,
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

  p.angleMeta = {
    asc: formatAngleMeta(angleMetaMap.get("asc"), "ASC"),
    mc: formatAngleMeta(angleMetaMap.get("mc"), "MC"),
    ic: formatAngleMeta(angleMetaMap.get("ic"), "IC"),
    dc: formatAngleMeta(angleMetaMap.get("dc"), "DC"),
  };

  const keyPoints = [];
  const ascMeta = angleMetaMap.get("asc");
  const mcMeta = angleMetaMap.get("mc");
  if (ascMeta?.sign_ja || ascMeta?.sign) keyPoints.push(formatKeyPoint("ASC", ascMeta, 1));
  if (mcMeta?.sign_ja || mcMeta?.sign) keyPoints.push(formatKeyPoint("MC", mcMeta, 10));
  if (northNodeMeta?.sign_ja || northNodeMeta?.sign) {
    keyPoints.push(formatKeyPoint("☊ ノード", { ...northNodeMeta, house_no: pickHouseNo("north_node", northNodeMeta, houseByKey) }));
  }
  if (chironMeta?.sign_ja || chironMeta?.sign) {
    keyPoints.push(formatKeyPoint("⚷ キロン", { ...chironMeta, house_no: pickHouseNo("chiron", chironMeta, houseByKey) }));
  }
  if (lilithMeta?.sign_ja || lilithMeta?.sign) {
    keyPoints.push(formatKeyPoint("⚸ リリス", { ...lilithMeta, house_no: pickHouseNo("lilith", lilithMeta, houseByKey) }));
  }
  if (keyPoints.length) p.keyPointsList = keyPoints;

  const dominantSigns = buildDominantSignsFromKernel(kernel);
  if (dominantSigns.length) p.dominantSigns = dominantSigns;

  const houseSorted = buildHouseSorted(kernel?.houses?.counts || {});
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

  const elementSummary = kernel?.summary?.element || {};
  const elementCounts = parseElementCounts(elementSummary);
  if (elementCounts) {
    p.elementCounts = elementCounts;
    p.elementBars = buildElementBars(elementCounts);
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
  const modalityCounts = parseModalityCounts(modalitySummary);
  if (modalityCounts) {
    p.modalityCounts = modalityCounts;
    p.modalityBars = buildModalityBars(modalityCounts);
  }

  const elementDominant = kernel?.summary?.element?.dominant?.[0];
  const modalityDominant = kernel?.summary?.modality?.dominant?.[0];
  const topHouse = houseSorted[0]?.house;
  p.dominanceLines = buildDominanceLines({
    elementDominant,
    modalityDominant,
    topHouse,
    currentLines: p.dominanceLines,
  });

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

  const formatBodyLineForKey = (key) => formatBodyLine(key, signByKey, houseByKey);

  p.systemLayerLines = {
    core: [
      formatBodyLineForKey("sun"),
      formatBodyLineForKey("moon"),
      ascLine,
    ].filter(Boolean),
    personal: [
      formatBodyLineForKey("mercury"),
      formatBodyLineForKey("venus"),
      formatBodyLineForKey("mars"),
    ].filter(Boolean),
    collective: [
      formatBodyLineForKey("jupiter"),
      formatBodyLineForKey("saturn"),
      formatBodyLineForKey("uranus"),
      formatBodyLineForKey("neptune"),
      formatBodyLineForKey("pluto"),
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
  const coverSignSymbols = coverOrder
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

module.exports = {
  extractFromKernel,
};
