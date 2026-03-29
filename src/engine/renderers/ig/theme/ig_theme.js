"use strict";

const { mixColor } = require("../color_utils");

const DEFAULT_COLORS = {
  bgDeep: "#0B0E1A",
  bg: "#14162B",
  textMain: "#FFFFFF",
  textSub: "#B9BDD9",
  textDim: "#8D92B5",
  accentBlue: "#A9C6FF",
  accentGold: "#D7C8A5",
  line: "#2A2D4A",
};

const TEXT_BASE = {
  title: "#FFFFFF",
  subtitle: "#DDE3F4",
  body: "#E8ECF7",
  meta: "#AEB7CC",
  rule: "#7E88A8",
};

const BODY_GLOW_COLORS = {
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
};

function resolveTextTheme(space) {
  const palette = space?.todayPalette || space?.theme?.todayPalette || null;
  const textTint = palette?.textTint || palette?.glowColor || palette?.gasColorA || TEXT_BASE.subtitle;
  const subTextTint = palette?.subTextTint || palette?.gasColorB || palette?.dustTint || TEXT_BASE.meta;
  return {
    title: {
      fill: mixColor(TEXT_BASE.title, textTint, 0.06),
      opacity: 0.98,
    },
    subtitle: {
      fill: mixColor(TEXT_BASE.subtitle, subTextTint, 0.12),
      opacity: 0.82,
    },
    body: {
      fill: mixColor(TEXT_BASE.body, subTextTint, 0.08),
      opacity: 0.9,
    },
    meta: {
      fill: mixColor(TEXT_BASE.meta, subTextTint, 0.18),
      opacity: 0.74,
    },
    rule: {
      stroke: mixColor(TEXT_BASE.rule, subTextTint, 0.22),
      opacity: 0.28,
    },
  };
}

function resolveColors(space) {
  const textTheme = resolveTextTheme(space);
  return {
    ...DEFAULT_COLORS,
    textMain: textTheme.title.fill,
    textSub: textTheme.subtitle.fill,
    textDim: textTheme.meta.fill,
    line: textTheme.rule.stroke,
    textTheme,
  };
}

module.exports = {
  DEFAULT_COLORS,
  BODY_GLOW_COLORS,
  resolveTextTheme,
  resolveColors,
};
