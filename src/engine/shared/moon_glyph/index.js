"use strict";

const { BACKGROUND_COLORS } = require("../space_background/constants");
const { buildMoonGeometry } = require("./geometry");
const { buildMoonAppearance } = require("./appearance");
const { renderMoonGlyph } = require("./renderer");
const { MODELS, DEFAULT_GEOMETRY_OPTIONS } = require("./constants");

function buildMoonPhaseGlyph({
  id,
  x,
  y,
  size = 160,
  illumination = 0.5,
  moonAgeDays = null,
  moonAgeNormalized = null,
  waxing = true,
  lightColor = "rgba(245,245,240,0.95)",
  darkColor = BACKGROUND_COLORS?.bgDeep || "#050816",
  strokeColor = null,
  forceDark = false,
  model = DEFAULT_GEOMETRY_OPTIONS.model,
  geometryOptions = {},
} = {}) {
  const geometry = buildMoonGeometry({
    size,
    illumination,
    waxing,
    model,
    moonAgeDays,
    moonAgeNormalized,
    ...geometryOptions,
  });

  const appearance = buildMoonAppearance({
    id,
    geometry,
    lightColor,
    darkColor,
    strokeColor,
    forceDark,
    withRim: true,
  });

  return renderMoonGlyph({
    x,
    y,
    defs: appearance.defs,
    body: appearance.body,
  });
}

module.exports = {
  buildMoonPhaseGlyph,
  MODELS,
  DEFAULT_GEOMETRY_OPTIONS,
};
