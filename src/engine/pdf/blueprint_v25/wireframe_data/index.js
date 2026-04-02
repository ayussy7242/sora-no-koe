"use strict";

const {
  BODY_GLYPH,
  BODY_LABEL_JA,
  PLANET_ROLE_TAGLINES,
  AXIS_ROLE_TAGLINES,
  DEEP_AXIS_ROLE_TAGLINES,
  SIGN_SYMBOL,
} = require("../constants");
const {
  toNumber,
  formatSignJa,
} = require("../utils");
const { extractFromKernel } = require("./kernel");
const { extractFromMasterChart } = require("./master_chart");

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
