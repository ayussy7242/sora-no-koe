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

const EXTENDED_PLANETS = Object.freeze([
  ...CORE_PLANETS,
  "lilith",
  "chiron",
]);

const DEEP_BODIES = Object.freeze([
  "lilith",
  "chiron",
]);

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
  CORE_PLANETS,
  EXTENDED_PLANETS,
  DEEP_BODIES,
  PERSONAL_PLANETS,
  SOCIAL_PLANETS,
  OUTER_PLANETS,
};
