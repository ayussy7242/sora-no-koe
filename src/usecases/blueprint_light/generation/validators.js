"use strict";

/**
 * V2 validation helpers.
 * Required keys + too-short checks live here.
 * If output is rejected, check these rules.
 */
const { LIMITS_V2 } = require("./limits");
const { isTooShort } = require("./text_utils");

const REQUIRED_BODY_KEYS = [
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
const REQUIRED_ANGLE_KEYS = ["asc", "mc", "ic", "dc"];

function normalizeAspectMapRows(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((row) => {
        if (typeof row === "string") return { key: "", type: "", text: row };
        return { key: row?.key || "", type: row?.type || "", text: row?.text || "" };
      })
      .filter((row) => typeof row?.text === "string");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, v]) => ({ key, type: v?.type || "", text: v?.text || "" }))
      .filter((row) => typeof row?.text === "string");
  }
  return [];
}

function hasAllRequiredKeysV2(source) {
  const dashboard = source?.dashboard || {};
  const planetRoles = source?.planet_roles || {};
  const systemLayers = source?.system_layers || {};
  const deepAxis = source?.deep_axis || {};
  const anglesV2 = source?.angles || {};
  const aspectMap = normalizeAspectMapRows(source?.aspect_map);

  const coreOk = typeof source?.core_snapshot === "string" && source.core_snapshot.trim();
  const dashboardOk =
    typeof dashboard?.element_balance === "string" &&
    typeof dashboard?.modality_balance === "string" &&
    typeof dashboard?.dominant_signs === "string" &&
    typeof dashboard?.dominant_houses === "string" &&
    typeof dashboard?.planet_distribution === "string" &&
    typeof dashboard?.energy_flow === "string" &&
    (typeof dashboard?.star_overview === "string" ||
      typeof dashboard?.star_structure === "string" ||
      typeof dashboard?.cosmic_structure === "string");
  const rolesOk =
    typeof planetRoles?.sun === "string" &&
    typeof planetRoles?.moon === "string" &&
    typeof planetRoles?.mercury === "string" &&
    typeof planetRoles?.venus === "string" &&
    typeof planetRoles?.mars === "string" &&
    typeof planetRoles?.jupiter === "string" &&
    typeof planetRoles?.saturn === "string" &&
    typeof planetRoles?.uranus === "string" &&
    typeof planetRoles?.neptune === "string" &&
    typeof planetRoles?.pluto === "string";
  const systemOk =
    typeof systemLayers?.core === "string" &&
    typeof systemLayers?.personal === "string" &&
    typeof systemLayers?.collective === "string" &&
    typeof systemLayers?.flow === "string";
  const deepOk =
    typeof deepAxis?.nodes === "string" &&
    typeof deepAxis?.chiron === "string" &&
    typeof deepAxis?.lilith === "string" &&
    typeof deepAxis?.pattern === "string";
  const anglesOk =
    typeof anglesV2?.asc === "string" &&
    typeof anglesV2?.mc === "string" &&
    typeof anglesV2?.ic === "string" &&
    typeof anglesV2?.dc === "string" &&
    typeof (anglesV2?.axis_structure || anglesV2?.axis_summary) === "string";
  const aspectOk = aspectMap.length >= 1 && aspectMap.every((row) => typeof row?.text === "string");
  const patternNameOk = typeof source?.pattern_name === "string" && source.pattern_name.trim();
  const drivingForceOk =
    (typeof source?.driving_force === "string" && source.driving_force.trim()) ||
    (typeof source?.star_focus === "string" && source.star_focus.trim()) ||
    (typeof source?.cosmic_focus === "string" && source.cosmic_focus.trim());
  const starSignatureOk =
    (typeof source?.star_signature === "string" && source.star_signature.trim()) ||
    (typeof source?.cosmic_signature === "string" && source.cosmic_signature.trim());
  const patternOk = typeof source?.chart_pattern === "string" && source.chart_pattern.trim();
  const structuralFlowOk =
    (typeof source?.structural_flow === "string" && source.structural_flow.trim()) ||
    (typeof source?.life_direction === "string" && source.life_direction.trim());
  const natalOk = typeof source?.natal_observation === "string" && source.natal_observation.trim();
  const closingOk = typeof source?.closing_summary === "string" && source.closing_summary.trim();
  return (
    coreOk &&
    dashboardOk &&
    rolesOk &&
    systemOk &&
    deepOk &&
    anglesOk &&
    aspectOk &&
    patternNameOk &&
    drivingForceOk &&
    starSignatureOk &&
    patternOk &&
    structuralFlowOk &&
    natalOk &&
    closingOk
  );
}

