"use strict";

// Single Source of Truth (SSOT) for typography across renderers.
// Update font files and naming here to keep IG/PDF/OGP/blog in sync.

const FONT_FAMILIES = Object.freeze({
  main: {
    display: "Zen Kaku Gothic New",
    css: "Zen Kaku Gothic",
  },
  bodyBlog: {
    display: "はれのそら 明朝",
    css: "Hare no Sora Mincho",
  },
  bodyPdf: {
    display: "Shippori Mincho",
    css: "Shippori Mincho",
  },
  soft: {
    display: "Klee One",
    css: "Klee One",
  },
  symbols: {
    primary: "Noto Symbols",
    secondary: "Noto Symbols 2",
    tertiary: "Symbola",
  },
});

const FONT_FILES = Object.freeze({
  main: {
    regular: "ZenKakuGothicNew-Regular.ttf",
    medium: "ZenKakuGothicNew-Medium.ttf",
    bold: "ZenKakuGothicNew-Bold.ttf",
  },
  body: {
    // NOTE: "はれのそら 明朝" font files are not in assets yet.
    // When available, replace these with the proper blog font files.
    blog: {
      regular: "ShipporiMincho-Regular.ttf",
      bold: "ShipporiMincho-Bold.ttf",
    },
    pdf: {
      regular: "ShipporiMincho-Regular.ttf",
      bold: "ShipporiMincho-Bold.ttf",
    },
  },
  soft: {
    regular: "KleeOne-Regular.ttf",
    semiBold: "KleeOne-SemiBold.ttf",
  },
  symbols: {
    primary: "NotoSansSymbols-Regular.ttf",
    secondary: "NotoSansSymbols2-Regular.ttf",
    tertiary: "Symbola_hint.ttf",
  },
});

const TYPOGRAPHY_ROLES = Object.freeze({
  main: {
    family: FONT_FAMILIES.main.display,
    usage: ["OGP", "header", "siteTitle", "pdfCover"],
    role: "存在の輪郭",
  },
  body: {
    blog: {
      family: FONT_FAMILIES.bodyBlog.display,
      role: "記憶に沈む言葉",
    },
    pdf: {
      family: FONT_FAMILIES.bodyPdf.display,
      role: "記憶に沈む言葉",
    },
  },
  soft: {
    family: FONT_FAMILIES.soft.display,
    usage: ["annotations", "ambientText", "interpretationLine"],
    role: "残響",
  },
});

const LOGO_SPEC = Object.freeze({
  text: "ソラのこえ",
  fontFamily: FONT_FAMILIES.main.display,
  letterSpacingEm: 0.08,
  fontWeightMin: 400,
  fontWeightMax: 500,
  punctuation: "none",
});

module.exports = {
  FONT_FAMILIES,
  FONT_FILES,
  TYPOGRAPHY_ROLES,
  LOGO_SPEC,
};
