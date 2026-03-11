"use strict";

const path = require("path");
const { buildSpaceBackground } = require("../../shared/space_background");
const { buildSoraWheelSvg } = require("../../graphics/sora_wheel");
const { SIGN_EN, SIGN_SYMBOL } = require("../blueprint_light/shared");
const { BACKGROUND_COLORS } = require("../../shared/space_background/constants");

const PAGE_WIDTH = 1080;
const PAGE_HEIGHT = 1920;
const TOTAL_SLIDES = 9;

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSpaceSvg({ variant, enabled }) {
  if (!enabled) {
    return [
      `<svg class="bg-space__svg" xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" preserveAspectRatio="xMidYMid slice">`,
      `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${BACKGROUND_COLORS.bgDeep}"/>`,
      `</svg>`,
    ].join("");
  }
  const bg = buildSpaceBackground({ width: PAGE_WIDTH, height: PAGE_HEIGHT, variant });
  return [
    `<svg class="bg-space__svg" xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" preserveAspectRatio="xMidYMid slice">`,
    `<rect width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" fill="${BACKGROUND_COLORS.bgDeep}"/>`,
    `<defs>${bg.defs}</defs>`,
    bg.body,
    `</svg>`,
  ].join("");
}

function buildFontFaceCss() {
  const fontDir = path.resolve(__dirname, "..", "..", "..", "..", "assets", "fonts");
  const shipp = path.join(fontDir, "ShipporiMincho-Regular.ttf");
  const shippBold = path.join(fontDir, "ShipporiMincho-Bold.ttf");
  const zen = path.join(fontDir, "ZenKakuGothicNew-Regular.ttf");
  const zenMed = path.join(fontDir, "ZenKakuGothicNew-Medium.ttf");
  const zenBold = path.join(fontDir, "ZenKakuGothicNew-Bold.ttf");
  const notoSymbols = path.join(fontDir, "NotoSansSymbols-Regular.ttf");
  const notoSymbols2 = path.join(fontDir, "NotoSansSymbols2-Regular.ttf");
  const symbola = path.join(fontDir, "Symbola_hint.ttf");

  const toFileUrl = (p) => `file://${p}`;
  return [
    `@font-face { font-family: 'Shippori Mincho'; src: url('${toFileUrl(shipp)}') format('truetype'); font-weight: 400; font-style: normal; }`,
    `@font-face { font-family: 'Shippori Mincho'; src: url('${toFileUrl(shippBold)}') format('truetype'); font-weight: 700; font-style: normal; }`,
    `@font-face { font-family: 'Zen Kaku Gothic'; src: url('${toFileUrl(zen)}') format('truetype'); font-weight: 400; font-style: normal; }`,
    `@font-face { font-family: 'Zen Kaku Gothic'; src: url('${toFileUrl(zenMed)}') format('truetype'); font-weight: 500; font-style: normal; }`,
    `@font-face { font-family: 'Zen Kaku Gothic'; src: url('${toFileUrl(zenBold)}') format('truetype'); font-weight: 700; font-style: normal; }`,
    `@font-face { font-family: 'Noto Symbols'; src: url('${toFileUrl(notoSymbols)}') format('truetype'); font-weight: 400; font-style: normal; }`,
    `@font-face { font-family: 'Noto Symbols 2'; src: url('${toFileUrl(notoSymbols2)}') format('truetype'); font-weight: 400; font-style: normal; }`,
    `@font-face { font-family: 'Symbola'; src: url('${toFileUrl(symbola)}') format('truetype'); font-weight: 400; font-style: normal; }`,
  ].join("\n");
}

function buildCosmicNav(activeIndex) {
  const dots = Array.from({ length: TOTAL_SLIDES }, (_, i) => {
    const isActive = i === activeIndex;
    return `<span class="nav-dot ${isActive ? "active" : ""}">${isActive ? "★" : "○"}</span>`;
  }).join("");
  return `<div class="cosmic-nav">${dots}</div>`;
}

const BODY_GLYPH = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
};

const BODY_LABEL_JA = {
  sun: "太陽",
  moon: "月",
  mercury: "水星",
  venus: "金星",
  mars: "火星",
  jupiter: "木星",
  saturn: "土星",
  uranus: "天王星",
  neptune: "海王星",
  pluto: "冥王星",
  asc: "ASC",
};

