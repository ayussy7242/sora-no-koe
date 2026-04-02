"use strict";

const { SIGN_JA, SIGN_SYMBOL } = require("./constants");

const zodiacGlyphs = Array.from(new Set(Object.values(SIGN_SYMBOL || {}).filter(Boolean)));
const zodiacNameMap = Object.entries(SIGN_JA || {})
  .map(([key, name]) => ({ name, glyph: SIGN_SYMBOL?.[key] || "" }))
  .filter((row) => row.name && row.glyph);

function ensureZodiacGlyphs(text) {
  let out = String(text || "");
  zodiacNameMap.forEach(({ name, glyph }) => {
    if (!out.includes(name)) return;
    if (out.includes(glyph)) return;
    out = out.replace(name, `${glyph} ${name}`);
  });
  return out;
}

function wrapZodiacGlyphs(text) {
  let out = ensureZodiacGlyphs(text);
  zodiacGlyphs.forEach((glyph) => {
    out = out.split(glyph).join(`<span class="zodiac-glyph">${glyph}</span>`);
  });
  return out;
}

module.exports = {
  ensureZodiacGlyphs,
  wrapZodiacGlyphs,
};
