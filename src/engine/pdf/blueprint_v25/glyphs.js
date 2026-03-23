"use strict";

const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");

const FONT_DIR = path.resolve(__dirname, "..", "..", "..", "..", "assets", "fonts");
const FONT_CANDIDATES = [
  "NotoSansSymbols2-Regular.ttf",
  "NotoSansSymbols-Regular.ttf",
  "Symbola_hint.ttf",
];

const fontCache = new Map();
const glyphTagCache = new Map();

function loadFont(filename) {
  if (fontCache.has(filename)) return fontCache.get(filename);
  const fp = path.join(FONT_DIR, filename);
  try {
    if (!fs.existsSync(fp)) {
      fontCache.set(filename, null);
      return null;
    }
    const font = opentype.loadSync(fp);
    fontCache.set(filename, font || null);
    return font || null;
  } catch (_) {
    fontCache.set(filename, null);
    return null;
  }
}

function pickFontForGlyph(glyph) {
  for (const filename of FONT_CANDIDATES) {
    const font = loadFont(filename);
    if (!font) continue;
    try {
      const g = font.charToGlyph(glyph);
      if (g && (g.unicode || g.index > 0)) return font;
    } catch (_) {
      // ignore
    }
  }
  return null;
}

function buildGlyphSvg(glyph, { size = 24, color = "#EDEEFF" } = {}) {
  if (!glyph) return "";
  const font = pickFontForGlyph(glyph);
  if (!font) return "";
  try {
    const g = font.charToGlyph(glyph);
    if (!g) return "";
    const pathObj = g.getPath(0, 0, size);
    const box = pathObj.getBoundingBox();
    const width = Math.max(1, box.x2 - box.x1);
    const height = Math.max(1, box.y2 - box.y1);
    const d = pathObj.toPathData(2);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x1} ${box.y1} ${width} ${height}"><path d="${d}" fill="${color}"/></svg>`;
  } catch (_) {
    return "";
  }
}

function buildGlyphDataUri(glyph, options) {
  const svg = buildGlyphSvg(glyph, options);
  if (!svg) return "";
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function buildGlyphImgTag(glyph, { className = "glyph-img", size = 22, color = "#EDEEFF" } = {}) {
  if (!glyph) return "";
  const cacheKey = `${glyph}|${className}|${size}|${color}`;
  if (glyphTagCache.has(cacheKey)) return glyphTagCache.get(cacheKey);
  const src = buildGlyphDataUri(glyph, { size, color });
  const tag = src
    ? `<img class="${className}" src="${src}" alt=""/>`
    : `<span class="${className}">${glyph}</span>`;
  glyphTagCache.set(cacheKey, tag);
  return tag;
}

function replaceGlyphsWithImages(html, { className = "glyph-img", size = 20, color = "#EDEEFF" } = {}) {
  if (!html) return html || "";
  const glyphs = ["☊", "☋", "⚷", "⚸"];
  let out = String(html);
  glyphs.forEach((glyph) => {
    const tag = buildGlyphImgTag(glyph, { className, size, color });
    out = out.split(glyph).join(tag);
  });
  return out;
}

module.exports = {
  buildGlyphImgTag,
  replaceGlyphsWithImages,
};
