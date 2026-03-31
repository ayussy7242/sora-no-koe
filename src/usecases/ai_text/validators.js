"use strict";

/**
 * V2 validation helpers.
 * Required keys + too-short checks live here.
 * If output is rejected, check these rules.
 */
const { LIMITS_V2 } = require("./limits");
const {
  isTooShort,
  countChars,
  countCharsNoNewlines,
  countCharsNoSpaces,
  countLines,
  countQuestions,
  countSentences,
} = require("./text_utils");

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

  const dashboardOk =
    typeof dashboard?.element_balance === "string" &&
    typeof dashboard?.modality_balance === "string" &&
    typeof dashboard?.dominant_signs === "string" &&
    typeof dashboard?.dominant_houses === "string" &&
    typeof dashboard?.planet_distribution === "string" &&
    typeof dashboard?.energy_flow === "string";
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
    typeof systemLayers?.collective === "string";
  const deepOk =
    typeof deepAxis?.nodes === "string" &&
    typeof deepAxis?.chiron === "string" &&
    typeof deepAxis?.lilith === "string" &&
    typeof deepAxis?.pattern === "string";
  const anglesOk =
    typeof anglesV2?.asc === "string" &&
    typeof anglesV2?.mc === "string" &&
    typeof anglesV2?.ic === "string" &&
    typeof anglesV2?.dc === "string";
  const aspectOk = aspectMap.length >= 1 && aspectMap.every((row) => typeof row?.text === "string");
  const patternNameOk = typeof source?.pattern_name === "string" && source.pattern_name.trim();
  const drivingForceOk =
    (typeof source?.star_drive === "string" && source.star_drive.trim()) ||
    (typeof source?.driving_force === "string" && source.driving_force.trim()) ||
    (typeof source?.star_focus === "string" && source.star_focus.trim()) ||
    (typeof source?.cosmic_focus === "string" && source.cosmic_focus.trim());
  const starSignatureOk =
    (typeof source?.star_signature === "string" && source.star_signature.trim()) ||
    (typeof source?.cosmic_signature === "string" && source.cosmic_signature.trim());
  const natalOk = typeof source?.natal_observation === "string" && source.natal_observation.trim();
  const closingOk = typeof source?.closing_summary === "string" && source.closing_summary.trim();
  return (
    dashboardOk &&
    rolesOk &&
    systemOk &&
    deepOk &&
    anglesOk &&
    aspectOk &&
    patternNameOk &&
    drivingForceOk &&
    starSignatureOk &&
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
    { text: dashboard?.element_balance, min: LIMITS_V2.map.element_balance.min },
    { text: dashboard?.modality_balance, min: LIMITS_V2.map.modality_balance.min },
    { text: dashboard?.dominant_signs, min: LIMITS_V2.map.dominant_signs.min },
    { text: dashboard?.dominant_houses, min: LIMITS_V2.map.dominant_houses.min },
    { text: dashboard?.planet_distribution, min: LIMITS_V2.map.planet_distribution.min },
    { text: dashboard?.energy_flow, min: LIMITS_V2.map.energy_flow.min },
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
    { text: hasSplitNodes ? deepNodesNorth : deepAxis?.nodes, min: hasSplitNodes ? LIMITS_V2.roles.deep_nodes_north.min : LIMITS_V2.roles.deep_nodes.min },
    { text: hasSplitNodes ? deepNodesSouth : deepAxis?.nodes, min: hasSplitNodes ? LIMITS_V2.roles.deep_nodes_south.min : LIMITS_V2.roles.deep_nodes.min },
    { text: deepAxis?.chiron, min: LIMITS_V2.roles.deep_chiron.min },
    { text: deepAxis?.lilith, min: LIMITS_V2.roles.deep_lilith.min },
    { text: angles?.asc, min: LIMITS_V2.roles.angle.min },
    { text: angles?.mc, min: LIMITS_V2.roles.angle.min },
    { text: angles?.ic, min: LIMITS_V2.roles.angle.min },
    { text: angles?.dc, min: LIMITS_V2.roles.angle.min },
    { text: source?.pattern_name, min: LIMITS_V2.closing.pattern_name.min },
    { text: source?.star_drive || source?.driving_force || source?.star_focus || source?.cosmic_focus, min: LIMITS_V2.core.star_drive.min },
    { text: source?.star_signature || source?.cosmic_signature, min: LIMITS_V2.core.star_signature.min },
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

  requireText("dashboard.element_balance", dashboard?.element_balance);
  requireText("dashboard.modality_balance", dashboard?.modality_balance);
  requireText("dashboard.dominant_signs", dashboard?.dominant_signs);
  requireText("dashboard.dominant_houses", dashboard?.dominant_houses);
  requireText("dashboard.planet_distribution", dashboard?.planet_distribution);
  requireText("dashboard.energy_flow", dashboard?.energy_flow);
  for (const key of REQUIRED_BODY_KEYS) {
    requireText(`planet_roles.${key}`, planetRoles?.[key]);
  }
  requireText("system_layers.core", systemLayers?.core);
  requireText("system_layers.personal", systemLayers?.personal);
  requireText("system_layers.collective", systemLayers?.collective);
  if (hasSplitNodes) {
    requireText("deep_axis.nodes_north", deepNodesNorth);
    requireText("deep_axis.nodes_south", deepNodesSouth);
  } else {
    requireText("deep_axis.nodes", deepAxis?.nodes);
  }
  requireText("deep_axis.chiron", deepAxis?.chiron);
  requireText("deep_axis.lilith", deepAxis?.lilith);
  for (const key of REQUIRED_ANGLE_KEYS) {
    requireText(`angles.${key}`, angles?.[key]);
  }
  requireText("pattern_name", source?.pattern_name);
  requireText("star_drive", source?.star_drive || source?.driving_force || source?.star_focus || source?.cosmic_focus);
  requireText("star_signature", source?.star_signature || source?.cosmic_signature);
  requireText("natal_observation", source?.natal_observation);
  requireText("closing_summary", source?.closing_summary);

  checkShort("dashboard.element_balance", dashboard?.element_balance, LIMITS_V2.map.element_balance.min);
  checkShort("dashboard.modality_balance", dashboard?.modality_balance, LIMITS_V2.map.modality_balance.min);
  checkShort("dashboard.dominant_signs", dashboard?.dominant_signs, LIMITS_V2.map.dominant_signs.min);
  checkShort("dashboard.dominant_houses", dashboard?.dominant_houses, LIMITS_V2.map.dominant_houses.min);
  checkShort("dashboard.planet_distribution", dashboard?.planet_distribution, LIMITS_V2.map.planet_distribution.min);
  checkShort("dashboard.energy_flow", dashboard?.energy_flow, LIMITS_V2.map.energy_flow.min);
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
  if (hasSplitNodes) {
    checkShort("deep_axis.nodes_north", deepNodesNorth, LIMITS_V2.roles.deep_nodes_north.min);
    checkShort("deep_axis.nodes_south", deepNodesSouth, LIMITS_V2.roles.deep_nodes_south.min);
  } else {
    checkShort("deep_axis.nodes", deepAxis?.nodes, LIMITS_V2.roles.deep_nodes.min);
  }
  checkShort("deep_axis.chiron", deepAxis?.chiron, LIMITS_V2.roles.deep_chiron.min);
  checkShort("deep_axis.lilith", deepAxis?.lilith, LIMITS_V2.roles.deep_lilith.min);
  checkShort("angles.asc", angles?.asc, LIMITS_V2.roles.angle.min);
  checkShort("angles.mc", angles?.mc, LIMITS_V2.roles.angle.min);
  checkShort("angles.ic", angles?.ic, LIMITS_V2.roles.angle.min);
  checkShort("angles.dc", angles?.dc, LIMITS_V2.roles.angle.min);
  checkShort("pattern_name", source?.pattern_name, LIMITS_V2.closing.pattern_name.min);
  checkShort(
    "star_drive",
    source?.star_drive || source?.driving_force || source?.star_focus || source?.cosmic_focus,
    LIMITS_V2.core.star_drive.min
  );
  checkShort("star_signature", source?.star_signature || source?.cosmic_signature, LIMITS_V2.core.star_signature.min);
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

function resolveCharCount(text, mode) {
  switch (mode) {
    case "no_newlines":
      return countCharsNoNewlines(text);
    case "no_spaces":
      return countCharsNoSpaces(text);
    case "chars":
    default:
      return countChars(text);
  }
}

function buildError({ code, message, reason, meta } = {}) {
  return {
    code,
    message: message || "",
    reason: reason || "",
    meta: meta || {},
  };
}

function validateLength(text, preset, meta, errors) {
  const min = Number.isFinite(Number(preset?.minChars)) ? Number(preset.minChars) : null;
  const max = Number.isFinite(Number(preset?.maxChars)) ? Number(preset.maxChars) : null;
  if (min == null && max == null) return;
  const mode = preset?.charCountMode || "chars";
  const len = resolveCharCount(text, mode);
  meta.charCount = len;
  if (min != null && len < min) {
    errors.push(buildError({
      code: "TOO_SHORT",
      message: `min ${min} chars`,
      reason: `too_short:${len}`,
      meta: { min, len },
    }));
  }
  if (max != null && len > max) {
    errors.push(buildError({
      code: "TOO_LONG",
      message: `max ${max} chars`,
      reason: `too_long:${len}`,
      meta: { max, len },
    }));
  }
}

function validateSentenceCount(text, preset, meta, errors) {
  const cfg = preset?.sentenceCount;
  if (!cfg) return;
  const min = Number.isFinite(Number(cfg.min)) ? Number(cfg.min) : null;
  const max = Number.isFinite(Number(cfg.max)) ? Number(cfg.max) : null;
  const count = countSentences(text);
  meta.sentenceCount = count;
  if (min != null && count < min) {
    errors.push(buildError({
      code: "SENTENCE_COUNT",
      message: `min ${min} sentences`,
      reason: cfg.reason || `sentences:${count}`,
      meta: { min, count },
    }));
  }
  if (max != null && count > max) {
    errors.push(buildError({
      code: "SENTENCE_COUNT",
      message: `max ${max} sentences`,
      reason: cfg.reason || `sentences:${count}`,
      meta: { max, count },
    }));
  }
}

function validateLineCount(text, preset, meta, errors) {
  const cfg = preset?.lineCount;
  if (!cfg) return;
  const min = Number.isFinite(Number(cfg.min)) ? Number(cfg.min) : null;
  const max = Number.isFinite(Number(cfg.max)) ? Number(cfg.max) : null;
  const count = countLines(text, { ignoreBlank: cfg.ignoreBlank !== false });
  meta.lineCount = count;
  if (min != null && count < min) {
    errors.push(buildError({
      code: "LINE_COUNT",
      message: `min ${min} lines`,
      reason: cfg.reason || `lines:${count}`,
      meta: { min, count },
    }));
  }
  if (max != null && count > max) {
    errors.push(buildError({
      code: "LINE_COUNT",
      message: `max ${max} lines`,
      reason: cfg.reason || `lines:${count}`,
      meta: { max, count },
    }));
  }
}

function validateQuestionCount(text, preset, meta, errors) {
  const cfg = preset?.questionCount;
  if (!cfg) return;
  const max = Number.isFinite(Number(cfg.max)) ? Number(cfg.max) : null;
  const count = countQuestions(text);
  meta.questionCount = count;
  if (max != null && count > max) {
    errors.push(buildError({
      code: "QUESTION_COUNT",
      message: `max ${max} questions`,
      reason: cfg.reason || "too_many_questions",
      meta: { max, count },
    }));
  }
}

function validateForbiddenTerms(text, preset, meta, errors) {
  const terms = Array.isArray(preset?.forbiddenTerms) ? preset.forbiddenTerms : [];
  const patterns = Array.isArray(preset?.forbiddenPatterns) ? preset.forbiddenPatterns : [];
  const raw = String(text || "");
  const reasons = preset?.forbiddenTermReasons || {};
  for (const term of terms) {
    if (!term) continue;
    if (raw.includes(term)) {
      errors.push(buildError({
        code: "FORBIDDEN_TERM",
        message: `forbidden term: ${term}`,
        reason: reasons[term] || "has_forbidden",
        meta: { term },
      }));
      return;
    }
  }
  for (const pattern of patterns) {
    if (!pattern) continue;
    const re = pattern instanceof RegExp ? pattern : new RegExp(String(pattern));
    const match = raw.match(re);
    if (match && match[0]) {
      errors.push(buildError({
        code: "FORBIDDEN_PATTERN",
        message: `forbidden pattern: ${String(re)}`,
        reason: preset?.forbiddenPatternReason || "has_forbidden",
        meta: { pattern: String(re) },
      }));
      return;
    }
  }
}

function validatePrefixSuffix(text, preset, meta, errors) {
  const raw = String(text || "");
  const prefix = preset?.mustStartWith;
  if (prefix) {
    const prefixes = Array.isArray(prefix) ? prefix : [prefix];
    const ok = prefixes.some((p) => p && raw.startsWith(p));
    if (!ok) {
      errors.push(buildError({
        code: "PREFIX_MISSING",
        message: "missing prefix",
        reason: preset?.prefixReason || "no_prefix",
        meta: { prefix },
      }));
    }
  }
  const suffix = preset?.mustEndWith;
  if (suffix) {
    const suffixes = Array.isArray(suffix) ? suffix : [suffix];
    const ok = suffixes.some((s) => s && raw.endsWith(s));
    if (!ok) {
      errors.push(buildError({
        code: "SUFFIX_MISSING",
        message: "missing suffix",
        reason: preset?.suffixReason || "no_suffix",
        meta: { suffix },
      }));
    }
  }
}

function validateNoNewlines(text, preset, meta, errors) {
  if (!preset?.disallowNewlines) return;
  if (/\\r|\\n/.test(String(text || ""))) {
    errors.push(buildError({
      code: "HAS_NEWLINE",
      message: "newline not allowed",
      reason: preset?.newlineReason || "has_newline",
      meta: {},
    }));
  }
}

function validateRequired(text, preset, meta, errors) {
  if (preset?.allowEmpty) return;
  if (!String(text || "").trim()) {
    errors.push(buildError({
      code: "EMPTY",
      message: "empty",
      reason: "empty",
      meta: {},
    }));
  }
}

function validateByPreset(text, preset = {}, opts = {}) {
  const meta = {};
  const errors = [];
  const value = String(text || "");

  validateRequired(value, preset, meta, errors);
  validateNoNewlines(value, preset, meta, errors);
  validatePrefixSuffix(value, preset, meta, errors);
  validateForbiddenTerms(value, preset, meta, errors);
  validateLineCount(value, preset, meta, errors);
  validateSentenceCount(value, preset, meta, errors);
  validateQuestionCount(value, preset, meta, errors);
  validateLength(value, preset, meta, errors);

  return {
    ok: errors.length === 0,
    text: value,
    errors,
    meta,
    reason: errors[0]?.reason || "",
  };
}

module.exports = {
  normalizeAspectMapRows,
  hasAllRequiredKeysV2,
  hasTooShortSectionsV2,
  collectV2ValidationIssues,
  resolveCharCount,
  validateLength,
  validateSentenceCount,
  validateLineCount,
  validateQuestionCount,
  validateForbiddenTerms,
  validatePrefixSuffix,
  validateNoNewlines,
  validateRequired,
  validateByPreset,
};