function buildWireframeData(input, placeholders) {
  const p = { ...placeholders };
  const src = input || {};
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

  if (blueprint?.core_snapshot) p.coreSnapshot = blueprint.core_snapshot;
  const masterChart = blueprint?.master_chart || src?.master_chart || null;
  if (blueprint?.core_snapshot && !p.cosmicStructureText) p.cosmicStructureText = blueprint.core_snapshot;
  if (blueprint?.dashboard?.element_balance) p.elementBalanceText = blueprint.dashboard.element_balance;
  if (blueprint?.dashboard?.modality_balance) p.modalityBalanceText = blueprint.dashboard.modality_balance;
  if (blueprint?.dashboard?.energy_flow) p.energyFlowText = blueprint.dashboard.energy_flow;
  if (blueprint?.dashboard?.cosmic_structure) p.structureSummaryText = blueprint.dashboard.cosmic_structure;
  if (blueprint?.chart_pattern) p.chartPattern = blueprint.chart_pattern;
  if (blueprint?.closing_summary) p.closingSummary = blueprint.closing_summary;
  if (blueprint?.deep_axis) p.deepAxis = blueprint.deep_axis;
  if (blueprint?.cosmic_focus) p.cosmicFocusLines = splitLines(blueprint.cosmic_focus);
  if (blueprint?.cosmic_traits) p.cosmicTraitsLines = splitLines(blueprint.cosmic_traits);
  if (blueprint?.cosmic_signature) p.cosmicSignature = splitLines(blueprint.cosmic_signature);
  if (blueprint?.dashboard?.dominant_signs) {
    p.dominantSignsText = blueprint.dashboard.dominant_signs;
  }
  if (blueprint?.natal_observation) p.natalObservation = blueprint.natal_observation;
  if (blueprint?.deep_pattern) p.deepPatternText = blueprint.deep_pattern;
  if (blueprint?.aspect_dynamics) p.aspectEnergyText = blueprint.aspect_dynamics;
  if (blueprint?.pattern_name) p.patternName = blueprint.pattern_name;
  if (blueprint?.life_direction) p.lifeDirection = blueprint.life_direction;
  if (Array.isArray(blueprint?.aspect_map)) {
    p.aspectMap = blueprint.aspect_map.map((row) => (typeof row === "string" ? row : row?.text || "")).filter(Boolean);
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
      flow: systemLayers.flow || p.planetGroups?.flow,
    };
  }

  if (blueprint?.planet_roles) {
    const order = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
    const signByKey = new Map();
    const signKeyByKey = new Map();
    const degByKey = new Map();
    const houseByKey = new Map();
    (kernel?.bodies || []).forEach((row) => {
      const sign = row?.kernel?.meta?.sign_ja || "";
      const signKey = row?.kernel?.meta?.sign_key || "";
      const deg = row?.kernel?.meta?.deg;
      if (sign) signByKey.set(row.key, sign);
      if (signKey) signKeyByKey.set(row.key, signKey);
      if (deg !== undefined) degByKey.set(row.key, deg);
    });
    (kernel?.houses?.placements || []).forEach((row) => {
      if (row?.key) houseByKey.set(row.key, row.house_no);
    });
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

  if (blueprint?.deep_axis) {
    p.deepAxis = {
      nodes: blueprint.deep_axis.nodes || p.deepAxis?.nodes,
      chiron: blueprint.deep_axis.chiron || p.deepAxis?.chiron,
      lilith: blueprint.deep_axis.lilith || p.deepAxis?.lilith,
      pattern: blueprint.deep_axis.pattern || p.deepAxis?.pattern,
    };
  }

  if (blueprint?.angles) {
    p.anglesText = {
      asc: blueprint.angles.asc || p.anglesText?.asc,
      mc: blueprint.angles.mc || p.anglesText?.mc,
      ic: blueprint.angles.ic || p.anglesText?.ic,
      dc: blueprint.angles.dc || p.anglesText?.dc,
      axis_structure:
        blueprint.angles.axis_structure ||
        blueprint.angles.axis_summary ||
        p.anglesText?.axis_structure,
    };
    if (blueprint.angles.intro) p.anglesIntro = blueprint.angles.intro;
  }
  if (blueprint?.angles_intro) p.anglesIntro = blueprint.angles_intro;
  if (!p.angularPlanets && masterChart?.angular_planets && typeof masterChart.angular_planets === "object") {
    p.angularPlanets = masterChart.angular_planets;
  }

  const story = input?.story || input?.kernel?.story;
  if (story) {
    try {
      p.natalWheelSvg = buildSoraWheelSvg({ story, size: 900 });
    } catch (_) {
      // keep placeholder if wheel fails
    }
  }

  if (kernel) {
    const toNumber = (val) => (Number.isFinite(Number(val)) ? Number(val) : 0);
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
      north: northNodeMeta.sign_ja
        ? `☊ North Node　${formatJaDeg(northNodeMeta.sign_ja, northNodeMeta.deg, northNodeMeta.house_no)}`
        : "",
      south: southNodeMeta.sign_ja
        ? `☋ South Node　${formatJaDeg(southNodeMeta.sign_ja, southNodeMeta.deg, southNodeMeta.house_no)}`
        : "",
      nodes: [
        northNodeMeta.sign_ja ? `☊ ${formatJaDeg(northNodeMeta.sign_ja, northNodeMeta.deg, northNodeMeta.house_no)}` : "",
        southNodeMeta.sign_ja ? `☋ ${formatJaDeg(southNodeMeta.sign_ja, southNodeMeta.deg, southNodeMeta.house_no)}` : "",
      ].filter(Boolean).join(" / "),
      chiron: chironMeta.sign_ja ? `${formatJaDeg(chironMeta.sign_ja, chironMeta.deg, chironMeta.house_no)}` : "",
      lilith: lilithMeta.sign_ja ? `${formatJaDeg(lilithMeta.sign_ja, lilithMeta.deg, lilithMeta.house_no)}` : "",
    };

    const formatAngleMeta = (meta, label) => {
      if (!meta || !meta.sign_ja) return "";
      const degText = Number.isFinite(Number(meta.deg)) ? ` ${Number(meta.deg)}°` : "";
      return `${label}｜${meta.sign_ja}${degText}`.trim();
    };
    p.angleMeta = {
      asc: formatAngleMeta(angleMetaMap.get("asc"), "ASC"),
      mc: formatAngleMeta(angleMetaMap.get("mc"), "MC"),
      ic: formatAngleMeta(angleMetaMap.get("ic"), "IC"),
      dc: formatAngleMeta(angleMetaMap.get("dc"), "DC"),
    };

    const signCounts = new Map();
    (kernel.bodies || []).forEach((row) => {
      const sign = row?.kernel?.meta?.sign_ja || "";
      if (!sign) return;
      signCounts.set(sign, (signCounts.get(sign) || 0) + 1);
    });
    const sortedSigns = [...signCounts.entries()].sort((a, b) => b[1] - a[1]).map(([sign]) => sign);
    if (sortedSigns.length) p.dominantSigns = sortedSigns.slice(0, 2);

    const houseCounts = kernel?.houses?.counts || {};
    const houseByKey = new Map((kernel?.houses?.placements || []).map((row) => [row.key, row.house_no]));
    const houseSorted = Object.entries(houseCounts)
      .map(([house, count]) => ({ house: Number(house), count: toNumber(count) }))
      .sort((a, b) => (b.count - a.count) || (a.house - b.house));
    if (houseSorted.length) p.dominantHouses = houseSorted.slice(0, 2).map((row) => `${row.house}H`);

    const placements = Array.isArray(kernel?.houses?.placements) ? kernel.houses.placements : [];
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
      p.structureLines = [
        p.structureLines?.[0] || "Cluster（集中型）",
        yang >= yin ? "Upper Hemisphere（上半球）" : "Lower Hemisphere（下半球）",
        yang >= yin ? "Yang dominant（陽優勢）" : "Yin dominant（陰優勢）",
      ];
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
    const topHouse = houseSorted[0]?.house;
    if (elementDominant || modalityDominant || topHouse) {
      p.dominanceLines = [
        elementDominant ? `エレメント　${elementDominant}` : p.dominanceLines[0],
        modalityDominant ? `モード　　　${modalityDominant}宮` : p.dominanceLines[1],
        topHouse ? `強調ハウス　${topHouse}H` : p.dominanceLines[2],
      ];
    }

    const signByKey = new Map((kernel.bodies || []).map((row) => [row.key, row?.kernel?.meta?.sign_ja || ""]));
    const degByKey = new Map((kernel.bodies || []).map((row) => [row.key, row?.kernel?.meta?.deg ?? null]));
    const sunSign = signByKey.get("sun") || "";
    const moonSign = signByKey.get("moon") || "";
    const ascSign = kernel?.houses?.asc_sign_ja || "";
    const sunHouse = houseByKey.get("sun");
    const moonHouse = houseByKey.get("moon");
    p.coreAxisLines = [
      sunSign && sunHouse ? `☉太陽 ${sunSign}｜${sunHouse}H` : p.coreAxisLines[0],
      moonSign && moonHouse ? `☽月 ${moonSign}｜${moonHouse}H` : p.coreAxisLines[1],
      ascSign ? `ASC ${ascSign}` : p.coreAxisLines[2],
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
        ascSign ? `ASC ${ascSign}` : "",
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

  if (!kernel && masterChart) {
    const toNumber = (val) => (Number.isFinite(Number(val)) ? Number(val) : 0);
    const planetByKey = new Map((masterChart.planets || []).map((p) => [p.key, p]));
    const formatSignDeg = (planet) => {
      if (!planet) return "";
      const sign = planet.sign_ja || planet.sign || "";
      const degText = Number.isFinite(Number(planet.degree)) ? ` ${Number(planet.degree)}°` : "";
      return `${sign}${degText}`.trim();
    };
    if (p.planetRolesAll?.length) {
      p.planetRolesAll = p.planetRolesAll.map((card) => {
        const planet = planetByKey.get(card.key);
        const sign = formatSignDeg(planet);
        const house = Number.isFinite(Number(planet?.house)) ? `${Number(planet.house)}H` : "";
        const meta = sign && house ? `${sign}｜${house}` : sign || house || card.meta;
        return { ...card, meta };
      });
    }

    if (!p.systemLayerLines || !p.systemLayerLines.core?.length) {
      const formatLine = (key) => {
        const planet = planetByKey.get(key);
        if (!planet) return "";
        const sign = planet.sign_ja || planet.sign || "";
        const degText = Number.isFinite(Number(planet.degree)) ? ` ${Number(planet.degree)}°` : "";
        const house = Number.isFinite(Number(planet.house)) ? `｜${Number(planet.house)}H` : "";
        const glyph = BODY_GLYPH[key] || "";
        const label = BODY_LABEL_JA[key] || key;
        return `${glyph}${label}${sign}${degText}${house}`.trim();
      };
      const ascSign = masterChart?.ascendant?.sign_ja || masterChart?.ascendant?.sign || "";
      p.systemLayerLines = {
        core: [formatLine("sun"), formatLine("moon"), ascSign ? `ASC${ascSign}` : ""].filter(Boolean),
        personal: [formatLine("mercury"), formatLine("venus"), formatLine("mars")].filter(Boolean),
        collective: [
          formatLine("jupiter"),
          formatLine("saturn"),
          formatLine("uranus"),
          formatLine("neptune"),
          formatLine("pluto"),
        ].filter(Boolean),
      };
    }

    if (!p.aspectNetwork && Array.isArray(masterChart.aspects) && masterChart.aspects.length) {
      const nodes = new Set();
      masterChart.aspects.forEach((edge) => {
        const a = edge?.p1_key || edge?.p1;
        const b = edge?.p2_key || edge?.p2;
        if (a) nodes.add(a);
        if (b) nodes.add(b);
      });
      const nodeList = Array.from(nodes);
      p.aspectNetwork = {
        nodes: nodeList.map((key, idx) => ({ key, idx })),
        edges: masterChart.aspects.map((edge) => ({
          a: edge?.p1_key || edge?.p1,
          b: edge?.p2_key || edge?.p2,
          type: edge?.type || "",
        })),
      };
    }
    if (Array.isArray(masterChart.dominant_signs) && masterChart.dominant_signs.length) {
      p.dominantSigns = masterChart.dominant_signs
        .map((row) => row.sign_ja || row.sign || row.sign_key || "")
        .filter(Boolean);
    }

    const houseCounts = masterChart?.house_counts || {};
    const houseSorted = Object.entries(houseCounts)
      .map(([house, count]) => ({ house: Number(house), count: toNumber(count) }))
      .sort((a, b) => (b.count - a.count) || (a.house - b.house));
    if (houseSorted.length) p.dominantHouses = houseSorted.slice(0, 2).map((row) => `${row.house}H`);
    if (masterChart?.element_balance) {
      p.elementCounts = {
        fire: toNumber(masterChart.element_balance.fire),
        earth: toNumber(masterChart.element_balance.earth),
        air: toNumber(masterChart.element_balance.air),
        water: toNumber(masterChart.element_balance.water),
      };
    }
    if (masterChart?.modality_balance) {
      p.modalityCounts = {
        cardinal: toNumber(masterChart.modality_balance.cardinal),
        fixed: toNumber(masterChart.modality_balance.fixed),
        mutable: toNumber(masterChart.modality_balance.mutable),
      };
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
        .sort((a, b) => (b[1]?.length || 0) - (a[1]?.length || 0))
        .map(([house, labels]) => `${house}H ${labels.join(" ")}`);
      if (rows.length) p.planetDistribution = rows;
    }
    if (!p.angleMeta && masterChart?.angles) {
      const formatAngleMeta = (angle, label) => {
        if (!angle) return "";
        const sign = angle.sign_ja || angle.sign || "";
        const degText = Number.isFinite(Number(angle.degree)) ? ` ${Number(angle.degree)}°` : "";
        return sign ? `${label}｜${sign}${degText}` : "";
      };
      p.angleMeta = {
        asc: formatAngleMeta(masterChart.angles.asc, "ASC"),
        mc: formatAngleMeta(masterChart.angles.mc, "MC"),
        ic: formatAngleMeta(masterChart.angles.ic, "IC"),
        dc: formatAngleMeta(masterChart.angles.dc, "DC"),
      };
    }
    if (!p.deepAxisMeta && masterChart?.nodes) {
      const formatJaDeg = (sign, deg, houseNo) => {
        const degText = Number.isFinite(Number(deg)) ? ` ${Number(deg)}°` : "";
        const houseText = Number.isFinite(Number(houseNo)) ? `｜${Number(houseNo)}H` : "";
        return `${sign || ""}${degText}${houseText}`.trim();
      };
      const north = masterChart.nodes?.north || {};
      const south = masterChart.nodes?.south || {};
      const chiron = masterChart.extras?.chiron || {};
      const lilith = masterChart.extras?.lilith || {};
      p.deepAxisMeta = {
        north: north.sign_ja || north.sign ? `☊ North Node　${formatJaDeg(north.sign_ja || north.sign, north.degree, north.house)}` : "",
        south: south.sign_ja || south.sign ? `☋ South Node　${formatJaDeg(south.sign_ja || south.sign, south.degree, south.house)}` : "",
        nodes: [
          north.sign_ja || north.sign ? `☊ ${formatJaDeg(north.sign_ja || north.sign, north.degree, north.house)}` : "",
          south.sign_ja || south.sign ? `☋ ${formatJaDeg(south.sign_ja || south.sign, south.degree, south.house)}` : "",
        ].filter(Boolean).join(" / "),
        chiron: chiron.sign_ja || chiron.sign ? `${formatJaDeg(chiron.sign_ja || chiron.sign, chiron.degree, chiron.house)}` : "",
        lilith: lilith.sign_ja || lilith.sign ? `${formatJaDeg(lilith.sign_ja || lilith.sign, lilith.degree, lilith.house)}` : "",
      };
    }
    if (masterChart?.angular_planets) {
      p.angularPlanets = masterChart.angular_planets;
    }
    if ((!p.nodeSigns || !p.nodeSigns.length) && masterChart?.nodes) {
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
  }
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
  if (!p.cosmicStructureText && p.coreSnapshot) p.cosmicStructureText = p.coreSnapshot;
  if (!p.natalObservation && p.coreSnapshot) p.natalObservation = p.coreSnapshot;
  if (!p.aspectEnergyText && p.aspectMap?.length) {
    p.aspectEnergyText = p.aspectMap.slice(0, 2).join(" / ");
  }
  if (!p.aspectSummaryText && p.aspectMap?.length) {
    p.aspectSummaryText = p.aspectMap.slice(-1)[0] || "";
  }
  if (!p.patternName && p.chartPattern) p.patternName = "Star Pattern";
  if (!p.lifeDirection && p.chartPattern) p.lifeDirection = p.chartPattern;

  if (!p.planetRolesAll || !p.planetRolesAll.length) {
    p.planetRolesAll = placeholders.planetRolesAll || [];
  }
  if (!p.systemLayerLines || !p.systemLayerLines.core?.length) {
    p.systemLayerLines = placeholders.systemLayerLines || p.systemLayerLines || {};
  }
  if (!p.cosmicFocusLines || !p.cosmicFocusLines.length) {
    p.cosmicFocusLines = placeholders.cosmicFocusLines || [];
  }
  if (!p.cosmicTraitsLines || !p.cosmicTraitsLines.length) {
    p.cosmicTraitsLines = placeholders.cosmicTraitsLines || [];
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

  if (!p.deepAxis) p.deepAxis = placeholders.deepAxis || {};
  if (!p.deepPatternText && p.deepAxis?.pattern) p.deepPatternText = p.deepAxis.pattern;
  if (!p.deepPatternText && p.deepAxis?.nodes) p.deepPatternText = p.deepAxis.nodes;
  if (!p.deepAxisMeta) p.deepAxisMeta = placeholders.deepAxisMeta || {};
  if (!p.anglesText) p.anglesText = placeholders.anglesText || {};
  if (!p.anglesIntro) p.anglesIntro = placeholders.anglesIntro || "";
  if (!p.angularPlanets) p.angularPlanets = placeholders.angularPlanets || {};
  if (!p.angleMeta) p.angleMeta = placeholders.angleMeta || {};

  return p;
}

function buildBlueprintV25WireframeHtml({ data = {}, useSpace = true } = {}) {
  const strongBg = buildSpaceSvg({ variant: "slide1", enabled: useSpace });
  const midBg = buildSpaceSvg({ variant: "slide3", enabled: useSpace });
  const bgImages = data?.bg_images || data?.bgImages || null;
  const fallbackKey = (key) => {
    if (key === "sys" || key === "pat") return "strong";
    if (key === "asp") return "medium";
    if (key === "obs") return "faint";
    return null;
  };
  const renderBg = (key, fallbackSvg) => {
    const src = bgImages?.[key] || (fallbackKey(key) ? bgImages?.[fallbackKey(key)] : null);
    if (src) {
      return `<div class="bg-space"><img class="bg-img" src="${src}" alt="space background"/></div>`;
    }
    return `<div class="bg-space">${fallbackSvg}</div>`;
  };

  const placeholders = {
    displayName: "Birth Star Blueprint",
    displayLabel: "Owner: Ayussy",
    birthText: "1993.07.04 18:45 / Tokyo, Japan",
    ownerName: "あゆっさい",
    coreAxisLines: [
      "☉ 太陽　獅子座｜10H",
      "☽ 月　　獅子座｜10H",
      "ASC 蠍座",
    ],
    systemLayerLines: {
      core: ["☉太陽獅子座｜10H", "☽月獅子座｜10H", "ASC蠍座"],
      personal: ["☿水星獅子座｜10H", "♀金星牡羊座｜6H", "♂火星獅子座｜10H"],
      collective: ["♃木星射手座｜2H", "♄土星蠍座｜1H", "♅天王星水瓶座｜4H", "♆海王星山羊座｜3H", "♇冥王星蠍座｜1H"],
    },
    dominanceLines: [
      "エレメント　火",
      "モード　　　固定宮",
      "強調ハウス　10H",
    ],
    structureLines: [
      "Cluster（集中型）",
      "Upper Hemisphere（上半球）",
      "Yang dominant（陽優勢）",
    ],
    cosmicFocusLines: [
      "☉ ☽ 10H",
      "社会領域集中",
    ],
    cosmicTraitsLines: [
      "表現型チャート",
      "社会領域強調",
      "固定宮優勢",
      "火エネルギー中心",
    ],
    nodeSigns: [
      { glyph: "☋", sign: "山羊座", symbol: "♑︎" },
      { glyph: "☊", sign: "蟹座", symbol: "♋︎" },
    ],
    anglesText: {
      asc: "ASC（アセンダント）は世界への入口。蠍座の濃度が外側の印象に深さを作り、観察と集中が前に出やすい。",
      mc: "MCは社会への方向。獅子座の方向性が公的な場での表現と評価に向かい、役割の輪郭が強く出やすい。",
      ic: "ICは内側の根。水瓶座の気配が内面の自由と独自性を支え、基盤に革新性が残る。",
      dc: "DCは他者との鏡。牡牛座の軸が関係性に安定と持続性を求め、信頼の温度が長く続く。",
      axis_structure:
        "ASC-DCは自己と他者の接続軸、MC-ICは社会と内面の軸になる。2本の十字が交差し、外に開く方向と内に戻る方向の両方を形成する。",
    },
    anglesIntro:
      "出生図には星と現実をつなぐ4つの角度がある。ASCは入口、MCは社会への方向、ICは内側の根、DCは他者との鏡。4つの角度が中心に十字を作り、世界との接続構造を形作る。",
    angularPlanets: {
      asc: [{ planet: "mars", orb: 2.0 }],
      mc: [{ planet: "venus", orb: 3.0 }],
      ic: [],
      dc: [],
    },
    angleMeta: {
      asc: "ASC｜蠍座 18°",
      mc: "MC｜獅子座 5°",
      ic: "IC｜水瓶座 5°",
      dc: "DC｜牡牛座 18°",
    },
    coreSnapshot:
      "このチャートは太陽・月・ASCが同じ軸に集まり、外側に向かう自己表現が中心熱として立ち上がる。10ハウスの集中が社会的な舞台を強め、内面の感情も同じ領域で点火しやすい。獅子座と水瓶座の軸が同時に立ち、中心性と俯瞰性が交差する。風と火が強く、思考の速度と表現の熱量が同時に動く一方、水の少なさが感情の扱いに静かな距離感を残す。外と内が同じ方向へ向かう構造が、この星の第一印象になる。",
    cosmicStructureText:
      "社会的役割と内面の感情が同じ舞台で重なり、外側の活動が星の循環を作る。10ハウスの集中が推進力の核になり、4ハウスが基盤として支える。",
    cosmicSignature: [
      "社会的な舞台で自己表現が点火しやすい配置。",
      "内面の感情と外側の役割が同じ領域で響き合う。",
      "存在の輪郭が自然と外側に現れやすい星の構造。",
    ],
    dominantSigns: ["獅子座", "水瓶座"],
    dominantSignsText:
      "獅子座と水瓶座の軸が強く働き、個人の表現と社会的な視点が同時に動きやすい構造になる。中心性と客観性が同居し、表現の方向に幅が出やすい。自分の熱を外へ押し出しながら、距離を取って眺める回路も残る。",
    dominantHouses: ["10H", "4H"],
    dominantHousesText:
      "外側の舞台と内側の基盤が結びつき、役割の状態が内面に影響しやすい。外での動きが内面を動かし、内側の安心が外側の推進力になる。家庭と社会の往復が星の主要な循環になる。",
    elementBalanceText:
      "火の要素が中心になりやすく、行動や表現が自然と前に出やすい星の配置になる。風がその動きを広げ、地と水は安定と内省として静かに支える。熱量と発想が先に立ち、感情は後から整う流れが生まれる。",
    modalityBalanceText:
      "固定宮が強く、一度決めた方向を持続する力が中心になる。始動は活動宮が担い、柔軟宮は切り替えの補助として働く。長期テーマを掘り下げる粘りが構造の核になる。",
    polarityText:
      "陽が多く、外側へエネルギーが流れやすい構造になる。内面で熟成したものが外の舞台へ向かいやすい。外界との接点で反応が起こりやすい配分になる。",
    energyFlowText:
      "火×固定宮の組み合わせが、短期の衝動ではなく持続する情熱を作る。そこに風が加わり、思考や言語が表現の回路に流れ込む。太陽・月・火星の集約が流れを束ね、外側に向かう推進力を強める。熱量と知性が同時に動くエネルギーフローが形成される。",
    structureSummaryText:
      "火を中心に動く表現型の構造で、固定宮の力によりエネルギーが長く持続しやすい。10ハウスの強調が外側の舞台を主領域にし、4ハウスが内面の基盤として支える二重構造になる。外と内が同時に強く働き、役割と安心が連動する星の構造になる。中心の熱量が循環するため、表現と安定が切り離されにくい構造として残る。",
    planetDistribution: [
      "10H ☉ ☽ ☿ ♂",
      "6H  ♀",
      "2H  ♃",
      "1H  ♄ ♇",
      "4H  ♅",
      "3H  ♆",
    ],
    planetDistributionText:
      "天体が10ハウスに集まり、社会や外側の舞台での活動が中心テーマになりやすい。日常の動きも外向きに結びつき、成果や評価が循環の起点になる。",
    dominanceSummary: ["Fire dominant", "Fixed dominant", "10H emphasis"],
    systemTypeSummary: ["Cluster chart", "Upper Hemisphere", "Yang 7 / Yin 3"],
    elements:
      "風が支配的で、思考の流れが速く広がりやすい。火が次点として入り、表現の熱量が知性の回路に点火する。水が少ないため、感情は内側で静かに保持される。結果として、理解と表現が先に立ち、感情はゆっくり追随する構造になる。",
    modalities:
      "活動宮が前に出て、始める力が強い。そこに不動宮が重なり、意志の持続性が加わる。柔軟宮は切り替えのタイミングとして働く。始動と継続が組み合わさり、長期の軸を作りやすい。",
    planetRolesAll: [
      { key: "sun", label: "☉ Sun", meta: "Leo 23° / 10H", text: "社会的舞台に中心熱を置く役割。外側で自己表現が点火しやすい。評価や達成の場が核の回路になる。" },
      { key: "moon", label: "☽ Moon", meta: "Leo 18° / 10H", text: "感情の拠点が社会領域に置かれる配置。安心感が役割に結びつきやすい。外側の反応が内面の温度を動かす。" },
      { key: "mercury", label: "☿ Mercury", meta: "Leo 7° / 10H", text: "思考と発信が表舞台に接続される配置。言葉が自己表現に入る。発信の方向が中心熱に揃いやすい。" },
      { key: "venus", label: "♀ Venus", meta: "Aries 12° / 6H", text: "愛着と美意識が日常の動きに乗る。関係性が行動に直結しやすい。選択が速度を持ちやすい配置。" },
      { key: "mars", label: "♂ Mars", meta: "Leo 28° / 10H", text: "行動の推進力が社会領域で発揮される。外側の達成が燃料になる。動きがそのまま表現の力になる。" },
      { key: "jupiter", label: "♃ Jupiter", meta: "Sag 5° / 2H", text: "拡張が価値と資源に入る配置。基盤の広がりが生まれやすい。成長の流れが土台へ戻る。" },
      { key: "saturn", label: "♄ Saturn", meta: "Scorpio 3° / 1H", text: "境界と責任が外側の印象に刻まれる。慎重さが表面に出る。存在感に重みが残りやすい。" },
      { key: "uranus", label: "♅ Uranus", meta: "Aquarius 14° / 4H", text: "変化の力が基盤に触れる配置。内面の土台で刷新が起こりやすい。家庭領域に独自性が出る。" },
      { key: "neptune", label: "♆ Neptune", meta: "Capricorn 21° / 3H", text: "理想が思考領域に混ざる配置。言葉に柔らかい感覚が流れ込む。伝達が夢と現実の間で揺れる。" },
      { key: "pluto", label: "♇ Pluto", meta: "Scorpio 27° / 1H", text: "深層変容が外側の存在感に結びつく。印象に強さが生まれる。視線に影響力が残る。" },
    ],
    planetGroups: {
      core: "太陽・月・ASCが同じ軸で響き、外側の舞台と内側の反応が一致しやすい。中心熱が強く、社会面で輪郭が立ち上がる。",
      personal: "思考・愛着・推進力が火の帯に集まり、日常の回路が自己表現と直結する。言葉と行動が同じ方向へ向かいやすい。",
      socialTranspersonal: "拡張と制約、変化と理想が同時に並ぶ。外側の成長と内側の維持が並走しやすい。",
      flow: "内側の核から日常回路へ流れが移り、社会的な層へつながる循環が形成される。コアの熱が個人の動きを動かし、外側の拡張と接続する。",
    },
    deepAxis: {
      nodes: "南ノード山羊座が達成と責任の感覚を土台に置き、北ノード蟹座が内側の安心へ向かう方向を示す。外側で成果を重ねる力がある一方、内面の感情的な充足を育てる流れが補正として働く。外と内の温度差を調整する軸になる。",
      chiron: "傷の入口は社会的評価や役割に触れやすい。外での達成が内面の不安と結びつきやすく、静かな自己肯定を保つことが癒しの鍵になる。経験が共感の感度を育てる。役割と感情の間に残る繊細さが、理解の深さへ変わっていく。",
      lilith: "抑えがたい反応が外側の役割と絡み、深層で強い衝動が残りやすい。表現の自由と社会的期待の間に緊張が生まれる。無視しにくい本能が星の底に残る。抑圧と解放の揺れが、存在感の深度を作る。",
      pattern: "外側の達成と内面の安心が同時にテーマになる。社会的な舞台で活動する力と、内面の感情を育てる流れが深いところで結びつき、表現と保護の両方が必要になる。成果と感情のバランスが深層の課題として残る。達成の温度を保ちながら、内側に休息の余白を確保することが深層テーマになる。",
    },
    deepAxisMeta: {
      south: "☋ South Node　山羊座｜3H",
      north: "☊ North Node　蟹座｜9H",
      chiron: "蠍座｜5H",
      lilith: "乙女座｜11H",
    },
    deepPatternText:
      "外側の達成と内面の安心が同時にテーマになる。社会的な舞台で活動する力と、内面の感情を育てる流れが深いところで結びつき、表現と保護の両方が必要になる。成果と感情のバランスが深層の課題として残る。達成の温度を保ちながら、内側に休息の余白を確保することが深層テーマになる。",
    aspectMap: [
      "太陽×月：中心と感情が同じ火で統合され、自己表現が揺らぎにくい。内外の温度差が小さく、意志と反応が同じ方向へ揃う。核の一体感が強い。",
      "太陽×木星：拡張の力が核へ流れ込み、舞台の広がりが自然に生まれる。自己表現が大きな枠で伸びやすい。表現のスケールを押し上げる。",
      "月×土星：感情と現実の間に緊張があり、内側の輪郭が強化される。安心を作るための責任感が育つ。感情の耐久性が増す。",
      "金星×火星：愛着と推進が同調し、関係性に熱が乗る。感情の選択が行動へ直結しやすい。情熱の回路が加速する。",
      "ASC×冥王星：外側の印象に深度が生まれ、存在感が濃くなる。変容の圧が表面に滲みやすい。影響力が視線に残る。",
    ],
    aspectEnergyText:
      "共鳴が集中し、核の回路が一方向へまとまり、外側へ流れが長く伸びる。",
    aspectSummaryText:
      "共鳴が集中し、核の動きが全体の回路を決める。",
    patternName: "表現点火パターン",
    natalObservation:
      "このチャートでは太陽と月が同じ獅子座の10ハウスに集まり、自己表現と社会的役割が強く結びつく配置になっている。感情とアイデンティティが同じ領域で点火するため、外側の舞台で存在の輪郭が自然と現れやすい。ASC蠍座が外側の印象に深さを与え、表面よりも内面の強さが伝わりやすい。中心熱が社会面に集まるため、外での動きが星の回路になる。太陽・月・火星の集約が方向性を一つにまとめ、表現の流れが集中しやすい。水の少なさが感情の扱いに静かな距離を作り、内側の温度は慎重に維持される。観測点を重ねると、外側の発光と内側の調律が同時に走っていることが見える。",
    chartPattern:
      "このチャートは外側の舞台と内側の反応が強く重なる。社会的自己表現が中心熱となり、内面の感情も同じ場所で点火する。風と火の偏りが思考の速度と表現の熱量を引き上げる一方、水の少なさが感情の扱いに距離感を作る。核を支える緊張は土星の制御であり、そこに木星の拡張が流れを作る。結果として、外側の達成と内側の充足が同時に問われる構造になる。外と内の循環がこの星の輪郭を決める。",
    lifeDirection:
      "社会的な舞台が重要なテーマになるが、それは外側の成功だけを指すわけではない。内面の感情と外側の役割が重なる場所でバランスを育てる方向に向かう。外で光を放ちながら、内側の根を育てることが星の流れを整える。外の役割が内面を整える循環を意識する方向になる。外と内の温度差を調律することが流れを安定させる。",
    closingSummary:
      "この設計図は、外側で光を放ちながら内側の根を同時に育てる構造を示す。表現と安心の両方を持ち、内外の調和が星の軸になる。静かな重心が最後まで残る。外に出る熱量と内に残る温度が同時に働き、星の循環を穏やかに保つ。ここで示された構造は、選択や歩みの中で何度でも再調整されていく。配置の重心と共鳴の流れが、内外のバランスを繰り返し整えていく。",
  };

  const p = buildWireframeData(data, placeholders);
  const natalWheelMarkup = p.natalWheelSvg
    ? `<div class="wheel-svg">${p.natalWheelSvg}</div>`
    : `<div class="wheel" style="width: 92%; height: auto; aspect-ratio: 1 / 1;"></div>`;
  const dominantSignRows = (p.dominantSigns && p.dominantSigns.length)
    ? p.dominantSigns
    : ((p.nodeSigns && p.nodeSigns.length)
      ? p.nodeSigns.map((row) => `${row.glyph} ${row.symbol} ${row.sign}`)
      : []);
  const northNodeSymbol = p.nodeSigns?.find((row) => row.glyph === "☊")?.symbol || "☊";
  const southNodeSymbol = p.nodeSigns?.find((row) => row.glyph === "☋")?.symbol || "☋";

  const aspectColor = (type) => {
    switch (type) {
      case "conjunction": return "#FFB27A";
      case "opposition": return "#FF6B6B";
      case "square": return "#FF8C42";
      case "trine": return "#9EC5FF";
      case "sextile": return "#9FD3A8";
      default: return "#EDEEFF80";
    }
  };

  const buildAspectSvg = () => {
    if (!p.aspectNetwork?.nodes?.length) return "";
    const size = 520;
    const cx = size / 2;
    const cy = size / 2;
    const r = 195;
    const nodes = p.aspectNetwork.nodes;
    const edges = p.aspectNetwork.edges || [];
    const step = (Math.PI * 2) / nodes.length;
    const pos = new Map();
    nodes.forEach((node, idx) => {
      const angle = -Math.PI / 2 + step * idx;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      pos.set(node.key, { x, y });
    });
    const edgeLines = edges.map((edge) => {
      const a = pos.get(edge.a);
      const b = pos.get(edge.b);
      if (!a || !b) return "";
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="${aspectColor(edge.type)}" stroke-width="2" stroke-linecap="round" />`;
    }).join("");
    const nodeDots = nodes.map((node) => {
      const pnt = pos.get(node.key);
      const glyph = BODY_GLYPH[node.key] || "";
      return [
        `<circle cx="${pnt.x.toFixed(1)}" cy="${pnt.y.toFixed(1)}" r="16" fill="#1C1F3A" stroke="#EDEEFF40" stroke-width="1" />`,
        `<text x="${pnt.x.toFixed(1)}" y="${(pnt.y + 6).toFixed(1)}" text-anchor="middle" font-size="16" fill="#EDEEFF">${glyph}</text>`,
      ].join("");
    }).join("");
    return `<svg class="aspect-svg" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${edgeLines}${nodeDots}</svg>`;
  };

  const css = `
${buildFontFaceCss()}

:root {
  --bg: #14162B;
  --card: #1C1F3A;
  --text: #EDEEFF;
  --muted: #B9BDD9;
  --line: #EDEEFF40;
  --space-veil: rgba(20, 22, 43, 0.08);
  --space-opacity: 0.2;
  --space-1: 24px;
  --space-2: 48px;
  --space-3: 72px;
  --space-4: 96px;
  --page-margin-x: var(--space-4);
  --page-margin-top: 90px;
  --page-margin-bottom: 110px;
  --section-gap: var(--space-3);
  --card-gap: var(--space-2);
  --column-gap: 40px;
  --card-padding: var(--space-2);
  --nav-gap: 80px;
  --content-max: 888px;
  --ui: 1.815;
  --title-scale: 1.44;
  --fs-title: calc(24px * var(--ui) * var(--title-scale));
  --fs-label: calc(10px * var(--ui));
  --fs-body: calc(14px * var(--ui));
  --fs-sub: calc(11px * var(--ui));
  --fs-card-head: calc(16px * var(--ui) * var(--title-scale));
  --fs-card-title: calc(16px * var(--ui) * var(--title-scale));
  --fs-card-meta: calc(12px * var(--ui));
  --fs-card-text: calc(14px * var(--ui));
  --fs-card-list: calc(13px * var(--ui));
  --fs-tag: calc(12px * var(--ui));
  --ls-title: 0.04em;
  --ls-sub: 0.08em;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Zen Kaku Gothic', sans-serif;
  color: var(--text);
  background: var(--bg);
}

.page {
  position: relative;
  width: ${PAGE_WIDTH}px;
  height: ${PAGE_HEIGHT}px;
  margin: 0 auto;
  page-break-after: always;
  overflow: hidden;
  background: var(--bg);
}

.bg-space {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.bg-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

.bg-space::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--space-veil);
}

.bg-space__svg {
  width: 100%;
  height: 100%;
  display: block;
  opacity: var(--space-opacity);
}

.page--space .bg-space__svg { opacity: 0.85; }
.page--medium .bg-space__svg { opacity: 0.6; }

.blueprint-grid {
  display: none;
}

.slide {
  position: relative;
  z-index: 2;
  height: 100%;
  display: grid;
  grid-template-rows: auto auto 1fr;
  align-content: start;
  padding: var(--page-margin-top) var(--page-margin-x) var(--page-margin-bottom);
  row-gap: calc(var(--section-gap) * 1.2);
}

.top {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 6px;
  width: 100%;
  max-width: min(70%, var(--content-max));
  margin: 0;
  align-self: flex-start;
}

.top.center {
  align-self: center;
  margin-left: auto;
  margin-right: auto;
  text-align: center;
}

.label {
  font-size: var(--fs-label);
  letter-spacing: var(--ls-sub);
  text-transform: uppercase;
  color: var(--muted);
  line-height: 1.6;
}

.title {
  font-family: 'Shippori Mincho', serif;
  font-size: var(--fs-title);
  letter-spacing: var(--ls-title);
  line-height: 1.69;
}

.middle {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 20px;
  align-self: stretch;
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
}

.bottom {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 12px;
  align-self: stretch;
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
  padding-bottom: var(--nav-gap);
}

.grid-6 {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--card-gap);
  width: 100%;
  align-items: start;
}

.span-6 { grid-column: span 6; }
.span-3 { grid-column: span 3; }
.span-2 { grid-column: span 2; }

.sys-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: var(--card-gap);
  width: 100%;
}

.sys-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--card-gap);
  width: 100%;
}

.sys-grid-2 .span-2 {
  grid-column: span 2;
}

.map-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  row-gap: var(--card-gap);
  column-gap: var(--column-gap);
  width: 100%;
}

.str-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  row-gap: var(--card-gap);
  column-gap: var(--column-gap);
  width: 100%;
}

