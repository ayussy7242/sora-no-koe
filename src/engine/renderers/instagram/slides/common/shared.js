"use strict";

const sharp = require("sharp");
const { IG_TOKENS } = require("../../tokens");
const { fontFaceCss } = require("../../assets/fonts");
const { buildSpaceBackground } = require("../../../../shared/space_background");
const { resolveColors } = require("../../theme");
const { formatDateLabel } = require("../../../../../utils/time");
const { escapeXml } = require("../../../../../utils/data/xml");
const { wrapLines } = require("../../../../../utils/text/wrap");
const { PATH_GLYPHS, measureTextWidth, buildGlyphPath, pickGlyphPathFont, glyphAdvanceWidth } = require("./glyph_layout");

const CANVAS = {
  width: 1080,
  height: 1350,
};

const TOK = IG_TOKENS;

function splitGlyphRuns(line) {
  const chars = Array.from(String(line || ""));
  const runs = [];
  chars.forEach((ch) => {
    const isGlyph = PATH_GLYPHS.has(ch);
    const last = runs[runs.length - 1];
    if (!last || last.isGlyph !== isGlyph) {
      runs.push({ isGlyph, text: ch });
    } else {
      last.text += ch;
    }
  });
  return runs;
}

function measureGlyphWidth(glyph, size) {
  const font = pickGlyphPathFont(glyph);
  if (font) return glyphAdvanceWidth(font, glyph, size);
  return size * 0.9;
}

const GLYPH_Y_ADJUST = {
  "□": 1,
};

function richTextLine({ x, y, text, size, color, fontFamily = "SoraBody", anchor = "start", glyphOffsetY = -1, glyphGap = 3 } = {}) {
  const runs = splitGlyphRuns(text);
  const widths = runs.map((run) => {
    if (!run.text) return 0;
    if (run.isGlyph) {
      return Array.from(run.text).reduce((acc, ch) => acc + measureGlyphWidth(ch, size) + glyphGap, -glyphGap);
    }
    return measureTextWidth(run.text, size, "body");
  });
  const total = widths.reduce((a, b) => a + b, 0);
  let cursorX = anchor === "middle" ? x - total / 2 : x;
  const out = [];
  runs.forEach((run, idx) => {
    if (!run.text) return;
    if (run.isGlyph) {
      Array.from(run.text).forEach((ch) => {
        const adjust = Number.isFinite(GLYPH_Y_ADJUST[ch]) ? GLYPH_Y_ADJUST[ch] : 0;
        const path = buildGlyphPath({ glyph: ch, x: cursorX, y: y + glyphOffsetY + adjust, size, color });
        if (path) out.push(path);
        cursorX += measureGlyphWidth(ch, size) + glyphGap;
      });
      return;
    }
    out.push(
      `<text x="${cursorX}" y="${y}" fill="${color}" font-size="${size}" font-family="${fontFamily}">${escapeXml(run.text)}</text>`
    );
    cursorX += widths[idx] || 0;
  });
  return out.join("");
}

function glyphTextLine({ x, y, text, size, color, fontFamily = "SoraBody", glyphFamily = "SoraGlyphAlt", letterSpacing, anchor }) {
  const spacing = Number.isFinite(letterSpacing) ? ` letter-spacing="${letterSpacing}em"` : "";
  const anchorAttr = anchor ? ` text-anchor="${anchor}"` : "";
  const runs = splitGlyphRuns(text);
  const runSpans = runs.map((run) => {
    const ff = run.isGlyph ? glyphFamily : fontFamily;
    return `<tspan font-family="${ff}">${escapeXml(run.text)}</tspan>`;
  }).join("");
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="${fontFamily}"${spacing}${anchorAttr}>${runSpans}</text>`;
}

function textBlock({ x, y, lines, size, lineHeight, color, fontFamily, letterSpacing, anchor, glyphFamily = "SoraGlyphAlt" }) {
  const spacing = Number.isFinite(letterSpacing) ? ` letter-spacing=\"${letterSpacing}em\"` : "";
  const anchorAttr = anchor ? ` text-anchor=\"${anchor}\"` : "";
  const safeLines = Array.isArray(lines) ? lines : wrapLines(lines, 20, 3);
  const tspans = safeLines
    .map((line, i) => {
      const runs = splitGlyphRuns(line);
      const runSpans = runs.map((run) => {
        const ff = run.isGlyph ? glyphFamily : fontFamily;
        return `<tspan font-family="${ff}">${escapeXml(run.text)}</tspan>`;
      }).join("");
      return `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${runSpans}</tspan>`;
    })
    .join("");
  return `<text x=\"${x}\" y=\"${y}\" fill=\"${color}\" font-size=\"${size}\" font-family=\"${fontFamily}\"${spacing}${anchorAttr}>${tspans}</text>`;
}

