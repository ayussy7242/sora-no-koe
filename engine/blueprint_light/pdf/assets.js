"use strict";

const fs = require("fs");
const path = require("path");

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
  "NotoSansSymbols-Regular.ttf"
);
const SYMBOLS_FONT_SECONDARY_PATH = path.resolve(
  process.cwd(),
  "assets",
  "fonts",
  "NotoSansSymbols2-Regular.ttf"
);
const SYMBOLS_FONT_TERTIARY_PATH = path.resolve(
  process.cwd(),
  "assets",
  "fonts",
  "Symbola_hint.ttf"
);

const FONT_FILES = Object.freeze({
  title: path.join(FONT_DIR, "ZenKakuGothicNew-Medium.ttf"),
  body: path.join(FONT_DIR, "ShipporiMincho-Regular.ttf"),
  bold: path.join(FONT_DIR, "ShipporiMincho-Bold.ttf"),
  note: path.join(FONT_DIR, "KleeOne-Regular.ttf"),
  noteBold: path.join(FONT_DIR, "KleeOne-SemiBold.ttf"),
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