.str-stack {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--card-gap);
  width: 100%;
}

.pln-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  row-gap: var(--card-gap);
  column-gap: var(--column-gap);
  width: 100%;
}

.ang-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  row-gap: var(--card-gap);
  column-gap: var(--column-gap);
  width: 100%;
}

.lay-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--card-gap);
  width: 100%;
}

.dep-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--card-gap);
  width: 100%;
}

.asp-footer-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--card-gap);
  width: 100%;
}

.asp-footer-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--column-gap);
}

.pat-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--card-gap);
  width: 100%;
}

.text {
  font-size: var(--fs-body);
  line-height: 2.1;
  color: var(--text);
}

.subtext {
  font-size: var(--fs-sub);
  line-height: 2.28;
  color: var(--muted);
}

.angles-intro {
  margin-top: 18px;
  font-size: var(--fs-body);
  line-height: 1.75;
  color: var(--text);
}

.section-divider {
  width: 100%;
  height: 1px;
  background: var(--line);
  margin: 18px 0 18px;
}

.axis-mini {
  margin-top: 10px;
  font-size: var(--fs-sub);
  letter-spacing: 0.04em;
  color: var(--muted);
}

.chart-box {
  width: 100%;
  border: none;
  border-left: 2px solid var(--line);
  border-radius: 0;
  padding: 0 0 0 28px;
  background: transparent;
}

