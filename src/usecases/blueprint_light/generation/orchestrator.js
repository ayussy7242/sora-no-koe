"use strict";

/**
 * V2 orchestration (single source for generate flow).
 * Builds payloads, calls LLM, applies limits/normalizers.
 * If output looks wrong, check LIMITS and text_utils next.
 */
const { createChatCompletion } = require("../../../integrations/openai/openai_client");
const {
  SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT,
  BLUEPRINT_LIGHT_V2_USER_PROMPT_TEMPLATE,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CORE,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_MAP,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_OBS,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ROLES,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ASPECTS,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CLOSING,
} = require("../../../content/prompts/sora/sora_ai_prompts");
const {
  buildMasterChartFromKernel,
  writeMasterChartTmp,
} = require("../build_master_chart");
const {
  getSysPageData,
  getMapPageData,
  getObsPageData,
  getAnglesPageData,
  getPlanetPageData,
  getLayersPageData,
  getDeepPageData,
  getAspectPageData,
  getPatternPageData,
} = require("../page_extractors");
const { extractJson, parseJsonWithRepair } = require("./json_utils");
const {
  normalizeV2Text,
  normalizeV2AspectText,
  stripPlacementTokens,
} = require("./text_utils");
const {
  normalizeAspectMapRows,
  collectV2ValidationIssues,
} = require("./validators");
const { LIMITS_V2 } = require("./limits");
const {
  SHAPE_CORE,
  SHAPE_MAP,
  SHAPE_OBS,
  SHAPE_ROLES,
  SHAPE_ASPECTS,
  SHAPE_CLOSING,
} = require("./page_shapes");

const MAX_TOKENS_ALL_BATCH = 5000;

function buildV2Bundle(input) {
  const aspects = Array.isArray(input?.kernel?.aspects) ? input.kernel.aspects : [];
  const houses = input?.kernel?.houses || null;
  return {
    ...input,
    aspects,
    houses,
  };
}

function buildAllBatchPromptV2({ input, retryNote = "" }) {
  const header = BLUEPRINT_LIGHT_V2_USER_PROMPT_TEMPLATE;
  const payload = input?.page_payload ? input.page_payload : buildV2Bundle(input);
  const note = retryNote ? `\n\n【追加指示】${retryNote}\n` : "";
  return `${header}${note}\nINPUT:\n${JSON.stringify(payload || {}, null, 2)}`;
}

function buildAllBatchPromptV2Segment({ input, outputShape, retryNote = "", template }) {
  const header = template || BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CORE;
  const payload = input?.page_payload ? input.page_payload : buildV2Bundle(input);
  const note = retryNote ? `\n\n【追加指示】${retryNote}\n` : "";
  const shape = outputShape ? `\n\n出力JSONの形：\n${outputShape}\n` : "";
  return `${header}${shape}${note}\nINPUT:\n${JSON.stringify(payload || {}, null, 2)}`;
}

function writeDebugJsonArtifacts({ content, jsonText, tag }) {
  try {
    const fs = require("fs");
    const safeTag = String(tag || "v2");
    const base = `/tmp/blueprint_${safeTag}_${Date.now()}`;
    fs.writeFileSync(`${base}_raw.txt`, String(content || ""));
    if (jsonText) fs.writeFileSync(`${base}_json.txt`, String(jsonText));
    return base;
  } catch (_) {
    return null;
  }
}

async function generateAllBatchV2Segment({
  apiKey,
  baseUrl,
  model,
  input,
  outputShape,
  retryNote = "",
  template,
  debug = false,
  debugTag = "v2_segment",
}) {
  const prompt = buildAllBatchPromptV2Segment({ input, outputShape, retryNote, template });
  const content = await createChatCompletion({
    apiKey,
    baseUrl,
    model,
    messages: [
      { role: "system", content: SORA_AI_SYSTEM_PROMPT_BLUEPRINT_LIGHT },
      { role: "user", content: prompt },
    ],
    temperature: 0.9,
    maxTokens: MAX_TOKENS_ALL_BATCH,
  });
  if (content === "__RETRY__") return { ok: false, reason: "retry" };
  const jsonText = extractJson(content);
  if (!jsonText) {
    const debugPath = debug ? writeDebugJsonArtifacts({ content, jsonText: null, tag: `${debugTag}_extract` }) : null;
    return { ok: false, reason: "json_extract_failed", debugPath };
  }
  const parsed = parseJsonWithRepair(jsonText);
  if (!parsed.ok) {
    const debugPath = debug ? writeDebugJsonArtifacts({ content, jsonText, tag: `${debugTag}_parse` }) : null;
    return { ok: false, reason: "json_parse_failed", error: parsed.error, debugPath };
  }
  if (!parsed.data || typeof parsed.data !== "object") return { ok: false, reason: "shape_invalid" };
  return { ok: true, data: parsed.data };
}

