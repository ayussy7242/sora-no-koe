"use strict";

const MODELS = Object.freeze({
  EQUAL_CIRCLES: "equal_circles",
  VARIABLE_SHADOW_RADIUS: "variable_shadow_radius",
  CUSTOM_TERMINATOR: "custom_terminator",
  KEYFRAMED_MOON: "keyframed_moon",
  ELLIPTICAL_TERMINATOR: "elliptical_terminator",
  INTERSECTION_FIXED: "intersection_fixed",
  AGE_BUCKETS: "age_buckets",
});

const DEFAULT_GEOMETRY_OPTIONS = Object.freeze({
  model: MODELS.AGE_BUCKETS,
  halfRange: 0.06,
  maxBoost: 0.1,
  bendMax: 0.5,
  bendEasePower: 1.25,
  c1: 0.33,
  c2: 0.67,
  halfEps: 1e-6,
  fullEps: 1e-6,
  newEps: 1e-6,
});

module.exports = {
  MODELS,
  DEFAULT_GEOMETRY_OPTIONS,
};