.wheel {
  width: 760px;
  height: 760px;
  border: 1px solid var(--line);
  border-radius: 50%;
  box-shadow: 0 0 48px rgba(255,255,255,0.2);
}

.wheel.cover { width: 820px; height: 820px; }
.wheel.medium { width: 660px; height: 660px; }

.wheel-svg {
  width: 92%;
  max-width: 900px;
  aspect-ratio: 1 / 1;
}

.wheel-svg svg {
  width: 100%;
  height: 100%;
  display: block;
}

.page--obs .middle {
  margin-top: calc(var(--section-gap) * 0.35);
}

.page--obs .bottom {
  margin-top: calc(var(--section-gap) * 0.24);
}

.page--obs .middle {
  margin-top: -12px;
}

.page--map .slide {
  row-gap: calc(var(--section-gap) * 0.5);
}

.page--map .bottom {
  margin-top: 0;
}

.bar-list {
  width: 100%;
  display: grid;
  gap: 16px;
}

.metric-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.metric-label {
  min-width: 0;
  white-space: nowrap;
  padding-right: 0;
}

.astro-symbol {
  font-family: 'Noto Sans Symbols', 'Symbola', 'Apple Symbols', 'Segoe UI Symbol', sans-serif;
  margin-right: 2px;
  display: inline-block;
}

