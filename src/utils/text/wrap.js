"use strict";

function charLength(value) {
  return Array.from(String(value || "")).length;
}

function isPreferredBreakChar(ch) {
  return /[。、．，…！？!?\s]/.test(String(ch || ""));
}

function isProtectedTimeChar(ch) {
  return /[0-9:./年月日時分+\-]/.test(String(ch || ""));
}

function charWeight(ch) {
  return /[\u0020-\u007E]/.test(String(ch || "")) ? 0.5 : 1;
}

function weightedLength(chars = []) {
  return chars.reduce((sum, ch) => sum + charWeight(ch), 0);
}

function resolveBreakIndex(chars, maxChars) {
  const limit = Math.min(chars.length, Math.max(1, Number(maxChars) || chars.length));
  if (chars.length <= limit) return chars.length;
  const minBacktrack = Math.max(1, limit - 20);

  for (let i = limit; i >= minBacktrack; i -= 1) {
    if (isPreferredBreakChar(chars[i - 1])) return i;
  }

  let idx = limit;
  while (
    idx > minBacktrack &&
    isProtectedTimeChar(chars[idx - 1]) &&
    isProtectedTimeChar(chars[idx])
  ) {
    idx -= 1;
  }
  return Math.max(1, idx);
}

function resolveWeightedBreakIndex(chars, maxChars) {
  const safeMax = Math.max(0.5, Number(maxChars) || 0.5);
  let weight = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const next = weight + charWeight(chars[i]);
    if (next > safeMax) {
      return Math.max(1, i);
    }
    weight = next;
  }
  return chars.length;
}

function wrapByChars(text, maxChars, maxLines = 2) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const chars = Array.from(raw);
  const limit = Number.isFinite(Number(maxChars)) ? Number(maxChars) : chars.length;
  const max = Number.isFinite(Number(maxLines)) ? Number(maxLines) : 2;
  if (chars.length <= limit) return [raw];
  const lines = [];
  let remaining = chars.slice();
  while (remaining.length && lines.length < max) {
    if (remaining.length <= limit) {
      lines.push(remaining.join(""));
      break;
    }
    const cut = resolveBreakIndex(remaining, limit);
    lines.push(remaining.slice(0, cut).join("").trimEnd());
    remaining = remaining.slice(cut);
  }
  return lines.slice(0, max);
}

function wrapLines(text, maxCharsOrOpts, maxLinesMaybe) {
  const raw = String(text || "");
  if (!raw.trim()) return [];

  let maxChars = 20;
  let maxLines = 3;
  let preserveNewlines = true;
  let preserveParagraphsOnly = false;
  let useHalfWidthWeight = false;
  let preferNaturalBreaks = true;

  if (typeof maxCharsOrOpts === "object" && maxCharsOrOpts !== null) {
    maxChars = Number.isFinite(Number(maxCharsOrOpts.maxChars)) ? Number(maxCharsOrOpts.maxChars) : maxChars;
    maxLines = Number.isFinite(Number(maxCharsOrOpts.maxLines)) ? Number(maxCharsOrOpts.maxLines) : maxLines;
    preserveNewlines = maxCharsOrOpts.preserveNewlines !== false;
    preserveParagraphsOnly = maxCharsOrOpts.preserveParagraphsOnly === true;
    useHalfWidthWeight = maxCharsOrOpts.useHalfWidthWeight === true;
    preferNaturalBreaks = maxCharsOrOpts.preferNaturalBreaks !== false;
  } else {
    maxChars = Number.isFinite(Number(maxCharsOrOpts)) ? Number(maxCharsOrOpts) : maxChars;
    maxLines = Number.isFinite(Number(maxLinesMaybe)) ? Number(maxLinesMaybe) : maxLines;
  }

  const segments = (() => {
    if (!preserveNewlines) return [raw];
    if (!preserveParagraphsOnly) return raw.split(/\r?\n/);

    return raw
      .split(/\r?\n\s*\r?\n/)
      .map((segment) => String(segment || "").replace(/\s*\r?\n\s*/g, " ").trim())
      .filter(Boolean);
  })();
  const lines = [];

  const pushWrapped = (segment) => {
    const trimmed = String(segment || "").trim();
    if (!trimmed) return;
    const chars = Array.from(trimmed);
    if ((useHalfWidthWeight ? weightedLength(chars) : chars.length) <= maxChars) {
      lines.push(trimmed);
      return;
    }
    let remaining = chars.slice();
    while (remaining.length && lines.length < maxLines) {
      if ((useHalfWidthWeight ? weightedLength(remaining) : remaining.length) <= maxChars) {
        lines.push(remaining.join(""));
        break;
      }
      const cut = (() => {
        if (useHalfWidthWeight) {
          const weightedCut = resolveWeightedBreakIndex(remaining, maxChars);
          if (!preferNaturalBreaks) return weightedCut;
          return resolveBreakIndex(remaining, weightedCut);
        }
        if (!preferNaturalBreaks) return Math.max(1, Math.min(remaining.length, maxChars));
        return resolveBreakIndex(remaining, maxChars);
      })();
      lines.push(remaining.slice(0, cut).join("").trimEnd());
      remaining = remaining.slice(cut);
    }
  };

  segments.forEach(pushWrapped);
  let out = lines.slice(0, maxLines);
  if (out.length > 1) {
    let last = out[out.length - 1] || "";
    const punctOnly = (value) => /^[。、．，…！？!?]+$/.test(String(value || "").trim());
    if (punctOnly(last)) {
      out[out.length - 2] = `${out[out.length - 2]}${last}`;
      out = out.slice(0, -1);
    } else if (/^[。、．，…！？!?]/.test(last)) {
      out[out.length - 2] = `${out[out.length - 2]}${last[0]}`;
      last = last.slice(1);
      if (last.trim()) {
        out[out.length - 1] = last;
      } else {
        out = out.slice(0, -1);
      }
    }
  }
  return out;
}

module.exports = {
  wrapByChars,
  wrapLines,
};
