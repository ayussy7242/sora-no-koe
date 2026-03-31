"use strict";

const DEFAULT_COLORS = Object.freeze({
  bgDeep: "#0B0E1A",
  bg: "#14162B",
  textMain: "#FFFFFF",
  textSub: "#B9BDD9",
  textDim: "#8D92B5",
  accentBlue: "#A9C6FF",
  accentGold: "#D7C8A5",
  line: "#2A2D4A",
});

const TEXT_BASE = Object.freeze({
  title: "#FFFFFF",
  subtitle: "#DDE3F4",
  body: "#E8ECF7",
  meta: "#AEB7CC",
  rule: "#7E88A8",
});

const BODY_GLOW_COLORS = Object.freeze({
  sun: "#FFD8A6",
  moon: "#E5ECFF",
  mercury: "#CDEBFF",
  venus: "#F4C3D6",
  mars: "#FF7A6A",
  jupiter: "#F5D39B",
  saturn: "#7E8CA8",
  uranus: "#78E1FF",
  neptune: "#8C8CFF",
  pluto: "#5B4A7A",
  chiron: "#D7C8FF",
  lilith: "#7E6A88",
});

const IG_COLOR_TOKENS = Object.freeze({
  DEFAULT_COLORS,
  TEXT_BASE,
  BODY_GLOW_COLORS,
});

module.exports = {
  IG_COLOR_TOKENS,
  DEFAULT_COLORS,
  TEXT_BASE,
  BODY_GLOW_COLORS,
};