.metric-bar {
  flex: 1;
  margin-left: 0;
}

.bar {
  height: 14px;
  border-radius: 999px;
  background: rgba(237,238,255,0.12);
  position: relative;
  overflow: hidden;
}

.bar::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--bar-fill, 62%);
  background: var(--bar-color, #9EC5FF);
  border-radius: inherit;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  width: 100%;
}

.planet-section {
  display: grid;
  gap: 12px;
}

.planet-group-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.planet-group {
  font-size: var(--fs-tag);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
  padding-bottom: 6px;
}

.planet-section-title {
  font-size: 20px;
  letter-spacing: 0.02em;
  color: var(--text);
  font-weight: 600;
}

.planet-section-sub {
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--muted);
}

.planet-section-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.dashboard {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  width: 100%;
}

.dashboard .span-2 { grid-column: span 2; }

.sys-panels {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  width: 100%;
}

.signature {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}

.card {
  border: none;
  border-left: 2px solid var(--line);
  border-radius: 0;
  padding: 0 0 0 28px;
  background: transparent;
}

.card-title { font-size: var(--fs-card-title); font-weight: 600; }
.card-meta { font-size: var(--fs-card-meta); color: var(--muted); margin-top: 6px; }
.card-text { font-size: var(--fs-card-text); line-height: 2.05; margin-top: 8px; color: var(--text); }

