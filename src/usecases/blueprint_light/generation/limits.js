"use strict";

/**
 * SSOT for v2 length/sentence limits.
 * If prompt length changes do not reflect in output, update here.
 * Used by validators and orchestrator applyLimits.
 */
const LIMITS_V2 = Object.freeze({
  core: {
    tagline: { min: 20, max: 40, minSentences: 1, maxSentences: 1 },
    snapshot: { min: 90, max: 140, minSentences: 2, maxSentences: 3 },
    driving_force: { min: 25, max: 45, minSentences: 1, maxSentences: 2 },
    star_signature: { min: 420, max: 480, minSentences: 5, maxSentences: 6 },
  },
  map: {
    element_balance: { min: 140, max: 220, minSentences: 2, maxSentences: 4 },
    modality_balance: { min: 140, max: 220, minSentences: 2, maxSentences: 4 },
    dominant_signs: { min: 50, max: 100, minSentences: 1, maxSentences: 3 },
    dominant_houses: { min: 50, max: 100, minSentences: 1, maxSentences: 3 },
    planet_distribution: { min: 90, max: 140, minSentences: 2, maxSentences: 4 },
    energy_flow: { min: 120, max: 140, minSentences: 2, maxSentences: 2 },
    star_overview: { min: 120, max: 140, minSentences: 2, maxSentences: 2 },
  },
  obs: {
    natal_observation: { min: 360, max: 400, minSentences: 5, maxSentences: 6 },
  },
  roles: {
    planet: { min: 150, max: 170, minSentences: 4, maxSentences: 4 },
    layer: { min: 120, max: 150, minSentences: 2, maxSentences: 3 },
    layer_flow: { min: 120, max: 150, minSentences: 2, maxSentences: 3 },
    deep_nodes: { min: 150, max: 170, minSentences: 3, maxSentences: 4 },
    deep_chiron: { min: 150, max: 170, minSentences: 4, maxSentences: 4 },
    deep_lilith: { min: 150, max: 170, minSentences: 4, maxSentences: 4 },
    deep_pattern: { min: 120, max: 160, minSentences: 3, maxSentences: 3 },
    angle_intro: { min: 80, max: 120, minSentences: 2, maxSentences: 2 },
    angle: { min: 90, max: 120, minSentences: 2, maxSentences: 2 },
    axis_structure: { min: 360, max: 400, minSentences: 4, maxSentences: 5 },
  },
  aspects: {
    item: { min: 130, max: 150, minSentences: 3, maxSentences: 3 },
  },
  closing: {
    pattern_name: { min: 12, max: 18, minSentences: 1, maxSentences: 1 },
    chart_pattern: { min: 150, max: 200, minSentences: 2, maxSentences: 3 },
    structural_flow: { min: 170, max: 220, minSentences: 2, maxSentences: 3 },
    closing_summary: { min: 200, max: 280, minSentences: 2, maxSentences: 4 },
  },
});

module.exports = {
  LIMITS_V2,
};
