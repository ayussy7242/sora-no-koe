"use strict";
const { buildMoonPhaseGlyph: buildMoonPhaseGlyphShared } = require("../../../../shared/moon_glyph");

const { CANVAS, TOK, escapeXml, wrapLines, textBlock, baseSvg, buildSectionHeader, buildRightFooter, renderSvgToPng } = require("../common/shared");
const { measureTextWidth } = require("../common/glyph_layout");
const { resolveColors } = require("../../theme");
const { DEFAULT_MOON_LAYOUT } = require("../../../../shared/space_background");
const { clamp } = require("../../../../../utils/data/math");

const MOON_LAYOUT = DEFAULT_MOON_LAYOUT;

function estimateTextWidth(line, size) {
  const text = String(line || "");
  if (!text) return size * 2;
  const len = Array.from(text).length;
  return Math.max(size * 2, len * size * 0.82);
}

function resolveBodyMaxChars(size) {
  const available = CANVAS.width - TOK.marginX * 2;
  const perChar = size * 0.95;
  return Math.max(16, Math.floor(available / perChar));
}

function resolveObservationMaxWidth() {
  return CANVAS.width - TOK.marginX * 2;
}

function measureBodyTextWidth(text, size) {
  const raw = String(text || "");
  if (!raw) return 0;
  return Math.max(size * 2, measureTextWidth(raw, size, "body"));
}

function segmentObservationText(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const protectedDateTime = /\d{4}年\d{1,2}月\d{1,2}日\d{2}:\d{2}/y;
  const chunks = [];
  let buffer = "";
  let i = 0;

  while (i < raw.length) {
    protectedDateTime.lastIndex = i;
    const dt = protectedDateTime.exec(raw);
    if (dt && dt.index === i) {
      if (buffer) {
        chunks.push(buffer);
        buffer = "";
      }
      chunks.push(dt[0]);
      i += dt[0].length;
      continue;
    }

    const ch = raw[i];
    buffer += ch;
    if (/[。、！？!?]/.test(ch)) {
      chunks.push(buffer);
      buffer = "";
    }
    i += 1;
  }

  if (buffer) chunks.push(buffer);
  return chunks.filter(Boolean);
}

function findSafeSplitIndex(token, size, maxWidth) {
  const chars = Array.from(String(token || ""));
  if (!chars.length) return 0;
  let best = 0;
  let current = "";

  for (let i = 0; i < chars.length; i += 1) {
    const next = current + chars[i];
    if (measureBodyTextWidth(next, size) > maxWidth) break;
    current = next;
    best = i + 1;
  }

  if (best <= 0) return 1;

  const minBacktrack = Math.max(1, best - 8);
  for (let i = best; i >= minBacktrack; i -= 1) {
    const head = chars.slice(0, i).join("");
    const tail = chars.slice(i).join("");
    if (!head || !tail) continue;
    if (/[、。！？!?]$/.test(head)) return i;
    if (/[0-9年月日時:.]/.test(chars[i - 1]) && /[0-9年月日時:.]/.test(chars[i])) continue;
    if (/(てい|ます|でした|します|でしたが|ますが|ですが|へは|には|とは|では)$/.test(head)) continue;
    if (/^(ます|でした|します|が、|が。|が|は|を|に|へ|と|で|の)/.test(tail)) continue;
    if (/[ぁ-んァ-ンー]$/.test(head) && /^[ぁ-んァ-ンー]/.test(tail)) continue;
    return i;
  }

  return best;
}

