"use strict";

const {
  RELATION_SEGMENT_PROMPT_CENTER,
  RELATION_SEGMENT_PROMPT_CENTER_OVERLAP,
  RELATION_SEGMENT_PROMPT_CENTER_DIRECTION,
  RELATION_SEGMENT_PROMPT_CENTER_SEPARATION,
  RELATION_SEGMENT_PROMPT_CENTER_FLOW,
  RELATION_SEGMENT_PROMPT_CENTER_SUMMARY,
  RELATION_SEGMENT_PROMPT_SIGN_FACING,
  RELATION_SEGMENT_PROMPT_SIGN_FACING_ROWS,
  RELATION_SEGMENT_PROMPT_CORE,
  RELATION_SEGMENT_PROMPT_FLOW,
  RELATION_SEGMENT_PROMPT_FRICTION,
  RELATION_SEGMENT_PROMPT_COMM,
  RELATION_SEGMENT_PROMPT_ATTRACTION,
  RELATION_SEGMENT_PROMPT_AXIS,
  RELATION_SEGMENT_PROMPT_DEEP,
  RELATION_SEGMENT_PROMPT_PERSONAL,
  RELATION_SEGMENT_PROMPT_SOCIAL,
  RELATION_SEGMENT_PROMPT_TRANSPERSONAL,
  RELATION_SEGMENT_PROMPT_AXIS_COMPARE,
  RELATION_SEGMENT_PROMPT_DEEP_COMPARE,
  RELATION_SEGMENT_PROMPT_HOUSE_INGRESS_LINES,
  RELATION_SEGMENT_PROMPT_HOUSE_INGRESS_SUMMARY,
  RELATION_SEGMENT_PROMPT_ELEMENT_MODE,
  RELATION_SEGMENT_PROMPT_RELATION_TYPE,
  RELATION_SEGMENT_PROMPT_PATTERN,
} = require("../../../content/prompts/pdf/relation");
const { PROMPT_LIMITS } = require("./generation/limits");

const SIGN_ORDER = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
];

const SIGN_ELEMENT = {
  aries: "fire",
  taurus: "earth",
  gemini: "air",
  cancer: "water",
  leo: "fire",
  virgo: "earth",
  libra: "air",
  scorpio: "water",
  sagittarius: "fire",
  capricorn: "earth",
  aquarius: "air",
  pisces: "water",
};

function angleDistance(a, b) {
  const aNum = Number(a);
  const bNum = Number(b);
  if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) return null;
  const diff = Math.abs(aNum - bNum) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function signRelationType(aSignKey, bSignKey) {
  if (!aSignKey || !bSignKey) return "other";
  if (aSignKey === bSignKey) return "same_sign";
  const aIdx = SIGN_ORDER.indexOf(aSignKey);
  const bIdx = SIGN_ORDER.indexOf(bSignKey);
  if (aIdx < 0 || bIdx < 0) return "other";
  const delta = Math.abs(aIdx - bIdx);
  const steps = Math.min(delta, 12 - delta);
  if (steps === 6) return "opposite_sign";
  const aElem = SIGN_ELEMENT[aSignKey];
  const bElem = SIGN_ELEMENT[bSignKey];
  if (aElem && bElem && aElem === bElem) return "same_element";
  const squarePairs = new Set(["fire_water", "water_fire", "earth_air", "air_earth"]);
  if (aElem && bElem && squarePairs.has(`${aElem}_${bElem}`)) return "square_element";
  if (steps === 5) return "quincunx_like";
  if (steps === 1) return "adjacent";
  return "other";
}

