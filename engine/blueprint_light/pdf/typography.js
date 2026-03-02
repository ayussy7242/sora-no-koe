"use strict";

const { COLORS } = require("./assets");
const { contentWidth, ensurePageSpace } = require("./layout");
const { ASTRO_GLYPHS, pickSymbolFontName } = require("./symbols");

const LINE_GAP_BODY = 11;
const LINE_GAP_SUMMARY = 11;
const SECTION_GAP = 20;
const TITLE_PAD_TOP = 12;
const TITLE_PAD_BOTTOM = 18;
const HEADING_JP_SIZE = 20;
const HEADING_EN_SIZE = 12;
const HEADING_JP_GAP = 2;
const HEADING_MARGIN_AFTER = 26;
const HEADING_EN_TRACKING = 0.1;
const SUBHEADING_JP_SIZE = 16;
const SUBHEADING_EN_SIZE = 11;
const SUBHEADING_JP_GAP = 2;
const SUBHEADING_MARGIN_AFTER = 16;
const SUMMARY_TEXT_MIN_CHARS = 90;
const SUMMARY_TEXT_FILLERS = [
  "構造は先に置かれ、感触がゆっくりと形になる。",
];
const GLYPH_ADJUST_BASE = 11;
const GLYPH_X_ADJUST = {
  "☉": 0,
  "☽": -0.8,
  "☿": -0.6,
  "♀": -0.2,
  "♂": -0.2,
  "♃": -0.6,
  "♄": -0.4,
  "♅": -0.4,
  "♆": -0.4,
  "♇": -0.6,
  "⚷": -0.2,
  "⚸": -0.2,
  "☊": -0.2,
  "☋": -0.2,
  "♈": 0.1,
  "♉": 0.1,
  "♊": 0.1,
  "♋": 0.1,
  "♌": 0.1,
  "♍": 0.1,
  "♎": 0.1,
  "♏": 0.1,
  "♐": 0.1,
  "♑": 0.1,
  "♒": 0.1,
  "♓": 0.1,
};
const GLYPH_Y_ADJUST = {
  "☉": 0,
  "☽": -1.2,
  "☿": 0.6,
  "♀": 0,
  "♂": 0,
  "♃": 0.4,
  "♄": 0.4,
  "♅": 0.4,
  "♆": 0.4,
  "♇": 0.6,
  "⚷": 0.2,
  "⚸": 0.2,
  "☊": 0.2,
  "☋": 0.2,
  "♈": 0.2,
  "♉": 0.2,
  "♊": 0.2,
  "♋": 0.2,
  "♌": 0.2,
  "♍": 0.2,
  "♎": 0.2,
  "♏": 0.2,
  "♐": 0.2,
  "♑": 0.2,
  "♒": 0.2,
  "♓": 0.2,
};

function sanitizeText(text) {
  let out = String(text ?? "");
  out = out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  out = out.replace(/[\u200B-\u200D\uFEFF]/g, "");
  out = out.replace(/\uFFFD/g, "");
  return out.trim();
}

function trackedText(doc, text, x, y, tracking, options = {}) {
  let cursor = x;
  for (const ch of String(text)) {
    doc.text(ch, cursor, y, { lineBreak: false, ...options });
    const w = doc.widthOfString(ch);
    cursor += w + tracking;
  }
  return cursor;
}

function measureTrackedWidth(doc, text, tracking) {
  const chars = Array.from(String(text || ""));
  if (!chars.length) return 0;
  let width = 0;
  chars.forEach((ch, idx) => {
    width += doc.widthOfString(ch);
    if (idx < chars.length - 1) width += tracking;
  });
  return width;
}

