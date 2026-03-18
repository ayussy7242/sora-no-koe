"use strict";

/**
 * Output JSON shape templates per segment.
 * Used to show the model exact expected schema.
 */
const SHAPE_CORE = `{
  "core_tagline": "...",
  "core_snapshot": "...",
  "driving_force": "...",
  "star_signature": "..."
}`;

const SHAPE_MAP = `{
  "dashboard": {
    "element_balance": "...",
    "modality_balance": "...",
    "dominant_signs": "...",
    "dominant_houses": "...",
    "planet_distribution": "...",
    "energy_flow": "...",
    "star_overview": "..."
  }
}`;

const SHAPE_OBS = `{
  "natal_observation": "..."
}`;

const SHAPE_ROLES = `{
  "planet_roles": {
    "sun": "...",
    "moon": "...",
    "mercury": "...",
    "venus": "...",
    "mars": "...",
    "jupiter": "...",
    "saturn": "...",
    "uranus": "...",
    "neptune": "...",
    "pluto": "..."
  },
  "system_layers": {
    "core": "...",
    "personal": "...",
    "collective": "...",
    "flow": "..."
  },
  "deep_axis": {
    "nodes": "...",
    "chiron": "...",
    "lilith": "...",
    "deep_pattern": "..."
  },
  "angles": {
    "intro": "...",
    "asc": "...",
    "mc": "...",
    "ic": "...",
    "dc": "...",
    "axis_structure": "..."
  }
}`;

const SHAPE_ASPECTS = `{
  "aspect_map": {
    "mars_uranus": { "type": "trine", "text": "..." },
    "venus_uranus": { "type": "opposition", "text": "..." },
    "neptune_pluto": { "type": "sextile", "text": "..." }
  }
}`;

const SHAPE_CLOSING = `{
  "pattern_name": "...",
  "chart_pattern": "...",
  "structural_flow": "...",
  "closing_summary": "..."
}`;

module.exports = Object.freeze({
  SHAPE_CORE,
  SHAPE_MAP,
  SHAPE_OBS,
  SHAPE_ROLES,
  SHAPE_ASPECTS,
  SHAPE_CLOSING,
});
