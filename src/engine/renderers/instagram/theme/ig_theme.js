"use strict";

const { mixColor } = require("../color_utils");
const { DEFAULT_COLORS, TEXT_BASE, BODY_GLOW_COLORS } = require("../tokens/common/colors");

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
