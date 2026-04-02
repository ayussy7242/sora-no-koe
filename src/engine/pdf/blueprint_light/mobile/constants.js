"use strict";

const SPACE = Object.freeze({
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
});

const TYPE = Object.freeze({
  title: 28,
  h1: 20,
  h2: 16,
  body: 14.5,
  meta: 12,
  glyph: 40,
});

const FONT_BUMP = 1;
const bumpFont = (size) => size + FONT_BUMP;

const V25_SCALE = 1.1;
const V25_TITLE_SCALE = 1.2;

module.exports = {
  SPACE,
  TYPE,
  FONT_BUMP,
  bumpFont,
  V25_SCALE,
  V25_TITLE_SCALE,
};
