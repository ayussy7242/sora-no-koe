"use strict";

/**
 * SSOT for AI text limits.
 * Includes blueprint v2 limits and relation prompt sentence limits.
 */
const LIMITS_V2 = Object.freeze({
  core: {
    star_drive: { min: 25, max: 45, minSentences: 1, maxSentences: 2 },
    star_signature: { min: 150, max: 180, minSentences: 3, maxSentences: 4 },
  },
  map: {
    element_balance: { min: 140, max: 220, minSentences: 2, maxSentences: 4 },
    modality_balance: { min: 140, max: 220, minSentences: 2, maxSentences: 4 },
    dominant_signs: { min: 50, max: 100, minSentences: 1, maxSentences: 3 },
    dominant_houses: { min: 50, max: 90, minSentences: 1, maxSentences: 3 },
    planet_distribution: { min: 90, max: 140, minSentences: 2, maxSentences: 4 },
    energy_flow: { min: 110, max: 130, minSentences: 2, maxSentences: 2 },
  },
  obs: {
    natal_observation: { min: 230, max: 260, minSentences: 5, maxSentences: 5 },
  },
  roles: {
    planet: { min: 150, max: 170, minSentences: 4, maxSentences: 4 },
    layer: { min: 140, max: 160, minSentences: 3, maxSentences: 3 },
    deep_nodes_north: { min: 140, max: 160, minSentences: 4, maxSentences: 4 },
    deep_nodes_south: { min: 140, max: 160, minSentences: 4, maxSentences: 4 },
    deep_chiron: { min: 140, max: 160, minSentences: 4, maxSentences: 4 },
    deep_lilith: { min: 140, max: 160, minSentences: 4, maxSentences: 4 },
    angle: { min: 150, max: 170, minSentences: 4, maxSentences: 4 },
  },
  aspects: {
    item: { min: 80, max: 100, minSentences: 2, maxSentences: 3 },
  },
  closing: {
    pattern_name: { min: 8, max: 18, minSentences: 1, maxSentences: 1 },
    closing_summary: { min: 300, max: 360, minSentences: 4, maxSentences: 5 },
  },
});

const RELATION_PROMPT_LIMITS = Object.freeze({
  relation_center: { sentences: 3 },
  relation_center_overlap: { sentences: 1 },
  relation_center_direction: { sentences: 1 },
  relation_center_separation: { sentences: 1 },
  relation_center_flow: { sentences: 1 },
  relation_center_summary: { sentences: 1 },
  element_modality_text: { sentences: 3 },
  relation_type_text: { sentences: 4 },
  house_ingress_lines: { sentences: 0 },
  house_ingress_summary: { sentences: 1 },
  sign_facing: { sentences: 2 },
  sign_facing_rows: { sentences: 0 },
  relation_core: { sentences: 3 },
  flow_text: { sentences: 2 },
  friction_text: { sentences: 2 },
  axis_text: { sentences: 2 },
  deep_text: { sentences: 2 },
  personal_text: { sentences: 2 },
  social_text: { sentences: 2 },
  transpersonal_text: { sentences: 2 },
  axis_compare_text: { sentences: 2 },
  deep_compare_text: { sentences: 2 },
  comm_text: { sentences: 2 },
  attraction_text: { sentences: 2 },
  relation_pattern: { sentences: 3 },
});

module.exports = {
  LIMITS_V2,
  RELATION_PROMPT_LIMITS,
};