function wrapObservationLines(text, size, maxLines = 5) {
  const chunks = segmentObservationText(text);
  if (!chunks.length) return [];
  const maxWidth = resolveObservationMaxWidth();
  const lines = [];
  let current = "";

  const pushCurrent = () => {
    const trimmed = current.trim();
    if (trimmed) lines.push(trimmed);
    current = "";
  };

  for (const chunk of chunks) {
    const candidate = current ? `${current}${chunk}` : chunk;
    if (measureBodyTextWidth(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    const currentWidth = measureBodyTextWidth(current, size);
    if (current && currentWidth < maxWidth * 0.72) {
      const splitAt = findSafeSplitIndex(candidate, size, maxWidth);
      lines.push(Array.from(candidate).slice(0, splitAt).join("").trim());
      current = Array.from(candidate).slice(splitAt).join("").trimStart();
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
      continue;
    }

    if (current) pushCurrent();

    let rest = chunk;
    while (rest) {
      if (measureBodyTextWidth(rest, size) <= maxWidth) {
        current = rest;
        rest = "";
        break;
      }
      const splitAt = findSafeSplitIndex(rest, size, maxWidth);
      lines.push(Array.from(rest).slice(0, splitAt).join("").trim());
      rest = Array.from(rest).slice(splitAt).join("").trimStart();
      if (lines.length >= maxLines) return lines.slice(0, maxLines);
    }

    if (lines.length >= maxLines) return lines.slice(0, maxLines);
  }

  if (current && lines.length < maxLines) pushCurrent();
  return lines.slice(0, maxLines);
}

function resolveNextLayout({ nextOffsetY = 0, lineCount = 2 } = {}) {
  const offset = Number(nextOffsetY) || 0;
  const lines = Math.max(1, Number(lineCount) || 1);
  const lineHeight = TOK.moon.nextLineHeight;
  const valueY = TOK.rightFooter.dateY + offset - lineHeight * (lines - 1);
  const labelY = valueY - TOK.moon.nextLineHeight;
  return { labelY, valueY };
}

function makeField({ x, y, w, h, pad = 12, weight = 1, feather = null, kind = "body" }) {
  const px = Number.isFinite(Number(pad)) ? Number(pad) : 0;
  return {
    x: x - px,
    y: y - px,
    w: w + px * 2,
    h: h + px * 2,
    weight,
    feather,
    kind,
  };
}

function getAvoidRegions({
  dateLabel,
  header = "今日の月",
  subLabel = "",
  phaseLabel = "",
  moonSign = "",
  moonAgeLabel = "",
  illuminationLabel = "",
  observation = "",
  nextLabel = "次の月",
  nextSymbol = "",
  nextPhaseLabel = "",
  nextMoonName = "",
  nextDate = "",
  nextOffsetY = 12,
  brand = "sora-no-koe",
} = {}) {
  const fields = [];
  const contentStartY = Number.isFinite(Number(TOK.moon.contentStartY))
    ? Number(TOK.moon.contentStartY)
    : Number(TOK.contentStartY);
  const contentOffsetY = Number.isFinite(contentStartY)
    ? contentStartY - MOON_LAYOUT.y
    : (Number(TOK.moon.contentOffsetY) || 0);
  const phaseSignLine = [phaseLabel, moonSign].filter(Boolean).join(" ");
  if (header) {
    const w = estimateTextWidth(header, TOK.header.size);
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.moon.headerY - TOK.header.size,
      w,
      h: TOK.header.size * 1.2,
      pad: 14,
      weight: 0.85,
      kind: "title",
    }));
  }
  if (subLabel) {
    const subLabelY = TOK.moon.headerY + TOK.subLabel.offsetY;
    const w = estimateTextWidth(subLabel, TOK.subLabel.size);
    fields.push(makeField({
      x: TOK.marginX,
      y: subLabelY - TOK.subLabel.size,
      w,
      h: TOK.subLabel.size * 1.3,
      pad: 12,
      weight: 0.75,
      kind: "subtitle",
    }));
  }
  if (phaseSignLine) {
    const w = estimateTextWidth(phaseSignLine, TOK.moon.phaseLabelSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: (TOK.moon.phaseLabelY + contentOffsetY) - TOK.moon.phaseLabelSize,
      w,
      h: TOK.moon.phaseLabelSize * 1.2,
      pad: 16,
      weight: 0.95,
      kind: "heroText",
    }));
  }
  const infoLines = [moonAgeLabel, illuminationLabel].filter(Boolean);
  if (infoLines.length) {
    const w = Math.max(...infoLines.map((l) => estimateTextWidth(l, TOK.moon.infoSize)));
    fields.push(makeField({
      x: TOK.marginX,
      y: (TOK.moon.infoY + contentOffsetY) - TOK.moon.infoSize,
      w,
      h: TOK.moon.infoLineHeight * infoLines.length,
      pad: 12,
      weight: 0.75,
      kind: "meta",
    }));
  }
  const observationMaxChars = resolveBodyMaxChars(TOK.moon.observationSize);
  const observationLines = wrapObservationLines(observation, TOK.moon.observationSize, 5);
  if (observationLines.length) {
    const w = Math.max(...observationLines.map((l) => estimateTextWidth(l, TOK.moon.observationSize)));
    fields.push(makeField({
      x: TOK.marginX,
      y: TOK.moon.observationY - TOK.moon.observationSize,
      w,
      h: TOK.moon.observationLineHeight * observationLines.length,
      pad: 16,
      weight: 0.9,
      kind: "body",
    }));
  }
  const nextPhaseLine = `${nextSymbol} ${nextPhaseLabel}`.trim();
  const nextNameDateLine = [nextMoonName, nextDate].filter(Boolean).join("　");
  const nextLines = [nextPhaseLine, nextNameDateLine].filter(Boolean);
  if (nextLabel) {
    const { labelY } = resolveNextLayout({ nextOffsetY, lineCount: nextLines.length || 1 });
    const w = estimateTextWidth(nextLabel, TOK.moon.nextLabelSize);
    fields.push(makeField({
      x: TOK.marginX,
      y: labelY - TOK.moon.nextLabelSize,
      w,
      h: TOK.moon.nextLabelSize * 1.2,
      pad: 12,
      weight: 0.75,
      kind: "meta",
    }));
  }
  if (nextLines.length) {
    const { valueY } = resolveNextLayout({ nextOffsetY, lineCount: nextLines.length });
    const w = Math.max(...nextLines.map((l) => estimateTextWidth(l, TOK.moon.nextSize)));
    fields.push(makeField({
      x: TOK.marginX,
      y: valueY - TOK.moon.nextSize,
      w,
      h: TOK.moon.nextLineHeight * nextLines.length,
      pad: 12,
      weight: 0.8,
      kind: "body",
    }));
  }
  if (dateLabel) {
    const w = estimateTextWidth(dateLabel, TOK.rightFooter.dateSize);
    fields.push(makeField({
      x: CANVAS.width - TOK.rightFooter.xOffset - w,
      y: TOK.rightFooter.dateY - TOK.rightFooter.dateSize,
      w,
      h: TOK.rightFooter.dateSize * 1.1,
      pad: 10,
      weight: 0.8,
      kind: "footer",
    }));
  }
  if (brand) {
    const w = estimateTextWidth(brand, TOK.rightFooter.brandSize);
    fields.push(makeField({
      x: CANVAS.width - TOK.rightFooter.xOffset - w,
      y: TOK.rightFooter.brandY - TOK.rightFooter.brandSize,
      w,
      h: TOK.rightFooter.brandSize * 1.15,
      pad: 10,
      weight: 0.8,
      kind: "footer",
    }));
  }
  return fields;
}

