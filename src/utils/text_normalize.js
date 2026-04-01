"use strict";

function safeTrim(value) {
  return String(value ?? "").trim();
}

function normalizeInlineText(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMultilineText(text, opts = {}) {
  const collapseInlineSpaces = opts.collapseInlineSpaces !== false;
  const collapseBlankLines = opts.collapseBlankLines !== false;
  let out = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (collapseInlineSpaces) {
    out = out.replace(/[ \t]+/g, " ");
  }
  if (collapseBlankLines) {
    out = out.replace(/\n{3,}/g, "\n\n");
  }
  return out.trim();
}

module.exports = {
  safeTrim,
  normalizeInlineText,
  normalizeMultilineText,
};
