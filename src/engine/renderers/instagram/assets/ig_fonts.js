"use strict";

const fs = require("fs");
const path = require("path");
const { FONT_FILES } = require("../../../shared/typography");

const ROOT_DIR = path.resolve(__dirname, "..", "..", "..", "..", "..");
const FONT_DIR = path.join(ROOT_DIR, "assets", "fonts");

const IG_FONT_FILES = {
  title: FONT_FILES.main.regular,
  titleBold: FONT_FILES.main.bold,
  body: FONT_FILES.body.pdf.regular,
  bodyMedium: FONT_FILES.body.pdf.regular,
  bodyBold: FONT_FILES.body.pdf.bold,
  soft: FONT_FILES.soft.regular,
  glyph: FONT_FILES.symbols.secondary,
  glyphAlt: FONT_FILES.symbols.primary,
  glyphAlt2: FONT_FILES.symbols.tertiary,
};

function resolveFontPath(filename) {
  const candidates = [
    path.join(FONT_DIR, filename),
    path.join(process.cwd(), "assets", "fonts", filename),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {
      // ignore
    }
  }
  return null;
}

function readFontBase64(filename) {
  try {
    const p = resolveFontPath(filename);
    if (!p) return null;
    const data = fs.readFileSync(p);
    return data.toString("base64");
  } catch (_) {
    return null;
  }
}

const FONT_BASE64 = {
  title: readFontBase64(IG_FONT_FILES.title),
  titleBold: readFontBase64(IG_FONT_FILES.titleBold),
  body: readFontBase64(IG_FONT_FILES.body),
  bodyMedium: readFontBase64(IG_FONT_FILES.bodyMedium),
  bodyBold: readFontBase64(IG_FONT_FILES.bodyBold),
  soft: readFontBase64(IG_FONT_FILES.soft),
  glyph: readFontBase64(IG_FONT_FILES.glyph),
  glyphAlt: readFontBase64(IG_FONT_FILES.glyphAlt),
  glyphAlt2: readFontBase64(IG_FONT_FILES.glyphAlt2),
};

function fontFaceCss() {
  const parts = [];
  if (FONT_BASE64.title) {
    parts.push(
      `@font-face{font-family:"SoraTitle";src:url(data:font/ttf;base64,${FONT_BASE64.title}) format("truetype");font-weight:400;font-style:normal;}`
    );
  }
  if (FONT_BASE64.titleBold) {
    parts.push(
      `@font-face{font-family:"SoraTitleBold";src:url(data:font/ttf;base64,${FONT_BASE64.titleBold}) format("truetype");font-weight:600;font-style:normal;}`
    );
  }
  if (FONT_BASE64.body) {
    parts.push(
      `@font-face{font-family:"SoraBody";src:url(data:font/ttf;base64,${FONT_BASE64.body}) format("truetype");font-weight:400;font-style:normal;}`
    );
  }
  if (FONT_BASE64.bodyMedium) {
    parts.push(
      `@font-face{font-family:"SoraBodyMedium";src:url(data:font/ttf;base64,${FONT_BASE64.bodyMedium}) format("truetype");font-weight:500;font-style:normal;}`
    );
  }
  if (FONT_BASE64.bodyBold) {
    parts.push(
      `@font-face{font-family:"SoraBodyBold";src:url(data:font/ttf;base64,${FONT_BASE64.bodyBold}) format("truetype");font-weight:700;font-style:normal;}`
    );
  }
  if (FONT_BASE64.soft) {
    parts.push(
      `@font-face{font-family:"SoraSoft";src:url(data:font/ttf;base64,${FONT_BASE64.soft}) format("truetype");font-weight:400;font-style:normal;}`
    );
  }
  if (FONT_BASE64.glyph) {
    parts.push(
      `@font-face{font-family:"SoraGlyph";src:url(data:font/ttf;base64,${FONT_BASE64.glyph}) format("truetype");font-weight:400;font-style:normal;}`
    );
  }
  if (FONT_BASE64.glyphAlt) {
    parts.push(
      `@font-face{font-family:"SoraGlyphAlt";src:url(data:font/ttf;base64,${FONT_BASE64.glyphAlt}) format("truetype");font-weight:400;font-style:normal;}`
    );
  }
  if (FONT_BASE64.glyphAlt2) {
    parts.push(
      `@font-face{font-family:"SoraGlyphAlt2";src:url(data:font/ttf;base64,${FONT_BASE64.glyphAlt2}) format("truetype");font-weight:400;font-style:normal;}`
    );
  }
  return parts.join("");
}

module.exports = {
  FONT_FILES: IG_FONT_FILES,
  resolveFontPath,
  readFontBase64,
  FONT_BASE64,
  fontFaceCss,
};