.card-head {
  font-size: var(--fs-card-head);
  letter-spacing: var(--ls-title);
  color: var(--text);
  font-weight: 600;
  line-height: 1.69;
}

.card-sub {
  font-size: var(--fs-sub);
  letter-spacing: var(--ls-sub);
  text-transform: uppercase;
  color: var(--muted);
  margin-top: 4px;
  white-space: nowrap;
  line-height: 1.6;
}

.card-body {
  font-size: var(--fs-body);
  line-height: 2.05;
  margin-top: var(--space-1);
  color: var(--text);
}

.card-list {
  margin-top: var(--space-1);
  display: grid;
  gap: 6px;
  font-size: var(--fs-card-list);
}

.card-list.inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.card-list.inline > div::after {
  content: "ー";
  margin: 0 8px;
  color: var(--muted);
}

.card-list.inline > div:last-child::after {
  content: "";
  margin: 0;
}

.card-meta {
  margin-top: 6px;
  margin-bottom: 10px;
}

.angular-block {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(237,238,255,0.12);
}

.axis-mini {
  margin-top: 12px;
  font-size: var(--fs-tag);
  color: var(--muted);
}

.axis-mini-diagram {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  font-size: var(--fs-tag);
  color: var(--muted);
}

.axis-mini-diagram .axis-line {
  height: 1px;
  background: rgba(237,238,255,0.35);
}

.tag-row { display: flex; flex-wrap: wrap; gap: 10px; }
.tag {
  font-size: var(--fs-tag);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(237,238,255,0.12);
  color: var(--text);
  letter-spacing: 0.02em;
}

.astro-symbol {
  font-family: 'Noto Symbols 2', 'Noto Symbols', 'Symbola', 'Zen Kaku Gothic', sans-serif;
  margin-right: 6px;
}

.aspect-wheel {
  width: 520px;
  height: 520px;
  border: 1px solid var(--line);
  border-radius: 50%;
  position: relative;
}

.aspect-svg {
  width: 520px;
  height: 520px;
}

.aspect-wheel::before,
.aspect-wheel::after {
  content: '';
  position: absolute;
  inset: 12%;
  border: 1px dashed rgba(237,238,255,0.3);
  border-radius: 50%;
}

.aspect-wheel::after { inset: 30%; }

.aspect-lines {
  position: absolute;
  inset: 18%;
  border-top: 1px solid rgba(237,238,255,0.4);
  border-left: 1px solid rgba(237,238,255,0.4);
  transform: rotate(24deg);
}

.page--aspect .middle {
  margin-top: -36px;
}

.aspect-holder {
  margin-top: -24px;
  transform: translateY(-18px);
}

.aspect-svg {
  width: 520px;
  height: 520px;
}

.asp-footer-stack {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
}

.single-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.axis-line {
  position: relative;
  width: 100%;
  height: 70px;
  border-top: 1px dashed rgba(237,238,255,0.4);
  margin: 32px 0 -24px;
}

.axis-line::before {
  content: none;
}

.axis-line::after {
  content: '';
}

.node-meta {
  margin-bottom: 72px;
}

.node-body {
  margin-top: -24px;
}

.axis-node {
  position: absolute;
  top: -28px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: #EDEEFF;
  border: 2px solid #EDEEFF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 38px;
  color: #14162B;
}

.axis-node.left { left: 10%; }
.axis-node.right { right: 10%; }

.axis-arrow {
  display: none;
}

.cosmic-nav {
  display: flex;
  justify-content: center;
  gap: 8px;
  font-size: 16px;
  letter-spacing: 0.3em;
  color: rgba(237,238,255,0.5);
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(var(--page-margin-bottom) - 130px);
}