function baseSvg(inner, space) {
  const { width, height } = CANVAS;
  const bg = space || buildSpaceBackground({ width, height });
  const defs = `<style>${fontFaceCss()}</style>${bg.defs}`;

  return [
    `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${width}\" height=\"${height}\" viewBox=\"0 0 ${width} ${height}\">`,
    `<defs>${defs}</defs>`,
    bg.body,
    inner,
    `</svg>`,
  ].join("");
}

function buildRightFooter({
  brand = "sora-no-koe",
  dateLabel,
  x = CANVAS.width - TOK.rightFooter.xOffset,
  brandY = TOK.rightFooter.brandY,
  dateY = TOK.rightFooter.dateY,
  brandSize = TOK.rightFooter.brandSize,
  dateSize = TOK.rightFooter.dateSize,
  opacity = TOK.rightFooter.opacity,
  colors = null,
} = {}) {
  if (!brand && !dateLabel) return "";
  const resolved = colors || resolveColors();
  const metaOpacity = Number.isFinite(resolved?.textTheme?.meta?.opacity)
    ? resolved.textTheme.meta.opacity
    : opacity;
  const tracking = TOK.rightFooter.tracking;
  const brandLine = brand
    ? `<text x=\"${x}\" y=\"${brandY}\" text-anchor=\"end\" fill=\"${resolved.textDim}\" opacity=\"${metaOpacity}\" font-size=\"${brandSize}\" font-family=\"SoraTitle\" letter-spacing=\"${tracking}em\">${escapeXml(brand)}</text>`
    : "";
  const dateLine = dateLabel
    ? `<text x=\"${x}\" y=\"${dateY}\" text-anchor=\"end\" fill=\"${resolved.textDim}\" opacity=\"${metaOpacity}\" font-size=\"${dateSize}\" font-family=\"SoraTitle\" letter-spacing=\"${tracking}em\">${escapeXml(dateLabel)}</text>`
    : "";
  return `${brandLine}${dateLine}`;
}

function buildSectionHeader({ label, x, y, lineWidth, colors = null }) {
  const resolved = colors || resolveColors();
  const lineX = x + TOK.header.lineOffsetX;
  const lineY = y + TOK.header.lineOffsetY;
  const ruleOpacity = Number.isFinite(resolved?.textTheme?.rule?.opacity)
    ? resolved.textTheme.rule.opacity
    : 0.28;
  const line = `<line x1=\"${lineX}\" y1=\"${lineY}\" x2=\"${lineX + lineWidth}\" y2=\"${lineY}\" stroke=\"${resolved.line}\" stroke-width=\"${TOK.header.lineStroke}\" stroke-opacity=\"${ruleOpacity}\"/>`;
  const text = `<text x=\"${x}\" y=\"${y}\" fill=\"${resolved.textSub}\" font-size=\"${TOK.header.size}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.header.tracking}em\">${escapeXml(label)}</text>`;
  return `${text}${line}`;
}

async function renderSvgToPng(svg) {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

module.exports = {
  CANVAS,
  TOK,
  escapeXml,
  formatDateLabel,
  wrapLines,
  glyphTextLine,
  richTextLine,
  textBlock,
  baseSvg,
  buildRightFooter,
  buildSectionHeader,
  renderSvgToPng,
};
