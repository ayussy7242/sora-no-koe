"use strict";

/**
 * SSOT for v2 length/sentence limits.
 * If prompt length changes do not reflect in output, update here.
 * Used by validators and orchestrator applyLimits.
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

module.exports = {
  LIMITS_V2,
};
