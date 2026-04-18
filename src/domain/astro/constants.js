"use strict";

const CORE_PLANETS = Object.freeze([
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
]);

const MINOR_BODIES = Object.freeze([
  "lilith",
  "chiron",
]);

const NODAL_BODIES = Object.freeze([
  "north_node",
  "south_node",
]);

const EXTENDED_PLANETS = Object.freeze([
  ...CORE_PLANETS,
  ...MINOR_BODIES,
]);

const PUBLIC_BODIES = CORE_PLANETS;
const CORE_BODIES = CORE_PLANETS;
const EXTENDED_BODIES = EXTENDED_PLANETS;
const INTERPRETATION_EXTRA_BODIES = Object.freeze([
  ...MINOR_BODIES,
  ...NODAL_BODIES,
]);

const RELATION_EXTRA_BODIES = Object.freeze([
  ...NODAL_BODIES,
  ...MINOR_BODIES,
]);

// Legacy alias. Prefer MINOR_BODIES for lilith/chiron-only semantics.
const DEEP_BODIES = MINOR_BODIES;

const PERSONAL_PLANETS = Object.freeze([
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
]);

const SOCIAL_PLANETS = Object.freeze([
  "jupiter",
  "saturn",
]);

const OUTER_PLANETS = Object.freeze([
  "uranus",
  "neptune",
  "pluto",
]);

module.exports = {
  CORE_BODIES,
  CORE_PLANETS,
  EXTENDED_BODIES,
  EXTENDED_PLANETS,
  DEEP_BODIES,
  INTERPRETATION_EXTRA_BODIES,
  MINOR_BODIES,
  NODAL_BODIES,
  PERSONAL_PLANETS,
  PUBLIC_BODIES,
  RELATION_EXTRA_BODIES,
  SOCIAL_PLANETS,
  OUTER_PLANETS,
};