function hasTooShortSectionsV2(source) {
  if (!source || typeof source !== "object") return true;
  const dashboard = source?.dashboard || {};
  const planetRoles = source?.planet_roles || {};
  const systemLayers = source?.system_layers || {};
  const deepAxis = source?.deep_axis || {};
  const angles = source?.angles || {};
  const aspectMap = normalizeAspectMapRows(source?.aspect_map);
  const deepNodesNorth = deepAxis?.nodes_north || deepAxis?.deep_nodes_north || deepAxis?.north || "";
  const deepNodesSouth = deepAxis?.nodes_south || deepAxis?.deep_nodes_south || deepAxis?.south || "";
  const hasSplitNodes = Boolean(String(deepNodesNorth || "").trim() || String(deepNodesSouth || "").trim());

  const checks = [
    { text: source?.core_tagline, min: LIMITS_V2.core.tagline.min },
    { text: source?.core_snapshot, min: LIMITS_V2.core.snapshot.min },
    { text: dashboard?.element_balance, min: LIMITS_V2.map.element_balance.min },
    { text: dashboard?.modality_balance, min: LIMITS_V2.map.modality_balance.min },
    { text: dashboard?.dominant_signs, min: LIMITS_V2.map.dominant_signs.min },
    { text: dashboard?.dominant_houses, min: LIMITS_V2.map.dominant_houses.min },
    { text: dashboard?.planet_distribution, min: LIMITS_V2.map.planet_distribution.min },
    { text: dashboard?.energy_flow, min: LIMITS_V2.map.energy_flow.min },
    {
      text: dashboard?.star_overview || dashboard?.star_structure || dashboard?.cosmic_structure,
      min: LIMITS_V2.map.star_overview.min,
    },
    { text: planetRoles?.sun, min: LIMITS_V2.roles.planet.min },
    { text: planetRoles?.moon, min: LIMITS_V2.roles.planet.min },
    { text: planetRoles?.mercury, min: LIMITS_V2.roles.planet.min },
    { text: planetRoles?.venus, min: LIMITS_V2.roles.planet.min },
    { text: planetRoles?.mars, min: LIMITS_V2.roles.planet.min },
    { text: planetRoles?.jupiter, min: LIMITS_V2.roles.planet.min },
    { text: planetRoles?.saturn, min: LIMITS_V2.roles.planet.min },
    { text: planetRoles?.uranus, min: LIMITS_V2.roles.planet.min },
    { text: planetRoles?.neptune, min: LIMITS_V2.roles.planet.min },
    { text: planetRoles?.pluto, min: LIMITS_V2.roles.planet.min },
    { text: systemLayers?.core, min: LIMITS_V2.roles.layer.min },
    { text: systemLayers?.personal, min: LIMITS_V2.roles.layer.min },
    { text: systemLayers?.collective, min: LIMITS_V2.roles.layer.min },
    { text: systemLayers?.flow, min: LIMITS_V2.roles.layer_flow.min },
    { text: hasSplitNodes ? deepNodesNorth : deepAxis?.nodes, min: hasSplitNodes ? LIMITS_V2.roles.deep_nodes_north.min : LIMITS_V2.roles.deep_nodes.min },
    { text: hasSplitNodes ? deepNodesSouth : deepAxis?.nodes, min: hasSplitNodes ? LIMITS_V2.roles.deep_nodes_south.min : LIMITS_V2.roles.deep_nodes.min },
    { text: deepAxis?.chiron, min: LIMITS_V2.roles.deep_chiron.min },
    { text: deepAxis?.lilith, min: LIMITS_V2.roles.deep_lilith.min },
    { text: deepAxis?.deep_pattern || deepAxis?.pattern, min: LIMITS_V2.roles.deep_pattern.min },
    { text: angles?.asc, min: LIMITS_V2.roles.angle.min },
    { text: angles?.mc, min: LIMITS_V2.roles.angle.min },
    { text: angles?.ic, min: LIMITS_V2.roles.angle.min },
    { text: angles?.dc, min: LIMITS_V2.roles.angle.min },
    { text: angles?.axis_structure || angles?.axis_summary, min: LIMITS_V2.roles.axis_structure.min },
    { text: source?.pattern_name, min: LIMITS_V2.closing.pattern_name.min },
    { text: source?.driving_force || source?.star_focus || source?.cosmic_focus, min: LIMITS_V2.core.driving_force.min },
    { text: source?.star_signature || source?.cosmic_signature, min: LIMITS_V2.core.star_signature.min },
    { text: source?.chart_pattern, min: LIMITS_V2.closing.chart_pattern.min },
    { text: source?.structural_flow || source?.life_direction, min: LIMITS_V2.closing.structural_flow.min },
    { text: source?.natal_observation, min: LIMITS_V2.obs.natal_observation.min },
    { text: source?.closing_summary, min: LIMITS_V2.closing.closing_summary.min },
  ];

  const tooShort = checks.some((row) => isTooShort(row.text, row.min));
  if (tooShort) return true;

  if (aspectMap.length < 1) return true;
  return aspectMap.some((row) => isTooShort(row?.text, LIMITS_V2.aspects.item.min));
}