function buildComparePairs({ aPlanets = [], bPlanets = [], connections = [] } = {}) {
  const aMap = new Map(aPlanets.map((p) => [p?.body_key, p]));
  const bMap = new Map(bPlanets.map((p) => [p?.body_key, p]));
  const compareKeys = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "asc", "mc", "north_node"];
  const out = [];

  compareKeys.forEach((key) => {
    const a = aMap.get(key);
    const b = bMap.get(key);
    if (!a || !b) return;
    const conn = connections.find((c) => c?.a?.body_key === key && c?.b?.body_key === key);
    const dist = angleDistance(a?.lon_deg, b?.lon_deg);
    const relation = signRelationType(a?.sign_key, b?.sign_key);
    out.push({
      body_key: key,
      body_ja: a?.body_ja || b?.body_ja || key,
      a_sign: a?.sign_ja || a?.sign_key || "",
      b_sign: b?.sign_ja || b?.sign_key || "",
      relation_type: relation,
      distance_deg: dist,
      aspect: conn?.aspect || null,
      orb: conn?.orb ?? null,
    });
  });

  return out;
}

function buildRelationCounts(comparePairs = []) {
  return comparePairs.reduce((acc, row) => {
    const key = row?.relation_type || "other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildRelationAiInputs({
  relation_center,
  relation_core,
  relation_pattern,
  pattern_evidence,
  a_center,
  b_center,
  element_modality,
  sign_facing,
  relation_counts,
  core_links,
  flow,
  friction,
  axis,
  deep,
  personal,
  social,
  transpersonal,
  axis_compare,
  deep_compare,
  comm,
  attraction,
  house_ingress_a,
  house_ingress_b,
} = {}) {
  return {
    relation_center: {
      prompt: RELATION_SEGMENT_PROMPT_CENTER,
      limits: PROMPT_LIMITS.relation_center,
      input: {
        a_center,
        b_center,
        relation_center,
      },
    },
    relation_center_overlap: {
      prompt: RELATION_SEGMENT_PROMPT_CENTER_OVERLAP,
      limits: PROMPT_LIMITS.relation_center_overlap,
      input: {
        overlap_band: relation_center?.overlap_band || "",
        shared_sign_label: relation_center?.shared_sign_label || "",
        shared_house_cluster: relation_center?.shared_house_cluster || "",
      },
    },
    relation_center_direction: {
      prompt: RELATION_SEGMENT_PROMPT_CENTER_DIRECTION,
      limits: PROMPT_LIMITS.relation_center_direction,
      input: {
        direction_vector: relation_center?.direction_vector || "",
        separation_band: relation_center?.separation_band || "",
      },
    },
    relation_center_separation: {
      prompt: RELATION_SEGMENT_PROMPT_CENTER_SEPARATION,
      limits: PROMPT_LIMITS.relation_center_separation,
      input: {
        separation_band: relation_center?.separation_band || "",
        separation_label: relation_center?.direction_vector || "",
      },
    },
    relation_center_flow: {
      prompt: RELATION_SEGMENT_PROMPT_CENTER_FLOW,
      limits: PROMPT_LIMITS.relation_center_flow,
      input: {
        flow_band: relation_center?.flow_band || "",
        flow_label: relation_center?.direction_vector || "",
      },
    },
    relation_center_summary: {
      prompt: RELATION_SEGMENT_PROMPT_CENTER_SUMMARY,
      limits: PROMPT_LIMITS.relation_center_summary,
      input: {
        overlap_band: relation_center?.overlap_band || "",
        separation_band: relation_center?.separation_band || "",
        flow_band: relation_center?.flow_band || "",
        direction_vector: relation_center?.direction_vector || "",
      },
    },
    element_modality_text: {
      prompt: RELATION_SEGMENT_PROMPT_ELEMENT_MODE,
      limits: PROMPT_LIMITS.element_modality_text,
      input: {
        element_modality: element_modality || {},
      },
    },
    relation_type_text: {
      prompt: RELATION_SEGMENT_PROMPT_RELATION_TYPE,
      limits: PROMPT_LIMITS.relation_type_text,
      input: {
        relation_pattern,
        relation_center,
        relation_core,
        pattern_evidence,
      },
    },
    house_ingress_a_lines: {
      prompt: RELATION_SEGMENT_PROMPT_HOUSE_INGRESS_LINES,
      limits: PROMPT_LIMITS.house_ingress_lines,
      input: house_ingress_a || {},
    },
    house_ingress_a_summary: {
      prompt: RELATION_SEGMENT_PROMPT_HOUSE_INGRESS_SUMMARY,
      limits: PROMPT_LIMITS.house_ingress_summary,
      input: house_ingress_a || {},
    },
    house_ingress_b_lines: {
      prompt: RELATION_SEGMENT_PROMPT_HOUSE_INGRESS_LINES,
      limits: PROMPT_LIMITS.house_ingress_lines,
      input: house_ingress_b || {},
    },
    house_ingress_b_summary: {
      prompt: RELATION_SEGMENT_PROMPT_HOUSE_INGRESS_SUMMARY,
      limits: PROMPT_LIMITS.house_ingress_summary,
      input: house_ingress_b || {},
    },
    sign_facing: {
      prompt: RELATION_SEGMENT_PROMPT_SIGN_FACING,
      limits: PROMPT_LIMITS.sign_facing,
      input: {
        sign_facing,
        relation_counts,
      },
    },
    sign_facing_rows: {
      prompt: RELATION_SEGMENT_PROMPT_SIGN_FACING_ROWS,
      limits: PROMPT_LIMITS.sign_facing_rows,
      input: {
        sign_facing,
      },
    },
    relation_core: {
      prompt: RELATION_SEGMENT_PROMPT_CORE,
      limits: PROMPT_LIMITS.relation_core,
      input: {
        relation_core,
        core_links,
        relation_center: {
          direction_vector: relation_center?.direction_vector || "",
          overlap_band: relation_center?.overlap_band || "",
          separation_band: relation_center?.separation_band || "",
        },
      },
    },
    flow_text: {
      prompt: RELATION_SEGMENT_PROMPT_FLOW,
      limits: PROMPT_LIMITS.flow_text,
      input: { flow },
    },
    friction_text: {
      prompt: RELATION_SEGMENT_PROMPT_FRICTION,
      limits: PROMPT_LIMITS.friction_text,
      input: { friction },
    },
    axis_text: {
      prompt: RELATION_SEGMENT_PROMPT_AXIS,
      limits: PROMPT_LIMITS.axis_text,
      input: { axis },
    },
    deep_text: {
      prompt: RELATION_SEGMENT_PROMPT_DEEP,
      limits: PROMPT_LIMITS.deep_text,
      input: { deep },
    },
    personal_text: {
      prompt: RELATION_SEGMENT_PROMPT_PERSONAL,
      limits: PROMPT_LIMITS.personal_text,
      input: { personal },
    },
    social_text: {
      prompt: RELATION_SEGMENT_PROMPT_SOCIAL,
      limits: PROMPT_LIMITS.social_text,
      input: { social },
    },
    transpersonal_text: {
      prompt: RELATION_SEGMENT_PROMPT_TRANSPERSONAL,
      limits: PROMPT_LIMITS.transpersonal_text,
      input: { transpersonal },
    },
    axis_compare_text: {
      prompt: RELATION_SEGMENT_PROMPT_AXIS_COMPARE,
      limits: PROMPT_LIMITS.axis_compare_text,
      input: { axis_compare },
    },
    deep_compare_text: {
      prompt: RELATION_SEGMENT_PROMPT_DEEP_COMPARE,
      limits: PROMPT_LIMITS.deep_compare_text,
      input: { deep_compare },
    },
    comm_text: {
      prompt: RELATION_SEGMENT_PROMPT_COMM,
      limits: PROMPT_LIMITS.comm_text,
      input: { comm },
    },
    attraction_text: {
      prompt: RELATION_SEGMENT_PROMPT_ATTRACTION,
      limits: PROMPT_LIMITS.attraction_text,
      input: { attraction },
    },
    relation_pattern: {
      prompt: RELATION_SEGMENT_PROMPT_PATTERN,
      limits: PROMPT_LIMITS.relation_pattern,
      input: {
        relation_pattern,
        relation_center,
        relation_core,
        pattern_evidence,
      },
    },
  };
}

module.exports = {
  buildComparePairs,
  buildRelationCounts,
  buildRelationAiInputs,
};
