"use strict";

const { buildSpaceBackground } = require("./render");
const { DEFAULT_MOON_LAYOUT } = require("./constants");
const { computeSpaceTheme, pickPalette, pickBaseColor, pickMistColor, pickOpacityScale } = require("./theme");
const { buildSpaceSeedLabel } = require("./seed");
const { buildUnderlayLayer } = require("./underlay");
const {
  UNDERLAY_PRESETS,
  COSMIC_PRESETS,
  resolveUnderlayPreset,
  resolveCosmicPreset,
  buildCosmicSpaceConfig,
  applySpaceConfigBoost,
} = require("./presets");
const {
  ELEMENT_BASE_COLORS,
  ELEMENT_PALETTES,
  ELEMENT_MIST_COLORS,
  ELEMENT_OPACITY_SCALE,
} = require("./constants");

module.exports = {
  buildSpaceBackground,
  DEFAULT_MOON_LAYOUT,
  buildSpaceSeedLabel,
  buildUnderlayLayer,
  UNDERLAY_PRESETS,
  COSMIC_PRESETS,
  resolveUnderlayPreset,
  resolveCosmicPreset,
  buildCosmicSpaceConfig,
  applySpaceConfigBoost,
  __test: {
    computeSpaceTheme,
    pickPalette,
    pickBaseColor,
    ELEMENT_BASE_COLORS,
    ELEMENT_PALETTES,
    ELEMENT_MIST_COLORS,
    pickMistColor,
    ELEMENT_OPACITY_SCALE,
    pickOpacityScale,
  },
};