function collectV2ValidationIssues(source) {
  const issues = { missing: [], tooShort: [], aspectCount: null };
  if (!source || typeof source !== "object") {
    issues.missing.push("source");
    return issues;
  }
  const dashboard = source?.dashboard || {};
  const planetRoles = source?.planet_roles || {};
  const systemLayers = source?.system_layers || {};
  const deepAxis = source?.deep_axis || {};
  const angles = source?.angles || {};
  const aspectMap = normalizeAspectMapRows(source?.aspect_map);
  const deepNodesNorth = deepAxis?.nodes_north || deepAxis?.deep_nodes_north || deepAxis?.north || "";
  const deepNodesSouth = deepAxis?.nodes_south || deepAxis?.deep_nodes_south || deepAxis?.south || "";
  const hasSplitNodes = Boolean(String(deepNodesNorth || "").trim() || String(deepNodesSouth || "").trim());

  const requireText = (key, value) => {
    if (typeof value !== "string" || !value.trim()) issues.missing.push(key);
  };
  const checkShort = (key, value, min) => {
    if (isTooShort(value, min)) issues.tooShort.push(key);
  };

  requireText("core_tagline", source?.core_tagline);
  requireText("core_snapshot", source?.core_snapshot);
  requireText("dashboard.element_balance", dashboard?.element_balance);
  requireText("dashboard.modality_balance", dashboard?.modality_balance);
  requireText("dashboard.dominant_signs", dashboard?.dominant_signs);
  requireText("dashboard.dominant_houses", dashboard?.dominant_houses);
  requireText("dashboard.planet_distribution", dashboard?.planet_distribution);
  requireText("dashboard.energy_flow", dashboard?.energy_flow);
  requireText(
    "dashboard.star_overview",
    dashboard?.star_overview || dashboard?.star_structure || dashboard?.cosmic_structure
  );
  for (const key of REQUIRED_BODY_KEYS) {
    requireText(`planet_roles.${key}`, planetRoles?.[key]);
  }
  requireText("system_layers.core", systemLayers?.core);
  requireText("system_layers.personal", systemLayers?.personal);
  requireText("system_layers.collective", systemLayers?.collective);
  requireText("system_layers.flow", systemLayers?.flow);
  if (hasSplitNodes) {
    requireText("deep_axis.nodes_north", deepNodesNorth);
    requireText("deep_axis.nodes_south", deepNodesSouth);
  } else {
    requireText("deep_axis.nodes", deepAxis?.nodes);
  }
  requireText("deep_axis.chiron", deepAxis?.chiron);
  requireText("deep_axis.lilith", deepAxis?.lilith);
  requireText("deep_axis.deep_pattern", deepAxis?.deep_pattern || deepAxis?.pattern);
  for (const key of REQUIRED_ANGLE_KEYS) {
    requireText(`angles.${key}`, angles?.[key]);
  }
  requireText("angles.axis_structure", angles?.axis_structure || angles?.axis_summary);
  requireText("pattern_name", source?.pattern_name);
  requireText("driving_force", source?.driving_force || source?.star_focus || source?.cosmic_focus);
  requireText("star_signature", source?.star_signature || source?.cosmic_signature);
  requireText("chart_pattern", source?.chart_pattern);
  requireText("structural_flow", source?.structural_flow || source?.life_direction);
  requireText("natal_observation", source?.natal_observation);
  requireText("closing_summary", source?.closing_summary);

  checkShort("core_tagline", source?.core_tagline, LIMITS_V2.core.tagline.min);
  checkShort("core_snapshot", source?.core_snapshot, LIMITS_V2.core.snapshot.min);
  checkShort("dashboard.element_balance", dashboard?.element_balance, LIMITS_V2.map.element_balance.min);
  checkShort("dashboard.modality_balance", dashboard?.modality_balance, LIMITS_V2.map.modality_balance.min);
  checkShort("dashboard.dominant_signs", dashboard?.dominant_signs, LIMITS_V2.map.dominant_signs.min);
  checkShort("dashboard.dominant_houses", dashboard?.dominant_houses, LIMITS_V2.map.dominant_houses.min);
  checkShort("dashboard.planet_distribution", dashboard?.planet_distribution, LIMITS_V2.map.planet_distribution.min);
  checkShort("dashboard.energy_flow", dashboard?.energy_flow, LIMITS_V2.map.energy_flow.min);
  checkShort(
    "dashboard.star_overview",
    dashboard?.star_overview || dashboard?.star_structure || dashboard?.cosmic_structure,
    LIMITS_V2.map.star_overview.min
  );
  checkShort("planet_roles.sun", planetRoles?.sun, LIMITS_V2.roles.planet.min);
  checkShort("planet_roles.moon", planetRoles?.moon, LIMITS_V2.roles.planet.min);
  checkShort("planet_roles.mercury", planetRoles?.mercury, LIMITS_V2.roles.planet.min);
  checkShort("planet_roles.venus", planetRoles?.venus, LIMITS_V2.roles.planet.min);
  checkShort("planet_roles.mars", planetRoles?.mars, LIMITS_V2.roles.planet.min);
  checkShort("planet_roles.jupiter", planetRoles?.jupiter, LIMITS_V2.roles.planet.min);
  checkShort("planet_roles.saturn", planetRoles?.saturn, LIMITS_V2.roles.planet.min);
  checkShort("planet_roles.uranus", planetRoles?.uranus, LIMITS_V2.roles.planet.min);
  checkShort("planet_roles.neptune", planetRoles?.neptune, LIMITS_V2.roles.planet.min);
  checkShort("planet_roles.pluto", planetRoles?.pluto, LIMITS_V2.roles.planet.min);
  checkShort("system_layers.core", systemLayers?.core, LIMITS_V2.roles.layer.min);
  checkShort("system_layers.personal", systemLayers?.personal, LIMITS_V2.roles.layer.min);
  checkShort("system_layers.collective", systemLayers?.collective, LIMITS_V2.roles.layer.min);
  checkShort("system_layers.flow", systemLayers?.flow, LIMITS_V2.roles.layer_flow.min);
  if (hasSplitNodes) {
    checkShort("deep_axis.nodes_north", deepNodesNorth, LIMITS_V2.roles.deep_nodes_north.min);
    checkShort("deep_axis.nodes_south", deepNodesSouth, LIMITS_V2.roles.deep_nodes_south.min);
  } else {
    checkShort("deep_axis.nodes", deepAxis?.nodes, LIMITS_V2.roles.deep_nodes.min);
  }
  checkShort("deep_axis.chiron", deepAxis?.chiron, LIMITS_V2.roles.deep_chiron.min);
  checkShort("deep_axis.lilith", deepAxis?.lilith, LIMITS_V2.roles.deep_lilith.min);
  checkShort(
    "deep_axis.deep_pattern",
    deepAxis?.deep_pattern || deepAxis?.pattern,
    LIMITS_V2.roles.deep_pattern.min
  );
  checkShort("angles.asc", angles?.asc, LIMITS_V2.roles.angle.min);
  checkShort("angles.mc", angles?.mc, LIMITS_V2.roles.angle.min);
  checkShort("angles.ic", angles?.ic, LIMITS_V2.roles.angle.min);
  checkShort("angles.dc", angles?.dc, LIMITS_V2.roles.angle.min);
  checkShort(
    "angles.axis_structure",
    angles?.axis_structure || angles?.axis_summary,
    LIMITS_V2.roles.axis_structure.min
  );
  checkShort("pattern_name", source?.pattern_name, LIMITS_V2.closing.pattern_name.min);
  checkShort("driving_force", source?.driving_force || source?.star_focus || source?.cosmic_focus, LIMITS_V2.core.driving_force.min);
  checkShort("star_signature", source?.star_signature || source?.cosmic_signature, LIMITS_V2.core.star_signature.min);
  checkShort("chart_pattern", source?.chart_pattern, LIMITS_V2.closing.chart_pattern.min);
  checkShort("structural_flow", source?.structural_flow || source?.life_direction, LIMITS_V2.closing.structural_flow.min);
  checkShort("natal_observation", source?.natal_observation, LIMITS_V2.obs.natal_observation.min);
  checkShort("closing_summary", source?.closing_summary, LIMITS_V2.closing.closing_summary.min);

  if (aspectMap.length) {
    issues.aspectCount = aspectMap.length;
    aspectMap.forEach((row, idx) => {
      if (isTooShort(row?.text, LIMITS_V2.aspects.item.min)) {
        issues.tooShort.push(`aspect_map.${row?.key || idx}`);
      }
    });
  }

  return issues;
}

module.exports = {
  normalizeAspectMapRows,
  hasAllRequiredKeysV2,
  hasTooShortSectionsV2,
  collectV2ValidationIssues,
};
