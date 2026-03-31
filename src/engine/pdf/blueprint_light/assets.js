"use strict";

const fs = require("fs");
const path = require("path");
const { FONT_FILES: SSOT_FONTS } = require("../../shared/typography");

const COLORS = Object.freeze({
  coverBg: "#14162B",
  subBg: "#1C1F3A",
  textMainDark: "#14162B",
  textMainLight: "#EDEEFF",
  textSub: "#B9BDD9",
  logoWhite: "#FFFFFF",
  border: "rgba(237,238,255,0.25)",
});

const ASSET_ROOT = path.resolve(process.cwd(), "assets");
const FONT_DIR = path.join(ASSET_ROOT, "fonts");
const LOGO_SHAPE_PATH = path.join(ASSET_ROOT, "img", "logo", "sora-no-koe-logo.jpg");
const SYMBOLS_FONT_PRIMARY_PATH = path.resolve(
  process.cwd(),
  "assets",
  "fonts",
  SSOT_FONTS.symbols.primary
);
const SYMBOLS_FONT_SECONDARY_PATH = path.resolve(
  process.cwd(),
  "assets",
  "fonts",
  SSOT_FONTS.symbols.secondary
);
const SYMBOLS_FONT_TERTIARY_PATH = path.resolve(
  process.cwd(),
  "assets",
  "fonts",
  SSOT_FONTS.symbols.tertiary
);

const FONT_FILES = Object.freeze({
  title: path.join(FONT_DIR, SSOT_FONTS.main.medium),
  body: path.join(FONT_DIR, SSOT_FONTS.body.pdf.regular),
  bold: path.join(FONT_DIR, SSOT_FONTS.body.pdf.bold),
  note: path.join(FONT_DIR, SSOT_FONTS.soft.regular),
  noteBold: path.join(FONT_DIR, SSOT_FONTS.soft.semiBold),
  symbolsPrimary: SYMBOLS_FONT_PRIMARY_PATH,
  symbolsSecondary: SYMBOLS_FONT_SECONDARY_PATH,
  symbolsTertiary: SYMBOLS_FONT_TERTIARY_PATH,
});

function safeExists(p) {
  try {
    return fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function registerFonts(doc) {
  for (const [key, fp] of Object.entries(FONT_FILES)) {
    if (safeExists(fp)) {
      try {
        doc.registerFont(key, fp);
      } catch (_) {
        // ignore
      }
    }
  }
}

module.exports = {
  COLORS,
  ASSET_ROOT,
  FONT_DIR,
  LOGO_SHAPE_PATH,
  SYMBOLS_FONT_PRIMARY_PATH,
  SYMBOLS_FONT_SECONDARY_PATH,
  SYMBOLS_FONT_TERTIARY_PATH,
  FONT_FILES,
  safeExists,
  registerFonts,
};