function buildMoonPhaseGlyph(opts) {
  return buildMoonPhaseGlyphShared(opts);
}

function buildSlideMoonSvg({
  dateLabel,
  header = "今日の月",
  subLabel = "",
  phaseSymbol = "◑",
  phaseLabel = "",
  moonSign = "",
  moonAgeLabel = "",
  illuminationLabel = "",
  observation = "",
  nextLabel = "次の月",
  nextSymbol = "",
  nextPhaseLabel = "",
  nextMoonName = "",
  nextDate = "",
  nextOffsetY = 12,
  moonIllumination = 0.5,
  moonWaxing = true,
  moonAgeDays = null,
  moonSize = MOON_LAYOUT.size,
  accentColor = "",
  space,
} = {}) {
  const colors = resolveColors(space);
  const accent = accentColor || colors.textMain;
  const marginX = TOK.marginX;
  const headerY = TOK.moon.headerY;
  const subLabelY = headerY + TOK.subLabel.offsetY;
  const contentStartY = Number.isFinite(Number(TOK.moon.contentStartY))
    ? Number(TOK.moon.contentStartY)
    : Number(TOK.contentStartY);
  const contentOffsetY = Number.isFinite(contentStartY)
    ? contentStartY - MOON_LAYOUT.y
    : (Number(TOK.moon.contentOffsetY) || 0);
  const moonScale = Number.isFinite(Number(TOK.moon.moonScale)) ? Number(TOK.moon.moonScale) : 1;
  const moonSymbolOffsetY = Number(TOK.moon.moonSymbolOffsetY) || 0;
  const moonX = MOON_LAYOUT.x;
  const moonY = MOON_LAYOUT.y + contentOffsetY + moonSymbolOffsetY;
  const phaseSignLine = [phaseLabel, moonSign].filter(Boolean).join(" ");
  const infoLines = [moonAgeLabel, illuminationLabel].filter(Boolean);
  const observationMaxChars = resolveBodyMaxChars(TOK.moon.observationSize);
  const observationLines = wrapObservationLines(observation, TOK.moon.observationSize, 5);
  const nextPhaseLine = `${nextSymbol} ${nextPhaseLabel}`.trim();
  const nextNameDateLine = [nextMoonName, nextDate].filter(Boolean).join("　");
  const nextLines = [nextPhaseLine, nextNameDateLine].filter(Boolean);
  const nextOpacity = 0.6;

  const inner = [
    buildSectionHeader({ label: header, x: marginX, y: headerY, lineWidth: TOK.header.lineWidth, colors }),
    subLabel
      ? `<text x=\"${marginX}\" y=\"${subLabelY}\" fill=\"${colors.textDim}\" font-size=\"${TOK.subLabel.size}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.subLabel.tracking}em\">${escapeXml(subLabel)}</text>`
      : "",
    buildMoonPhaseGlyph({
      id: "moon",
      x: moonX,
      y: moonY,
      size: Number(moonSize) * moonScale,
      illumination: moonIllumination,
      waxing: moonWaxing,
      moonAgeDays,
    }),
    phaseSignLine
      ? `<text x=\"${marginX}\" y=\"${TOK.moon.phaseLabelY + contentOffsetY}\" fill=\"${accent}\" font-size=\"${TOK.moon.phaseLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.moon.phaseLabelTracking}em\">${escapeXml(phaseSignLine)}</text>`
      : "",
    textBlock({
      x: marginX,
      y: TOK.moon.infoY + contentOffsetY,
      lines: infoLines,
      size: TOK.moon.infoSize,
      lineHeight: TOK.moon.infoLineHeight,
      color: colors.textDim,
      fontFamily: "SoraTitle",
      letterSpacing: TOK.moon.infoTracking,
    }),
    textBlock({
      x: marginX,
      y: TOK.moon.observationY + contentOffsetY,
      lines: observationLines,
      size: TOK.moon.observationSize,
      lineHeight: TOK.moon.observationLineHeight,
      color: colors.textMain,
      fontFamily: "SoraBody",
      letterSpacing: TOK.moon.observationTracking,
    }),
    (() => {
      const { labelY } = resolveNextLayout({ nextOffsetY, lineCount: nextLines.length || 1 });
      return `<text x=\"${marginX}\" y=\"${labelY}\" fill=\"${colors.textSub}\" opacity=\"${nextOpacity}\" font-size=\"${TOK.moon.nextLabelSize}\" font-family=\"SoraTitle\" letter-spacing=\"${TOK.moon.nextLabelTracking}em\">${escapeXml(nextLabel || "")}</text>`;
    })(),
    textBlock({
      x: marginX,
      y: resolveNextLayout({ nextOffsetY, lineCount: nextLines.length }).valueY,
      lines: nextLines,
      size: TOK.moon.nextSize,
      lineHeight: TOK.moon.nextLineHeight,
      color: colors.textSub,
      fontFamily: "SoraTitle",
      letterSpacing: TOK.moon.nextTracking,
    }),
    buildRightFooter({ dateLabel, colors }),
  ].join("");

  return baseSvg(inner, space);
}

async function renderSlideMoon(data) {
  const svg = buildSlideMoonSvg(data);
  return renderSvgToPng(svg);
}

module.exports = {
  buildSlide2BaseSvg: buildSlideMoonSvg,
  buildMoonPhaseGlyph,
  getAvoidRegions,
  getTextFields: getAvoidRegions,
  renderSlide2: renderSlideMoon,
};
