"use strict";

const fontkit = require("fontkit");
const {
  SYMBOLS_FONT_PRIMARY_PATH,
  SYMBOLS_FONT_SECONDARY_PATH,
  SYMBOLS_FONT_TERTIARY_PATH,
  safeExists,
} = require("./assets");

const ASTRO_GLYPHS = [
  "☉",
  "☽",
  "☿",
  "♀",
  "♂",
  "♃",
  "♄",
  "♅",
  "♆",
  "♇",
  "⚷",
  "⚸",
  "☊",
  "☋",
  "✶",
  "✷",
  "✹",
  "✦",
  "☍",
  "☌",
  "△",
];

function loadFontKitFont(fontPath) {
  try {
    return fontkit.openSync(fontPath);
  } catch (_) {
    return null;
  }
}

function hasGlyph(font, glyph) {
  if (!font || !glyph) return false;
  const codePoint = glyph.codePointAt(0);
  if (!codePoint) return false;
  if (typeof font.hasGlyphForCodePoint !== "function") return false;
  return font.hasGlyphForCodePoint(codePoint);
}

function pickSymbolFontName(doc, glyph) {
  const picker = doc._symbolFontPicker;
  const picked = typeof picker === "function" ? picker(glyph) : doc._symbolFontName;
  if (!picked) {
    throw new Error(`symbol glyph missing: ${glyph}`);
  }
  return picked;
}

function initSymbolFonts(doc) {
  const symbolsPrimaryExists = safeExists(SYMBOLS_FONT_PRIMARY_PATH);
  const symbolsSecondaryExists = safeExists(SYMBOLS_FONT_SECONDARY_PATH);
  const symbolsTertiaryExists = safeExists(SYMBOLS_FONT_TERTIARY_PATH);
  if (!symbolsPrimaryExists && !symbolsSecondaryExists && !symbolsTertiaryExists) {
    throw new Error(`symbols font missing: ${SYMBOLS_FONT_PRIMARY_PATH}`);
  }

  const symbolFonts = [];
  if (symbolsPrimaryExists) {
    const font = loadFontKitFont(SYMBOLS_FONT_PRIMARY_PATH);
    symbolFonts.push({ name: "symbolsPrimary", font });
  }
  if (symbolsSecondaryExists) {
    const font = loadFontKitFont(SYMBOLS_FONT_SECONDARY_PATH);
    symbolFonts.push({ name: "symbolsSecondary", font });
  }
  if (symbolsTertiaryExists) {
    const font = loadFontKitFont(SYMBOLS_FONT_TERTIARY_PATH);
    symbolFonts.push({ name: "symbolsTertiary", font });
  }

  doc._symbolFontPicker = (glyph) => {
    for (const entry of symbolFonts) {
      if (hasGlyph(entry.font, glyph)) return entry.name;
    }
    return null;
  };

  doc._symbolUniversalFontName =
    symbolFonts.find((entry) => entry.name === "symbolsTertiary" && entry.font)?.name ||
    symbolFonts.find((entry) => entry.font && ASTRO_GLYPHS.every((g) => hasGlyph(entry.font, g)))?.name ||
    null;

  const missingSymbols = ASTRO_GLYPHS.filter((g) => !doc._symbolFontPicker(g));
  if (missingSymbols.length) {
    throw new Error(`symbols glyph missing: ${missingSymbols.join("")}`);
  }

  return { symbolFonts, missingSymbols };
}

module.exports = {
  ASTRO_GLYPHS,
  pickSymbolFontName,
  loadFontKitFont,
  hasGlyph,
  initSymbolFonts,
};
