"use strict";

const { wrapLines } = require("../../../../../utils/text/wrap");

function estimateTextWidth(line, size) {
  const text = String(line || "");
  if (!text) return size * 2;
  const len = Array.from(text).length;
  return Math.max(size * 2, len * size * 0.82);
}

function normalizeCarouselBodyText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function resolveCarouselBodyLines({
  text,
  size,
  canvasWidth,
  marginX,
  maxChars = 22,
  minChars = 16,
  maxLines = 99,
  extraSafeWidth = 48,
} = {}) {
  const normalized = normalizeCarouselBodyText(text);
  if (!normalized) return [];

  const availableWidth = Math.max(80, Number(canvasWidth) - Number(marginX) * 2 - Number(extraSafeWidth || 0));
  let currentMaxChars = Math.max(1, Number(maxChars) || 22);
  const floor = Math.max(1, Number(minChars) || 16);
  let lines = [];

  while (currentMaxChars >= floor) {
    lines = wrapLines(normalized, {
      maxChars: currentMaxChars,
      maxLines,
      preserveNewlines: false,
      useHalfWidthWeight: true,
      preferNaturalBreaks: false,
    });
    const widest = lines.length
      ? Math.max(...lines.map((line) => estimateTextWidth(line, size)))
      : 0;
    if (widest <= availableWidth) return lines;
    currentMaxChars -= 1;
  }

  return lines;
}

function resolveCarouselTextLines({
  text,
  size,
  canvasWidth,
  marginX,
  maxChars = 18,
  minChars = 1,
  maxLines = 2,
  extraSafeWidth = 24,
} = {}) {
  const normalized = normalizeCarouselBodyText(text);
  if (!normalized) return [];

  const availableWidth = Math.max(40, Number(canvasWidth) - Number(marginX) * 2 - Number(extraSafeWidth || 0));
  let currentMaxChars = Math.max(1, Number(maxChars) || 1);
  const floor = Math.max(1, Number(minChars) || 1);
  let lines = [];

  while (currentMaxChars >= floor) {
    lines = wrapLines(normalized, {
      maxChars: currentMaxChars,
      maxLines,
      preserveNewlines: false,
      useHalfWidthWeight: true,
      preferNaturalBreaks: false,
    });
    const widest = lines.length
      ? Math.max(...lines.map((line) => estimateTextWidth(line, size)))
      : 0;
    if (widest <= availableWidth) return lines;
    currentMaxChars -= 1;
  }

  return lines;
}

module.exports = {
  estimateTextWidth,
  normalizeCarouselBodyText,
  resolveCarouselBodyLines,
  resolveCarouselTextLines,
};