function applyLimits(text, limits) {
  if (!limits) return normalizeV2Text(text, {});
  return normalizeV2Text(text, {
    minSentences: limits.minSentences,
    maxSentences: limits.maxSentences,
    minChars: limits.min,
    maxChars: limits.max,
  });
}

function applyLimitsOverride(text, limits, overrides = {}) {
  if (!limits) return normalizeV2Text(text, overrides);
  return normalizeV2Text(text, {
    minSentences: limits.minSentences,
    maxSentences: limits.maxSentences,
    minChars: limits.min,
    maxChars: limits.max,
    ...overrides,
  });
}

async function generateBlueprintLightTextV2({ env, input }) {
  const apiKey = env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!apiKey) return { ok: false, reason: "no_api_key" };
  const model =
    env?.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    process.env.OPENAI_MODEL_BLUEPRINT_LIGHT ||
    "gpt-4o";
  const baseUrl = process.env.OPENAI_BASE_URL || env?.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const debug = String(env?.BLUEPRINT_DEBUG_JSON || process.env.BLUEPRINT_DEBUG_JSON || "") === "1";
  const kernel = input?.kernel || {};
  const slug =
    input?.slug ||
    input?.line_user_id ||
    input?.userId ||
    input?.user_id ||
    "local";
  const identity = input?.identity || input?.profile || {};

  const masterChart = buildMasterChartFromKernel(kernel, input?.longitudes || null);
  const masterPath = writeMasterChartTmp(slug, masterChart);

  const sysData = getSysPageData(masterChart, identity);
  const mapData = getMapPageData(masterChart);
  const obsData = getObsPageData(masterChart);
  const anglesData = getAnglesPageData(masterChart);
  const planetData = getPlanetPageData(masterChart);
  const layersData = getLayersPageData(masterChart);
  const deepData = getDeepPageData(masterChart);
  const aspectData = getAspectPageData(masterChart);
  const patternData = getPatternPageData(masterChart);

  const corePayload = {
    page: "CORE",
    sys: sysData,
    map: mapData,
    obs: obsData,
  };
  const mapPayload = {
    page: "MAP",
    map: mapData,
    dashboard: mapData,
  };
  const obsPayload = {
    page: "OBS",
    obs: obsData,
  };
  const rolesPayload = {
    page: "ROLES",
    planets: planetData,
    layers: layersData,
    deep: deepData,
    angles: anglesData?.angles || {},
  };
  const aspectsPayload = {
    page: "ASPECTS",
    aspects: aspectData,
  };
  const closingPayload = {
    page: "CLOSING",
    pattern: patternData,
  };

  const segment1 = await generateAllBatchV2Segment({
    apiKey,
    baseUrl,
    model,
    input: { page_payload: corePayload },
    outputShape: SHAPE_CORE,
    template: BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CORE,
    retryNote: "出力は厳密なJSONのみ。末尾カンマ禁止。ダブルクォートのみ。",
    debug,
    debugTag: "v2_seg_core",
  });
  if (!segment1?.ok) return { ok: false, reason: segment1.reason || "ai_failed", debugPath: segment1.debugPath };

  const segment2 = await generateAllBatchV2Segment({
    apiKey,
    baseUrl,
    model,
    input: { page_payload: mapPayload },
    outputShape: SHAPE_MAP,
    template: BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_MAP,
    retryNote: "出力は厳密なJSONのみ。末尾カンマ禁止。ダブルクォートのみ。",
    debug,
    debugTag: "v2_seg_map",
  });
  if (!segment2?.ok) return { ok: false, reason: segment2.reason || "ai_failed", debugPath: segment2.debugPath };

  const segment3 = await generateAllBatchV2Segment({
    apiKey,
    baseUrl,
    model,
    input: { page_payload: obsPayload },
    outputShape: SHAPE_OBS,
    template: BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_OBS,
    retryNote: "出力は厳密なJSONのみ。末尾カンマ禁止。ダブルクォートのみ。",
    debug,
    debugTag: "v2_seg_obs",
  });
  if (!segment3?.ok) return { ok: false, reason: segment3.reason || "ai_failed", debugPath: segment3.debugPath };

  const segment4 = await generateAllBatchV2Segment({
    apiKey,
    baseUrl,
    model,
    input: { page_payload: rolesPayload },
    outputShape: SHAPE_ROLES,
    template: BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ROLES,
    retryNote: "出力は厳密なJSONのみ。末尾カンマ禁止。ダブルクォートのみ。",
    debug,
    debugTag: "v2_seg_roles",
  });
  if (!segment4?.ok) return { ok: false, reason: segment4.reason || "ai_failed", debugPath: segment4.debugPath };

  const segment5 = await generateAllBatchV2Segment({
    apiKey,
    baseUrl,
    model,
    input: { page_payload: aspectsPayload },
    outputShape: SHAPE_ASPECTS,
    template: BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ASPECTS,
    retryNote: "出力は厳密なJSONのみ。末尾カンマ禁止。ダブルクォートのみ。",
    debug,
    debugTag: "v2_seg_aspects",
  });
  if (!segment5?.ok) return { ok: false, reason: segment5.reason || "ai_failed", debugPath: segment5.debugPath };

  const segment6 = await generateAllBatchV2Segment({
    apiKey,
    baseUrl,
    model,
    input: { page_payload: closingPayload },
    outputShape: SHAPE_CLOSING,
    template: BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CLOSING,
    retryNote: "出力は厳密なJSONのみ。末尾カンマ禁止。ダブルクォートのみ。",
    debug,
    debugTag: "v2_seg_closing",
  });
  if (!segment6?.ok) return { ok: false, reason: segment6.reason || "ai_failed", debugPath: segment6.debugPath };

  const source = {
    ...(segment1.data || {}),
    ...(segment2.data || {}),
    ...(segment3.data || {}),
    ...(segment4.data || {}),
    ...(segment5.data || {}),
    ...(segment6.data || {}),
  };
  const dashboard = source?.dashboard || {};
  const planetRoles = source?.planet_roles || {};
  const systemLayers = source?.system_layers || {};
  const deepAxis = source?.deep_axis || {};
  const angles = source?.angles || {};
  const aspectMap = normalizeAspectMapRows(source?.aspect_map);

  const data = {
    version: "blueprint_light_v2",
    core_tagline: applyLimits(source?.core_tagline || "", LIMITS_V2.core.tagline),
    core_snapshot: applyLimits(source?.core_snapshot || "", LIMITS_V2.core.snapshot),
    dashboard: {
      element_balance: applyLimits(dashboard?.element_balance || "", LIMITS_V2.map.element_balance),
      modality_balance: applyLimits(dashboard?.modality_balance || "", LIMITS_V2.map.modality_balance),
      dominant_signs: applyLimits(dashboard?.dominant_signs || "", LIMITS_V2.map.dominant_signs),
      dominant_houses: applyLimits(dashboard?.dominant_houses || "", LIMITS_V2.map.dominant_houses),
      planet_distribution: applyLimits(dashboard?.planet_distribution || "", LIMITS_V2.map.planet_distribution),
      energy_flow: applyLimits(dashboard?.energy_flow || "", LIMITS_V2.map.energy_flow),
      star_overview: applyLimits(
        dashboard?.star_overview || dashboard?.star_structure || dashboard?.cosmic_structure || "",
        LIMITS_V2.map.star_overview
      ),
    },
    planet_roles: {
      sun: applyLimits(planetRoles?.sun || "", LIMITS_V2.roles.planet),
      moon: applyLimits(planetRoles?.moon || "", LIMITS_V2.roles.planet),
      mercury: applyLimits(planetRoles?.mercury || "", LIMITS_V2.roles.planet),
      venus: applyLimits(planetRoles?.venus || "", LIMITS_V2.roles.planet),
      mars: applyLimits(planetRoles?.mars || "", LIMITS_V2.roles.planet),
      jupiter: applyLimits(planetRoles?.jupiter || "", LIMITS_V2.roles.planet),
      saturn: applyLimits(planetRoles?.saturn || "", LIMITS_V2.roles.planet),
      uranus: applyLimits(planetRoles?.uranus || "", LIMITS_V2.roles.planet),
      neptune: applyLimits(planetRoles?.neptune || "", LIMITS_V2.roles.planet),
      pluto: applyLimits(planetRoles?.pluto || "", LIMITS_V2.roles.planet),
    },
    system_layers: {
      core: applyLimits(systemLayers?.core || "", LIMITS_V2.roles.layer),
      personal: applyLimits(systemLayers?.personal || "", LIMITS_V2.roles.layer),
      collective: applyLimits(systemLayers?.collective || "", LIMITS_V2.roles.layer),
      flow: applyLimits(systemLayers?.flow || "", LIMITS_V2.roles.layer_flow),
    },
    deep_axis: {
      nodes_north: applyLimits(
        deepAxis?.nodes_north || deepAxis?.deep_nodes_north || deepAxis?.north || "",
        LIMITS_V2.roles.deep_nodes_north
      ),
      nodes_south: applyLimits(
        deepAxis?.nodes_south || deepAxis?.deep_nodes_south || deepAxis?.south || "",
        LIMITS_V2.roles.deep_nodes_south
      ),
      chiron: applyLimits(deepAxis?.chiron || "", LIMITS_V2.roles.deep_chiron),
      lilith: applyLimits(deepAxis?.lilith || "", LIMITS_V2.roles.deep_lilith),
      deep_pattern: applyLimits(
        deepAxis?.deep_pattern || deepAxis?.pattern || "",
        LIMITS_V2.roles.deep_pattern
      ),
    },
    angles: {
      intro: applyLimits(angles?.intro || "", LIMITS_V2.roles.angle_intro),
      asc: applyLimits(angles?.asc || "", LIMITS_V2.roles.angle),
      mc: applyLimits(angles?.mc || "", LIMITS_V2.roles.angle),
      ic: applyLimits(angles?.ic || "", LIMITS_V2.roles.angle),
      dc: applyLimits(angles?.dc || "", LIMITS_V2.roles.angle),
      axis_structure: applyLimits(
        angles?.axis_structure || angles?.axis_summary || "",
        LIMITS_V2.roles.axis_structure
      ),
    },
    aspect_map: aspectMap.slice(0, 5).reduce((acc, row, idx) => {
      const key = String(row?.key || `aspect_${idx + 1}`).trim();
      acc[key] = {
        type: row?.type || "",
        text: normalizeV2AspectText(row?.text || "", LIMITS_V2),
      };
      return acc;
    }, {}),
    pattern_name: applyLimits(source?.pattern_name || "", LIMITS_V2.closing.pattern_name),
    driving_force: applyLimits(
      source?.driving_force || source?.star_focus || source?.cosmic_focus || "",
      LIMITS_V2.core.driving_force
    ),
    star_signature: applyLimits(
      source?.star_signature || source?.cosmic_signature || "",
      LIMITS_V2.core.star_signature
    ),
    chart_pattern: applyLimits(source?.chart_pattern || "", LIMITS_V2.closing.chart_pattern),
    structural_flow: applyLimits(
      source?.structural_flow || source?.life_direction || "",
      LIMITS_V2.closing.structural_flow
    ),
    natal_observation: applyLimits(source?.natal_observation || "", LIMITS_V2.obs.natal_observation),
    closing_summary: applyLimits(source?.closing_summary || "", LIMITS_V2.closing.closing_summary),
  };
  data.master_chart = masterChart;
  if (masterChart?.angular_planets) {
    data.angular_planets = masterChart.angular_planets;
  }

  const warnings = collectV2ValidationIssues(source);
  const warnOut = {};
  if (warnings?.tooShort?.length) warnOut.tooShort = warnings.tooShort;
  if (typeof warnings?.aspectCount === "number" && warnings.aspectCount < 3) {
    warnOut.aspectCount = warnings.aspectCount;
  }

  return {
    ok: true,
    data,
    warnings: Object.keys(warnOut).length ? warnOut : undefined,
    master_path: masterPath,
  };
}

module.exports = {
  generateBlueprintLightTextV2,
  generateAllBatchV2Segment,
  applyLimits,
  applyLimitsOverride,
  buildAllBatchPromptV2,
};