function applyFont(doc, name, fallback) {
  try {
    doc.font(name);
    return name;
  } catch (_) {
    if (fallback) {
      try {
        doc.font(fallback);
        return fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

function getGlyphAdjust(glyph, fontSize = GLYPH_ADJUST_BASE) {
  const scale = fontSize / GLYPH_ADJUST_BASE;
  return {
    x: (GLYPH_X_ADJUST[glyph] || 0) * scale,
    y: (GLYPH_Y_ADJUST[glyph] || 0) * scale,
  };
}

function drawTextBlock(
  doc,
  layout,
  text,
  { font, size, lineGap, marginAfter, color, ensure = true, align = "left" } = {}
) {
  const safeText = sanitizeText(text);
  if (!safeText) return;
  const effectiveSize = size || 11;
  const effectiveLineGap = lineGap ?? LINE_GAP_BODY;
  const defaultColor = doc?._darkMode ? COLORS.textMainLight : COLORS.textMainDark;
  const fontName = applyFont(doc, font || "body", "body");
  doc.fillColor(color || defaultColor).font(fontName || "body").fontSize(effectiveSize);
  const blockHeight = doc.heightOfString(safeText, {
    width: contentWidth(doc),
    align,
    lineGap: effectiveLineGap,
  });
  if (ensure) {
    ensurePageSpace(doc, layout, blockHeight + (marginAfter ?? SECTION_GAP));
  }
  doc.text(safeText, layout.x, layout.y, {
    width: contentWidth(doc),
    align,
    lineGap: effectiveLineGap,
  });
  layout.y = doc.y + (marginAfter ?? SECTION_GAP);
}

function splitHeadingRest(rest) {
  const text = String(rest || "");
  if (!text) return { before: "", after: "", sep: "", hasSep: false };
  const candidates = ["｜", "|"];
  for (const candidate of candidates) {
    const idx = text.indexOf(candidate);
    if (idx >= 0) {
      return {
        before: text.slice(0, idx),
        after: text.slice(idx + candidate.length),
        sep: candidate,
        hasSep: true,
      };
    }
  }
  return { before: "", after: "", sep: "", hasSep: false };
}

function drawSymbolHeading(doc, layout, { glyph, rest, fontSize = 16, gap = 6 }) {
  const headingFont = "bold";
  const separatorFont = "title";
  const safeRest = sanitizeText(rest);
  const split = splitHeadingRest(safeRest);
  const lineHeight = doc.font(headingFont).fontSize(fontSize).currentLineHeight(true);
  const headingHeight = split.hasSep
    ? lineHeight
    : doc.heightOfString(rest || "", {
        width: contentWidth(doc),
        align: "left",
        lineGap: LINE_GAP_BODY,
      });
  ensurePageSpace(doc, layout, headingHeight + LINE_GAP_BODY);
  if (!glyph) {
    if (!split.hasSep) {
      const x = layout.x;
      const y = layout.y;
      doc.fillColor(COLORS.textMainDark);
      doc.font(headingFont).fontSize(fontSize).text(safeRest || "", x, y, {
        lineBreak: false,
        baseline: "alphabetic",
        width: contentWidth(doc),
      });
      layout.y = y + doc.currentLineHeight(true) + 2;
      return;
    }
    const x = layout.x;
    const y = layout.y;
    let cursor = x;
    doc.fillColor(COLORS.textMainDark);
    const beforeWidth = split.before ? doc.font(headingFont).fontSize(fontSize).widthOfString(split.before) : 0;
    const sepWidth = doc.font(separatorFont).fontSize(fontSize).widthOfString(split.sep);
    const afterWidth = Math.max(contentWidth(doc) - beforeWidth - sepWidth, 4);
    if (split.before) {
      doc.font(headingFont).fontSize(fontSize).text(split.before, cursor, y, {
        lineBreak: false,
        baseline: "alphabetic",
        width: Math.max(beforeWidth, 4),
      });
      cursor += doc.widthOfString(split.before);
    }
    doc.font(separatorFont).fontSize(fontSize).text(split.sep, cursor, y, {
      lineBreak: false,
      baseline: "alphabetic",
      width: Math.max(sepWidth, 4),
    });
    cursor += doc.widthOfString(split.sep);
    if (split.after) {
      doc.font(headingFont).fontSize(fontSize).text(split.after, cursor, y, {
        lineBreak: false,
        baseline: "alphabetic",
        width: afterWidth,
      });
    }
    doc.font(headingFont).fontSize(fontSize);
    layout.y = y + doc.currentLineHeight(true) + 2;
    return;
  }
  const symbolFont = pickSymbolFontName(doc, glyph);
  doc.font(symbolFont).fontSize(fontSize);
  const symbolWidth = doc.widthOfString(glyph);
  const availableWidth = contentWidth(doc) - symbolWidth - gap;
  const x = layout.x;
  const y = layout.y;
  doc.fillColor(COLORS.textMainDark);
  doc.font(symbolFont).fontSize(fontSize).text(glyph, x, y, {
    lineBreak: false,
    baseline: "alphabetic",
  });
  let cursor = x + symbolWidth + gap;
  if (split.hasSep) {
    const beforeWidth = split.before ? doc.font(headingFont).fontSize(fontSize).widthOfString(split.before) : 0;
    const sepWidth = doc.font(separatorFont).fontSize(fontSize).widthOfString(split.sep);
    const afterWidth = Math.max(availableWidth - beforeWidth - sepWidth, 4);
    if (split.before) {
      doc.font(headingFont).fontSize(fontSize).text(split.before, cursor, y, {
        lineBreak: false,
        baseline: "alphabetic",
        width: Math.max(beforeWidth, 4),
      });
      cursor += doc.widthOfString(split.before);
    }
    doc.font(separatorFont).fontSize(fontSize).text(split.sep, cursor, y, {
      lineBreak: false,
      baseline: "alphabetic",
      width: Math.max(sepWidth, 4),
    });
    cursor += doc.widthOfString(split.sep);
    if (split.after) {
      doc.font(headingFont).fontSize(fontSize).text(split.after, cursor, y, {
        lineBreak: false,
        baseline: "alphabetic",
        width: afterWidth,
      });
    }
    layout.y = y + doc.currentLineHeight(true) + 2;
    return;
  }
  doc.font(headingFont).fontSize(fontSize).text(safeRest || "", cursor, y, {
    lineBreak: false,
    baseline: "alphabetic",
    width: availableWidth,
  });
  layout.y = y + doc.currentLineHeight(true) + 2;
}

function drawInlineSymbolAndText(doc, layout, { glyph, text, fontSize = 14, gap = 6, textFont } = {}) {
  const rest = sanitizeText(text);
  if (!rest) return;
  const defaultColor = doc?._darkMode ? COLORS.textMainLight : COLORS.textMainDark;
  if (!glyph) {
    drawTextBlock(doc, layout, rest, {
      font: textFont || "body",
      size: fontSize,
      lineGap: LINE_GAP_BODY,
      marginAfter: 6,
    });
    return;
  }
  const font = textFont || "body";
  const symbolFont = pickSymbolFontName(doc, glyph);
  doc.font(symbolFont).fontSize(fontSize);
  const symbolWidth = doc.widthOfString(glyph);
  const availableWidth = contentWidth(doc) - symbolWidth - gap;
  doc.font(font).fontSize(fontSize);
  const textHeight = doc.heightOfString(rest || " ", {
    width: availableWidth,
    align: "left",
    lineGap: LINE_GAP_BODY,
  });
  const lineHeight = Math.max(textHeight, doc.currentLineHeight(true));
  ensurePageSpace(doc, layout, lineHeight + LINE_GAP_BODY);
  const symbolOffset = -1;
  doc.fillColor(defaultColor);
  doc.font(symbolFont).fontSize(fontSize).text(glyph, layout.x, layout.y + symbolOffset, { lineBreak: false });
  doc.font(font).fontSize(fontSize).text(rest, layout.x + symbolWidth + gap, layout.y, {
    width: availableWidth,
    align: "left",
    lineGap: LINE_GAP_BODY,
  });
  layout.y = doc.y + LINE_GAP_BODY;
}

function drawSymbolValueLine(
  doc,
  layout,
  segments,
  { fontSize = 15, lineGap = LINE_GAP_SUMMARY, separator = "｜" } = {}
) {
  if (!Array.isArray(segments) || segments.length === 0) return;
  const baseLineHeight = doc.font("body").fontSize(fontSize).currentLineHeight(true);
  let symbolLineHeight = baseLineHeight;
  segments.forEach((seg) => {
    const fontName = pickSymbolFontName(doc, seg?.symbol || "☉");
    const lh = doc.font(fontName).fontSize(fontSize).currentLineHeight(true);
    if (lh > symbolLineHeight) symbolLineHeight = lh;
  });
  const lineHeight = Math.max(baseLineHeight, symbolLineHeight);
  ensurePageSpace(doc, layout, lineHeight + lineGap);
  const y = layout.y;
  const symbolOffset = -1;
  let x = layout.x;
  const defaultColor = doc?._darkMode ? COLORS.textMainLight : COLORS.textMainDark;
  doc.fillColor(defaultColor);
  segments.forEach((seg, idx) => {
    const safeLabel = sanitizeText(seg.label);
    const safeValue = sanitizeText(seg.value);
    const symbolFont = pickSymbolFontName(doc, seg.symbol);
    doc.font(symbolFont).fontSize(fontSize).text(seg.symbol, x, y + symbolOffset, {
      lineBreak: false,
      baseline: "alphabetic",
    });
    x += doc.widthOfString(seg.symbol) + 4;
    doc.font("body").fontSize(fontSize).text(`${safeLabel} ${safeValue}`.trim(), x, y, {
      lineBreak: false,
      baseline: "alphabetic",
    });
    x += doc.widthOfString(`${safeLabel} ${safeValue}`.trim());
    if (idx < segments.length - 1) {
      doc.font("body").fontSize(fontSize).text(separator, x, y, { lineBreak: false, baseline: "alphabetic" });
      x += doc.widthOfString(separator);
    }
  });
  layout.y = y + lineHeight + lineGap;
}

function drawSymbolLabelLine(doc, layout, { symbols, label, value, fontSize = 14, lineGap = LINE_GAP_BODY, gap = 6 } = {}) {
  if (!symbols && !label) return;
  const symbolText = sanitizeText(symbols);
  const text = `${sanitizeText(label)} ${sanitizeText(value)}`.trim();
  const symbolFont = pickSymbolFontName(doc, symbolText[0] || "☉");
  doc.font(symbolFont).fontSize(fontSize);
  const symbolWidth = symbolText ? doc.widthOfString(symbolText) : 0;
  const availableWidth = contentWidth(doc) - symbolWidth - gap;
  const lineHeight = doc.currentLineHeight(true);
  ensurePageSpace(doc, layout, lineHeight + lineGap);
  const y = layout.y;
  if (symbolText) {
    doc.fillColor(COLORS.textMainLight);
    doc.font(symbolFont).fontSize(fontSize).text(symbolText, layout.x, y, { lineBreak: false });
  }
  if (text) {
    doc.fillColor(COLORS.textMainLight);
    doc.font("body").fontSize(fontSize).text(text, layout.x + symbolWidth + gap, y, {
      width: availableWidth,
      align: "left",
      lineGap,
    });
  }
  layout.y = y + lineHeight + lineGap;
}

const ASTRO_GLYPHS_REGEX = (() => {
  const escaped = ASTRO_GLYPHS.map((g) => String(g).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")).join("");
  return new RegExp(`[${escaped}]`, "g");
})();
const TOFU_REGEX = /[□■☒�]/g;

function normalizeHeadingText(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/[｜|]/g, "|");
}

function stripHeadingEcho(text, headingRest) {
  if (!headingRest) return text;
  const lines = String(text || "").split(/\r?\n/);
  if (!lines.length) return text;
  const first = lines[0].trim();
  if (!first) return text;
  const normFirst = normalizeHeadingText(first);
  const normHeading = normalizeHeadingText(headingRest);
  if (normHeading && normFirst.startsWith(normHeading)) {
    return lines.slice(1).join("\n").trim();
  }
  return text;
}

function sanitizeNarrativeText(text, headingRest) {
  let out = String(text || "");
  out = stripHeadingEcho(out, headingRest);
  out = out.replace(ASTRO_GLYPHS_REGEX, "");
  out = out.replace(TOFU_REGEX, "");
  out = out.replace(/[|]/g, "｜");
  out = out.replace(/[ \t]+\n/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

function ensureBodyText(text, { heading } = {}) {
  let out = sanitizeNarrativeText(sanitizeText(text), heading);
  if (!out) return "";
  if (out.includes("\\n")) {
    out = out.replace(/\\n/g, "\n");
  }
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

function ensureSummaryText(text) {
  let out = String(text || "").trim();
  let i = 0;
  while (out.length < SUMMARY_TEXT_MIN_CHARS && i < SUMMARY_TEXT_FILLERS.length) {
    out = `${out}${out ? " " : ""}${SUMMARY_TEXT_FILLERS[i]}`;
    i += 1;
  }
  return out;
}

function drawSectionTitle(doc, layout, title) {
  const h = 44;
  const fontSize = 20;
  ensurePageSpace(doc, layout, TITLE_PAD_TOP + h + TITLE_PAD_BOTTOM);
  layout.y += TITLE_PAD_TOP;
  const x = layout.x;
  const w = contentWidth(doc);
  const y = layout.y;

  doc.save();
  doc.rect(x, y, w, h).fill(COLORS.subBg);
  doc.fillColor(COLORS.textMainLight).font("title").fontSize(fontSize);
  const textHeight = doc.currentLineHeight(true);
  const textY = y + Math.max((h - textHeight) / 2, 0);
  doc.text(title, x + 10, textY, { lineBreak: false });
  doc.restore();

  layout.y = y + h + TITLE_PAD_BOTTOM;
}

function drawDivider(doc, layout) {
  ensurePageSpace(doc, layout, 20);
  const x = layout.x;
  const w = contentWidth(doc);
  doc.save();
  doc.strokeColor(COLORS.border).strokeOpacity(0.25).lineWidth(1);
  doc.moveTo(x, layout.y).lineTo(x + w, layout.y).stroke();
  doc.restore();
  layout.y += SECTION_GAP;
}

function drawSectionHeader(doc, layout, title) {
  drawTextBlock(doc, layout, title, {
    font: "title",
    size: 18,
    lineGap: LINE_GAP_BODY,
    marginAfter: SECTION_GAP,
  });
}

function drawBilingualHeading(
  doc,
  layout,
  {
    jp,
    en,
    jpSize = HEADING_JP_SIZE,
    enSize = HEADING_EN_SIZE,
    jpGap = HEADING_JP_GAP,
    marginAfter = HEADING_MARGIN_AFTER,
    colorJp,
    colorEn = COLORS.textSub,
    align = "left",
    keepHeight = 0,
    lineGap = 12,
    enTracking = HEADING_EN_TRACKING,
  } = {}
) {
  if (!jp && !en) return;
  if (keepHeight) ensurePageSpace(doc, layout, keepHeight);
  const safeJp = sanitizeText(jp);
  const safeEn = sanitizeText(en);
  if (safeJp) {
    drawTextBlock(doc, layout, safeJp, {
      font: "title",
      size: jpSize,
      lineGap,
      marginAfter: jpGap,
      color: colorJp,
      align,
    });
  }
  if (safeEn) {
    const fontName = applyFont(doc, "note", "note");
    const tracking = (enTracking || 0) * enSize;
    doc.font(fontName).fontSize(enSize).fillColor(colorEn);
    const lineHeight = doc.currentLineHeight(true);
    ensurePageSpace(doc, layout, lineHeight + marginAfter);
    const width = tracking ? measureTrackedWidth(doc, safeEn, tracking) : doc.widthOfString(safeEn);
    let x = layout.x;
    const available = contentWidth(doc);
    if (align === "center") {
      x = layout.x + (available - width) / 2;
    } else if (align === "right") {
      x = layout.x + (available - width);
    }
    const y = layout.y;
    if (tracking) {
      trackedText(doc, safeEn, x, y, tracking, { fill: colorEn });
    } else {
      doc.text(safeEn, x, y, { lineBreak: false });
    }
    layout.y = y + lineHeight + marginAfter;
  }
}

function drawBilingualSubheading(
  doc,
  layout,
  {
    jp,
    en,
    colorJp,
    colorEn = COLORS.textSub,
    align = "left",
    keepHeight = 0,
    lineGap = 12,
    enTracking = HEADING_EN_TRACKING,
  } = {}
) {
  return drawBilingualHeading(doc, layout, {
    jp,
    en,
    jpSize: SUBHEADING_JP_SIZE,
    enSize: SUBHEADING_EN_SIZE,
    jpGap: SUBHEADING_JP_GAP,
    marginAfter: SUBHEADING_MARGIN_AFTER,
    colorJp,
    colorEn,
    align,
    keepHeight,
    lineGap,
    enTracking,
  });
}

function drawSmallTitle(doc, layout, text) {
  drawTextBlock(doc, layout, text, {
    font: "title",
    size: 14,
    lineGap: LINE_GAP_BODY,
    marginAfter: 6,
  });
}

function addOutlineItem(doc, title) {
  if (!doc.outline) return;
  doc.outline.addItem(title, { expanded: false, dest: doc._outlineDest || doc.outlineDest });
}

function drawCenteredSymbolStack(
  doc,
  layout,
  { glyph, signSymbol, title, subtitle, symbolSize = 58, signSize = 22, titleSize = 18, subtitleSize = 12, gap = 8 } = {}
) {
  const cx = layout.x + contentWidth(doc) / 2;
  let y = layout.y;

  if (glyph) {
    const fontName = pickSymbolFontName(doc, glyph);
    doc.font(fontName).fontSize(symbolSize).fillColor(COLORS.textMainLight);
    const w = doc.widthOfString(glyph);
    const adjust = getGlyphAdjust(glyph, symbolSize);
    doc.text(glyph, cx - w / 2 + adjust.x, y + adjust.y, { lineBreak: false });
    y += doc.currentLineHeight(true) + gap;
  }

  if (signSymbol) {
    const fontName = pickSymbolFontName(doc, signSymbol);
    doc.font(fontName).fontSize(signSize).fillColor(COLORS.textSub);
    const w = doc.widthOfString(signSymbol);
    const adjust = getGlyphAdjust(signSymbol, signSize);
    doc.text(signSymbol, cx - w / 2 + adjust.x, y + adjust.y, { lineBreak: false });
    y += doc.currentLineHeight(true) + gap;
  }

  layout.y = y;

  if (title) {
    drawTextBlock(doc, layout, title, {
      font: "title",
      size: titleSize,
      lineGap: LINE_GAP_BODY,
      marginAfter: 6,
      align: "center",
      color: COLORS.textMainLight,
    });
  }

  if (subtitle) {
    drawTextBlock(doc, layout, subtitle, {
      font: "note",
      size: subtitleSize,
      lineGap: LINE_GAP_BODY,
      marginAfter: SECTION_GAP,
      align: "center",
      color: COLORS.textSub,
    });
  }
}

function measureSignBlockHeight(
  doc,
  { signSymbol, signEn, symbolSize = 14, textSize = 14, enSize = 11, lineGap = 4, marginAfter = 16 } = {}
) {
  let symbolH = 0;
  if (signSymbol) {
    const fontName = doc._symbolUniversalFontName || pickSymbolFontName(doc, signSymbol);
    symbolH = doc.font(fontName).fontSize(symbolSize).currentLineHeight(true);
  }
  const textH = doc.font("title").fontSize(textSize).currentLineHeight(true);
  const lineH = Math.max(symbolH, textH);
  const enH = signEn ? doc.font("note").fontSize(enSize).currentLineHeight(true) : 0;
  return lineH + (signEn ? lineGap + enH : 0) + marginAfter;
}

function drawSignBlock(
  doc,
  layout,
  {
    signSymbol,
    signJa,
    signEn,
    degText,
    align = "center",
    symbolSize = 14,
    textSize = 14,
    enSize = 11,
    gap = 6,
    lineGap = 4,
    marginAfter = 16,
    colorMain = COLORS.textMainLight,
    colorSub = COLORS.textSub,
  } = {}
) {
  const safeSymbol = sanitizeText(signSymbol);
  const safeJa = sanitizeText(signJa);
  const safeEn = sanitizeText(signEn);
  const safeDeg = sanitizeText(degText);
  const textLine = `${safeJa}${safeDeg ? ` ${safeDeg}` : ""}`.trim();
  if (!safeSymbol && !textLine && !safeEn) return;

  const symbolFont = safeSymbol ? doc._symbolUniversalFontName || pickSymbolFontName(doc, safeSymbol) : null;
  const symbolW = safeSymbol ? doc.font(symbolFont).fontSize(symbolSize).widthOfString(safeSymbol) : 0;
  const textW = textLine ? doc.font("title").fontSize(textSize).widthOfString(textLine) : 0;
  const totalW = symbolW + (safeSymbol && textLine ? gap : 0) + textW;
  const contentW = contentWidth(doc);
  let x = layout.x;
  if (align === "center") {
    x = layout.x + (contentW - totalW) / 2;
  } else if (align === "right") {
    x = layout.x + (contentW - totalW);
  }
  const y = layout.y;
  const lineH = Math.max(
    safeSymbol ? doc.font(symbolFont).fontSize(symbolSize).currentLineHeight(true) : 0,
    doc.font("title").fontSize(textSize).currentLineHeight(true)
  );
  ensurePageSpace(doc, layout, lineH + (safeEn ? lineGap + doc.font("note").fontSize(enSize).currentLineHeight(true) : 0) + marginAfter);

  let cursor = x;
  if (safeSymbol) {
    const adjust = getGlyphAdjust(safeSymbol, symbolSize);
    doc.fillColor(colorMain);
    doc.font(symbolFont).fontSize(symbolSize).text(safeSymbol, cursor + adjust.x, y + adjust.y, { lineBreak: false });
    cursor += symbolW + (textLine ? gap : 0);
  }
  if (textLine) {
    doc.fillColor(colorMain);
    doc.font("title").fontSize(textSize).text(textLine, cursor, y, { lineBreak: false });
  }

  if (safeEn) {
    layout.y = y + lineH + lineGap;
    drawTextBlock(doc, layout, safeEn, {
      font: "note",
      size: enSize,
      lineGap: 10,
      marginAfter,
      color: colorSub,
      align,
      ensure: false,
    });
  } else {
    layout.y = y + lineH + marginAfter;
  }
}

module.exports = {
  LINE_GAP_BODY,
  LINE_GAP_SUMMARY,
  SECTION_GAP,
  TITLE_PAD_TOP,
  TITLE_PAD_BOTTOM,
  trackedText,
  applyFont,
  drawTextBlock,
  drawSymbolHeading,
  drawInlineSymbolAndText,
  drawSymbolValueLine,
  drawSymbolLabelLine,
  drawSectionTitle,
  drawDivider,
  drawSectionHeader,
  drawBilingualHeading,
  drawBilingualSubheading,
  drawSmallTitle,
  addOutlineItem,
  ensureBodyText,
  ensureSummaryText,
  getGlyphAdjust,
  sanitizeText,
  measureSignBlockHeight,
  drawSignBlock,
  drawCenteredSymbolStack,
};
