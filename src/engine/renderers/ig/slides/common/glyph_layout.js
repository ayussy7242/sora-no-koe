"use strict";

const { createGlyphLayout, PATH_GLYPHS } = require("../../layout/ig_layout");
const { FONT_FILES, resolveFontPath } = require("../../assets/ig_fonts");

const glyphLayout = createGlyphLayout({ resolveFontPath, FONT_FILES });

module.exports = {
  PATH_GLYPHS,
  ...glyphLayout,
};
