"use strict";

const fontkit = require("fontkit");
const opentype = require("opentype.js");
const { escapeXml } = require("../../../../utils/data/xml");

const PATH_GLYPHS = new Set([
  "☉","☽","☿","♀","♂","♃","♄","♅","♆","♇",
  "⚷","⚸","☊","☋",
  "♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓",
  "☌","⚹","□","△","☍",
]);

function createGlyphLayout({ resolveFontPath, FONT_FILES } = {}) {
  const TEXT_MEASURE_FONTS = {};
  const GLYPH_PATH_FONTS = [];
  const SYMBOL_FONT_ORDER = ["SoraGlyphAlt", "SoraGlyph", "SoraGlyphAlt2"];
  const SYMBOL_FONT_PATHS = {};
  const SYMBOL_FONT_KIT = {};

  function loadTextMeasureFont(fileKey) {
    if (TEXT_MEASURE_FONTS[fileKey]) return TEXT_MEASURE_FONTS[fileKey];
    const filename = FONT_FILES?.[fileKey];
    if (!filename) return null;
    const fp = resolveFontPath ? resolveFontPath(filename) : null;
    if (!fp) return null;
    try {
      const font = opentype.loadSync(fp);
      if (font) TEXT_MEASURE_FONTS[fileKey] = font;
      return font || null;
    } catch (_) {
      return null;
    }
  }

  function measureTextWidth(text, size, fontKey = "title") {
    const safeText = String(text || "");
    if (!safeText) return 0;
    const font = loadTextMeasureFont(fontKey);
    if (!font) return safeText.length * size * 0.92;
    const units = font.unitsPerEm || 1000;
    let width = 0;
    for (const ch of safeText) {
      try {
        const g = font.charToGlyph(ch);
        if (g) width += g.advanceWidth || 0;
      } catch (_) {
        width += units * 0.8;
      }
    }
    return (width * Number(size)) / units;
  }

  function loadGlyphPathFonts() {
    if (GLYPH_PATH_FONTS.length) return GLYPH_PATH_FONTS;
    const candidates = [FONT_FILES?.glyphAlt2, FONT_FILES?.glyphAlt, FONT_FILES?.glyph];
    candidates.forEach((file) => {
      if (!file) return;
      const fp = resolveFontPath ? resolveFontPath(file) : null;
      if (!fp) return;
      try {
        const font = opentype.loadSync(fp);
        if (font) GLYPH_PATH_FONTS.push(font);
      } catch (_) {
        // ignore
      }
    });
    return GLYPH_PATH_FONTS;
  }

  function pickGlyphPathFont(glyph) {
    if (!glyph) return null;
    const fonts = loadGlyphPathFonts();
    for (const font of fonts) {
      try {
        const g = font.charToGlyph(glyph);
        if (!g) continue;
        if (g.index === 0 && !g.unicode) continue;
        return font;
      } catch (_) {
        // ignore
      }
    }
    return null;
  }

  function glyphAdvanceWidth(font, glyph, size) {
    if (!font || !glyph) return 0;
    try {
      const g = font.charToGlyph(glyph);
      if (!g) return 0;
      const units = font.unitsPerEm || 1000;
      return (g.advanceWidth || 0) * (Number(size) / units);
    } catch (_) {
      return 0;
    }
  }

  function buildGlyphPath({ glyph, x, y, size, color, opacity, filterId }) {
    if (!glyph) return "";
    const font = pickGlyphPathFont(glyph);
    if (!font) return "";
    const g = font.charToGlyph(glyph);
    if (!g) return "";
    const path = g.getPath(x, y, size);
    const d = path.toPathData(2);
    const filterAttr = filterId ? ` filter=\"url(#${filterId})\"` : "";
    const opacityAttr = Number.isFinite(Number(opacity)) ? ` opacity=\"${opacity}\"` : "";
    return `<path d=\"${d}\" fill=\"${color}\"${filterAttr}${opacityAttr}/>`;
  }

  function normalizeSymbol(glyph) {
    return String(glyph || "")
      .replace(/\uFE0E|\uFE0F/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractGlyph(line) {
    const clean = normalizeSymbol(line);
    if (!clean) return "";
    const candidate = clean.match(/^[^A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF]/);
    return candidate ? candidate[0] : "";
  }

  function loadSymbolFontKit() {
    if (Object.keys(SYMBOL_FONT_PATHS).length) return;
    SYMBOL_FONT_PATHS.SoraGlyph = resolveFontPath ? resolveFontPath(FONT_FILES?.glyph) : null;
    SYMBOL_FONT_PATHS.SoraGlyphAlt = resolveFontPath ? resolveFontPath(FONT_FILES?.glyphAlt) : null;
    SYMBOL_FONT_PATHS.SoraGlyphAlt2 = resolveFontPath ? resolveFontPath(FONT_FILES?.glyphAlt2) : null;
    for (const [name, fp] of Object.entries(SYMBOL_FONT_PATHS)) {
      try {
        SYMBOL_FONT_KIT[name] = fp ? fontkit.openSync(fp) : null;
      } catch (_) {
        SYMBOL_FONT_KIT[name] = null;
      }
    }
  }

  function hasGlyph(font, glyph) {
    if (!font || !glyph) return false;
    const codePoint = glyph.codePointAt(0);
    if (!codePoint) return false;
    if (typeof font.hasGlyphForCodePoint !== "function") return false;
    return font.hasGlyphForCodePoint(codePoint);
  }

  function pickGlyphFontFamily(glyph) {
    if (!glyph) return SYMBOL_FONT_ORDER.join(",");
    const forceNoto = new Set(["⚷", "⚸", "☊", "☋", "♇"]);
    if (forceNoto.has(glyph)) return "SoraGlyphAlt";
    loadSymbolFontKit();
    for (const name of SYMBOL_FONT_ORDER) {
      if (hasGlyph(SYMBOL_FONT_KIT[name], glyph)) return name;
    }
    return "SoraGlyphAlt2";
  }

  function buildGlyphLine({
    x,
    y,
    text,
    size,
    color,
    letterSpacing,
    fontFamily = "SoraTitle",
    glyphFamily = "",
    anchor,
    glyphBoxWidth,
    glyphGap = 12,
    glyphScale = 1,
    preferTextGlyph = false,
  }) {
    const raw = normalizeSymbol(text);
    if (!raw.trim()) return "";
    const spacing = Number.isFinite(letterSpacing) ? ` letter-spacing=\"${letterSpacing}em\"` : "";
    const anchorAttr = anchor ? ` text-anchor=\"${anchor}\"` : "";
    const glyph = extractGlyph(raw);
    if (!glyph) {
      return `<text x=\"${x}\" y=\"${y}\" fill=\"${color}\" font-size=\"${size}\" font-family=\"${fontFamily}\"${spacing}${anchorAttr}>${escapeXml(raw)}</text>`;
    }
    const rest = raw.replace(glyph, "").trimStart();
    const restSafe = escapeXml(rest);
    if (Number.isFinite(glyphBoxWidth)) {
      const boxWidth = Math.max(0, Number(glyphBoxWidth));
      const restX = x + boxWidth + glyphGap;
      if (!preferTextGlyph && PATH_GLYPHS.has(glyph)) {
        const font = pickGlyphPathFont(glyph);
        let glyphX = x;
        if (font) {
          const advance = glyphAdvanceWidth(font, glyph, size * glyphScale);
          if (advance) glyphX = x + (boxWidth - advance) / 2;
        }
        const glyphPath = buildGlyphPath({ glyph, x: glyphX, y, size: size * glyphScale, color });
        const restText = rest
          ? `<text x=\"${restX}\" y=\"${y}\" fill=\"${color}\" font-size=\"${size}\" font-family=\"${fontFamily}\"${spacing}>${restSafe}</text>`
          : "";
        if (glyphPath) return `<g>${glyphPath}${restText}</g>`;
        const glyphFont = glyphFamily || pickGlyphFontFamily(glyph);
        const fallbackGlyph = `<text x=\"${x + boxWidth / 2}\" y=\"${y}\" text-anchor=\"middle\" fill=\"${color}\" font-size=\"${(size * glyphScale).toFixed(2)}\" font-family=\"${glyphFont}\"${spacing}>${escapeXml(glyph)}</text>`;
        return `<g>${fallbackGlyph}${restText}</g>`;
      }
      const glyphFont = glyphFamily || pickGlyphFontFamily(glyph);
      const glyphX = x + boxWidth / 2;
      const glyphText = `<text x=\"${glyphX}\" y=\"${y}\" text-anchor=\"middle\" fill=\"${color}\" font-size=\"${(size * glyphScale).toFixed(2)}\" font-family=\"${glyphFont}\"${spacing}>${escapeXml(glyph)}</text>`;
      const restText = rest
        ? `<text x=\"${restX}\" y=\"${y}\" fill=\"${color}\" font-size=\"${size}\" font-family=\"${fontFamily}\"${spacing}>${restSafe}</text>`
        : "";
      return `<g>${glyphText}${restText}</g>`;
    }
    if (!anchor && !preferTextGlyph && PATH_GLYPHS.has(glyph)) {
      const font = pickGlyphPathFont(glyph);
      if (font) {
        const advance = glyphAdvanceWidth(font, glyph, size * glyphScale);
        const glyphPath = buildGlyphPath({ glyph, x, y, size: size * glyphScale, color });
        const restX = x + advance + 12;
        const restText = rest
          ? `<text x=\"${restX}\" y=\"${y}\" fill=\"${color}\" font-size=\"${size}\" font-family=\"${fontFamily}\"${spacing}>${restSafe}</text>`
          : "";
        return `<g>${glyphPath}${restText}</g>`;
      }
    }
    const glyphFont = glyphFamily || pickGlyphFontFamily(glyph);
    return (
      `<text x=\"${x}\" y=\"${y}\" fill=\"${color}\" font-size=\"${(size * glyphScale).toFixed(2)}\" font-family=\"${glyphFont}\"${spacing}${anchorAttr}>` +
      `<tspan>${escapeXml(glyph)}</tspan>` +
      (rest ? `<tspan dx=\"12\" font-family=\"${fontFamily}\" font-size=\"${size}\">${restSafe}</tspan>` : "") +
      `</text>`
    );
  }

  return {
    measureTextWidth,
    normalizeSymbol,
    extractGlyph,
    buildGlyphLine,
    buildGlyphPath,
    pickGlyphFontFamily,
    pickGlyphPathFont,
    glyphAdvanceWidth,
  };
}

module.exports = {
  createGlyphLayout,
  PATH_GLYPHS,
};