.nav-dot.active { color: #ffffff; }

.coordinate {
  position: absolute;
  top: 16px;
  right: 24px;
  font-size: 14px;
  letter-spacing: 0.2em;
  color: var(--muted);
}

.sys-header {
  position: absolute;
  top: 90px;
  left: 72px;
  right: 72px;
}

.sys-core {
  position: absolute;
  top: 320px;
  left: 72px;
  right: 72px;
}

.sys-focus {
  position: absolute;
  top: 520px;
  left: 72px;
  right: 72px;
}

.sys-sub {
  position: absolute;
  top: 720px;
  left: 72px;
  right: 72px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.sys-traits {
  position: absolute;
  top: 980px;
  left: 72px;
  right: 72px;
}

.sys-signature {
  position: absolute;
  top: 1240px;
  left: 72px;
  right: 72px;
}

.center { text-align: center; }

.cover-title {
  font-family: 'Shippori Mincho', serif;
  font-size: 24px;
  letter-spacing: 0.01em;
}

.cover-title-en {
  font-family: 'Shippori Mincho', serif;
  font-size: 11px;
  letter-spacing: 1.6px;
  color: var(--muted);
}

.cover-meta {
  font-size: 16px;
  color: var(--text);
}

.cover-label {
  font-size: 11px;
  letter-spacing: 1.6px;
  text-transform: uppercase;
  color: var(--muted);
}

.cover-card {
  border: 1px solid var(--line);
  background: var(--card);
  border-radius: 12px;
  padding: 22px;
  display: grid;
  gap: 18px;
}

.cover-divider {
  border-top: 1px solid var(--line);
  margin: 4px 0;
}

.cover-section-title {
  font-size: 16px;
  letter-spacing: 0.01em;
  color: var(--muted);
  margin-bottom: 6px;
}

.cover-lines {
  display: grid;
  gap: 6px;
  font-size: 14px;
  color: var(--text);
}

.cover-en {
  font-size: 10px;
  letter-spacing: 1.6px;
  color: var(--muted);
  text-transform: uppercase;
}
`;

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <title>Blueprint v2.5 Wireframe</title>
  <style>${css}</style>
</head>
<body>
  <!-- Slide 1: Cover -->
  <section class="page page--space" style="--space-opacity: 0.85;">
    ${renderBg("sys", strongBg)}
    <div class="blueprint-grid"></div>
    <div class="coordinate">SYS-01</div>
    <div class="slide">
      <div class="top">
        <div class="label">SYS-01</div>
        <div class="title">あなたの星の設計図</div>
        <div class="subtext">BIRTH STAR BLUEPRINT</div>
        <div class="subtext" style="margin-top:24px; letter-spacing:0.2em;">${escapeHtml(p.signatureLineSymbols)}</div>
        <div class="text" style="margin-top:28px;">${escapeHtml(p.ownerName)}</div>
        <div class="subtext">${escapeHtml(p.birthText)}</div>
      </div>
      <div class="middle">
        <div class="sys-grid-2">
          <div class="chart-box">
            <div class="card-head">星の軸</div>
            <div class="card-sub">STAR AXIS</div>
            <div class="card-list">
              ${p.coreAxisLines.map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box">
            <div class="card-head">星のフォーカス</div>
            <div class="card-sub">STAR FOCUS</div>
            <div class="card-list">
              ${(p.cosmicFocusLines || []).map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box">
            <div class="card-head">星の重心</div>
            <div class="card-sub">STAR DOMINANCE</div>
            <div class="card-list">
              ${p.dominanceLines.map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box">
            <div class="card-head">チャート構造</div>
            <div class="card-sub">CHART TYPE</div>
            <div class="card-list">
              ${p.structureLines.map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box span-2">
            <div class="card-head">星の特性</div>
            <div class="card-sub">STAR TRAITS</div>
            <div class="card-list">
              ${(p.cosmicTraitsLines || []).map((row) => `<div>・${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box span-2">
            <div class="card-head">星のシグネチャ</div>
            <div class="card-sub">STAR SIGNATURE</div>
            <div class="card-list">
              ${p.cosmicSignature.map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="bottom">
        ${buildCosmicNav(0)}
      </div>
    </div>
  </section>

  <!-- Slide 2: Core Map -->
  <section class="page page--map">
    <div class="blueprint-grid"></div>
    <div class="coordinate">MAP-02</div>
    <div class="slide">
      <div class="top">
        <div class="label">STAR MAP</div>
        <div class="title">星の構造マップ</div>
        <div class="subtext">STAR STRUCTURE MAP</div>
      </div>
      <div class="middle">
        <div class="grid-6">
          <div class="chart-box span-3">
            <div class="card-head">エレメントバランス</div>
            <div class="card-sub">ELEMENT BALANCE</div>
            <div class="bar-list" style="margin-top:10px;">
              <div class="metric-row">
                <div class="metric-label"><span class="astro-symbol">🜂</span> 火 ${p.elementCounts?.fire ?? ""}</div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.elementBars?.fire || 62}%; --bar-color:#FF6B6B;"></div></div>
              </div>
              <div class="metric-row">
                <div class="metric-label"><span class="astro-symbol">🜃</span> 地 ${p.elementCounts?.earth ?? ""}</div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.elementBars?.earth || 42}%; --bar-color:#E6C36D;"></div></div>
              </div>
              <div class="metric-row">
                <div class="metric-label"><span class="astro-symbol">🜁</span> 風 ${p.elementCounts?.air ?? ""}</div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.elementBars?.air || 54}%; --bar-color:#7FBF8F;"></div></div>
              </div>
              <div class="metric-row">
                <div class="metric-label"><span class="astro-symbol">🜄</span> 水 ${p.elementCounts?.water ?? ""}</div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.elementBars?.water || 30}%; --bar-color:#7AA7FF;"></div></div>
              </div>
            </div>
          </div>
          <div class="chart-box span-3">
            <div class="card-head">モード</div>
            <div class="card-sub">MODALITY BALANCE</div>
            <div class="bar-list" style="margin-top:10px;">
              <div class="metric-row">
                <div class="metric-label"><span class="astro-symbol">△</span> 活動宮 ${p.modalityCounts?.cardinal ?? ""}</div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.modalityBars?.cardinal || 46}%; --bar-color:#FFB27A;"></div></div>
              </div>
              <div class="metric-row">
                <div class="metric-label"><span class="astro-symbol">□</span> 固定宮 ${p.modalityCounts?.fixed ?? ""}</div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.modalityBars?.fixed || 64}%; --bar-color:#9EC5FF;"></div></div>
              </div>
              <div class="metric-row">
                <div class="metric-label"><span class="astro-symbol">◇</span> 柔軟宮 ${p.modalityCounts?.mutable ?? ""}</div>
                <div class="metric-bar"><div class="bar" style="--bar-fill:${p.modalityBars?.mutable || 36}%; --bar-color:#9FD3A8;"></div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="bottom">
        <div class="grid-6">
          <div class="chart-box span-2">
            <div class="card-head">支配サイン</div>
            <div class="card-sub">DOMINANT SIGNS</div>
            <div class="card-list">
              ${dominantSignRows.map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box span-2">
            <div class="card-head">支配ハウス</div>
            <div class="card-sub">DOMINANT HOUSES</div>
            <div class="card-list">
              ${p.dominantHouses.map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box span-2">
            <div class="card-head">天体分布</div>
            <div class="card-sub">PLANET DISTRIBUTION</div>
            <div class="card-list">
              ${p.planetDistribution.map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
          <div class="chart-box span-6">
            <div class="card-head">エネルギーの流れ</div>
            <div class="card-sub">ENERGY FLOW</div>
            <div class="card-body">${escapeHtml(p.energyFlowText)}</div>
          </div>
          <div class="chart-box span-6">
            <div class="card-head">星の構造まとめ</div>
            <div class="card-sub">STAR STRUCTURE</div>
            <div class="card-body">${escapeHtml(p.structureSummaryText)}</div>
          </div>
        </div>
        ${buildCosmicNav(1)}
      </div>
    </div>
  </section>

  <!-- Slide 3: Natal Wheel -->
  <section class="page page--space page--obs" style="--space-opacity: 0.9;">
    ${renderBg("obs", strongBg)}
    <div class="blueprint-grid"></div>
    <div class="coordinate">OBS-03</div>
    <div class="slide">
      <div class="top center">
        <div class="label">NATAL WHEEL</div>
        <div class="title">出生ホイール</div>
      </div>
      <div class="middle center">
        ${natalWheelMarkup}
      </div>
      <div class="bottom">
        <div class="chart-box">
          <div class="card-head">チャート観測</div>
          <div class="card-sub">CHART OBSERVATION</div>
          <div class="card-body">${escapeHtml(p.natalObservation)}</div>
        </div>
        ${buildCosmicNav(2)}
      </div>
    </div>
  </section>

  <!-- Slide 4: Angles Axis -->
  <section class="page">
    <div class="blueprint-grid"></div>
    <div class="coordinate">ANG-04</div>
    <div class="slide">
      <div class="top">
        <div class="label">STAR AXIS</div>
        <div class="title">星の接続軸</div>
        <div class="subtext">ANGLES AXIS</div>
        <div class="angles-intro">${escapeHtml(p.anglesIntro || "")}</div>
      </div>
      <div class="middle">
        <div class="ang-grid">
          <div class="chart-box">
            <div class="card-head">ASC</div>
            <div class="card-sub">世界への入口</div>
            <div class="card-meta">${escapeHtml(p.angleMeta?.asc || "")}</div>
            <div class="card-body">${escapeHtml(p.anglesText?.asc || "")}</div>
          </div>
          <div class="chart-box">
            <div class="card-head">MC</div>
            <div class="card-sub">社会への方向</div>
            <div class="card-meta">${escapeHtml(p.angleMeta?.mc || "")}</div>
            <div class="card-body">${escapeHtml(p.anglesText?.mc || "")}</div>
          </div>
          <div class="chart-box">
            <div class="card-head">IC</div>
            <div class="card-sub">内側の根</div>
            <div class="card-meta">${escapeHtml(p.angleMeta?.ic || "")}</div>
            <div class="card-body">${escapeHtml(p.anglesText?.ic || "")}</div>
          </div>
          <div class="chart-box">
            <div class="card-head">DC</div>
            <div class="card-sub">他者との鏡</div>
            <div class="card-meta">${escapeHtml(p.angleMeta?.dc || "")}</div>
            <div class="card-body">${escapeHtml(p.anglesText?.dc || "")}</div>
          </div>
        </div>
        <div class="angular-block">
          <div class="chart-box">
            <div class="card-head">角度近接天体</div>
            <div class="card-sub">ANGULAR PLANETS</div>
            <div class="card-list">
              ${(p.angularPlanets || []).map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
          </div>
        </div>
      </div>
      <div class="bottom">
        <div class="chart-box">
          <div class="card-head">軸の構造</div>
          <div class="card-sub">AXIS STRUCTURE</div>
          <div class="card-body">${escapeHtml(p.anglesText?.axis_structure || "")}</div>
          <div class="axis-mini">ASC ↔ DC / MC ↔ IC</div>
          <div class="axis-mini-diagram">
            <span>ASC</span>
            <span class="axis-line"></span>
            <span>DC</span>
          </div>
          <div class="axis-mini-diagram">
            <span>MC</span>
            <span class="axis-line"></span>
            <span>IC</span>
          </div>
        </div>
        ${buildCosmicNav(3)}
      </div>
    </div>
  </section>

  <!-- Slide 5: Planet System -->
  <section class="page">
    <div class="blueprint-grid"></div>
    <div class="coordinate">PLN-05</div>
    <div class="slide">
      <div class="top">
        <div class="label">PLANET ROLES</div>
        <div class="title">星の役割</div>
      </div>
      <div class="middle">
        <div style="width:100%;">
          <div class="pln-grid">
            ${p.planetRolesAll.map((card) => `
            <div class="card">
              <div class="card-title">${escapeHtml(card.label)}</div>
              <div class="card-meta">${escapeHtml(card.meta)}</div>
              <div class="card-text">${escapeHtml(card.text)}</div>
            </div>`).join("\n")}
          </div>
        </div>
      </div>
      <div class="bottom">
        ${buildCosmicNav(4)}
      </div>
    </div>
  </section>

  <!-- Slide 6: System Layers -->
  <section class="page">
    <div class="blueprint-grid"></div>
    <div class="coordinate">LAY-06</div>
    <div class="slide">
      <div class="top">
        <div class="label">STAR LAYERS</div>
        <div class="title">星のレイヤー</div>
      </div>
      <div class="middle">
        <div class="lay-grid">
          <div class="chart-box">
            <div class="card-head">CORE LAYER</div>
            <div class="card-sub">コアレイヤー</div>
            <div class="card-list inline">
              ${(p.systemLayerLines?.core || []).map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
            <div class="card-body">${escapeHtml(p.planetGroups.core)}</div>
          </div>
          <div class="chart-box">
            <div class="card-head">PERSONAL LAYER</div>
            <div class="card-sub">パーソナルレイヤー</div>
            <div class="card-list inline">
              ${(p.systemLayerLines?.personal || []).map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
            <div class="card-body">${escapeHtml(p.planetGroups.personal)}</div>
          </div>
          <div class="chart-box">
            <div class="card-head">COLLECTIVE LAYER</div>
            <div class="card-sub">コレクティブレイヤー</div>
            <div class="card-list inline">
              ${(p.systemLayerLines?.collective || []).map((row) => `<div>${escapeHtml(row)}</div>`).join("")}
            </div>
            <div class="card-body">${escapeHtml(p.planetGroups.socialTranspersonal || p.planetGroups.social)}</div>
          </div>
        </div>
      </div>
      <div class="bottom">
        <div class="chart-box">
          <div class="card-head">LAYER FLOW</div>
          <div class="card-sub">レイヤーの流れ</div>
          <div class="card-body">${escapeHtml(p.planetGroups.flow || p.planetGroups.core)}</div>
        </div>
        ${buildCosmicNav(5)}
      </div>
    </div>
  </section>

  <!-- Slide 7: Deep Axis -->
  <section class="page">
    <div class="blueprint-grid"></div>
    <div class="coordinate">DEP-07</div>
    <div class="slide">
      <div class="top">
        <div class="label">DEEP AXIS</div>
        <div class="title">深層の軸</div>
      </div>
      <div class="middle">
        <div class="dep-grid">
          <div class="chart-box">
            <div class="card-head">ノード</div>
            <div class="card-sub">NODES</div>
            <div class="card-meta">${escapeHtml(p.deepAxisMeta?.south || "")}</div>
            <div class="card-meta node-meta">${escapeHtml(p.deepAxisMeta?.north || "")}</div>
            <div class="axis-line">
              <span class="axis-node left">${escapeHtml(southNodeSymbol)}</span>
              <span class="axis-node right">${escapeHtml(northNodeSymbol)}</span>
              <span class="axis-arrow">→</span>
            </div>
            <div class="card-body node-body">${escapeHtml(p.deepAxis.nodes)}</div>
          </div>
          <div class="chart-box">
            <div class="card-head">キロン</div>
            <div class="card-sub">CHIRON</div>
            <div class="card-meta">${escapeHtml(p.deepAxisMeta?.chiron || "")}</div>
            <div class="card-body">${escapeHtml(p.deepAxis.chiron)}</div>
          </div>
          <div class="chart-box">
            <div class="card-head">リリス</div>
            <div class="card-sub">LILITH</div>
            <div class="card-meta">${escapeHtml(p.deepAxisMeta?.lilith || "")}</div>
            <div class="card-body">${escapeHtml(p.deepAxis.lilith)}</div>
          </div>
        </div>
      </div>
      <div class="bottom">
        <div class="chart-box">
          <div class="card-head">深層テーマ</div>
          <div class="card-sub">DEEP PATTERN</div>
          <div class="card-body">${escapeHtml(p.deepPatternText)}</div>
        </div>
        ${buildCosmicNav(6)}
      </div>
    </div>
  </section>

  <!-- Slide 8: Aspect Network -->
  <section class="page page--medium page--aspect" style="--space-opacity: 0.6;">
    ${renderBg("asp", midBg)}
    <div class="blueprint-grid"></div>
    <div class="coordinate">ASP-08</div>
    <div class="slide">
      <div class="top">
        <div class="label">ASPECT NETWORK</div>
        <div class="title">星の関係</div>
      </div>
      <div class="middle">
          <div class="chart-box aspect-box" style="width: 100%; display:flex; flex-direction:column; align-items:center;">
            <div class="aspect-holder">
              ${buildAspectSvg() || `<div class="aspect-wheel"><div class="aspect-lines"></div></div>`}
            </div>
          </div>
      </div>
      <div class="bottom">
        <div class="asp-footer-stack">
          <div class="chart-box">
            <div class="card-head">主要アスペクト</div>
            <div class="card-sub">CORE ASPECTS</div>
            <div class="card-body">
              ${p.aspectMap.map((text) => `• ${escapeHtml(text)}`).join("<br/>")}
            </div>
          </div>
          <div class="chart-box">
            <div class="card-head">エネルギーの動き</div>
            <div class="card-sub">ENERGY DYNAMICS</div>
            <div class="card-body single-line">${escapeHtml(p.aspectEnergyText)}</div>
          </div>
        </div>
        ${buildCosmicNav(7)}
      </div>
    </div>
  </section>

  <!-- Slide 9: Chart Pattern -->
  <section class="page page--space" style="--space-opacity: 0.9;">
    ${renderBg("pat", strongBg)}
    <div class="blueprint-grid"></div>
    <div class="coordinate">PAT-09</div>
    <div class="slide">
      <div class="top">
        <div class="label">STAR PATTERN</div>
        <div class="title">星のパターン</div>
      </div>
      <div class="middle">
        <div class="pat-grid">
          <div class="chart-box">
            <div class="card-head">パターン名</div>
            <div class="card-sub">PATTERN NAME</div>
            <div class="card-body">${escapeHtml(p.patternName)}</div>
          </div>
          <div class="chart-box">
            <div class="card-head">星の構造</div>
            <div class="card-sub">STAR STRUCTURE</div>
            <div class="card-body">${escapeHtml(p.chartPattern)}</div>
          </div>
          <div class="chart-box">
            <div class="card-head">人生の方向</div>
            <div class="card-sub">LIFE DIRECTION</div>
            <div class="card-body">${escapeHtml(p.lifeDirection)}</div>
          </div>
        </div>
      </div>
      <div class="bottom">
        <div class="chart-box">
          <div class="card-head">最後のメッセージ</div>
          <div class="card-sub">FINAL NOTE</div>
          <div class="card-body">${escapeHtml(p.closingSummary)}</div>
        </div>
        <div class="subtext">This chart is a living system.</div>
        ${buildCosmicNav(8)}
      </div>
    </div>
  </section>
</body>
</html>`;

  return html;
}

module.exports = {
  buildBlueprintV25WireframeHtml,
  PAGE_WIDTH,
  PAGE_HEIGHT,
};
