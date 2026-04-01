"use strict";

const { countChars, splitTrailingHashtags, joinBodyAndTags } = require("../../utils/text/hashtag");
const {
  normalizeNewlines,
  collapseSpaces,
  collapseInlineSpaces,
  collapseBlankLines,
} = require("./text_utils");

function collapseBlankRuns(lines) {
  const out = [];
  let blankRun = 0;
  const flushBlanks = () => {
    if (blankRun <= 0) return;
    if (blankRun >= 3) {
      out.push("");
    } else {
      for (let i = 0; i < blankRun; i += 1) out.push("");
    }
    blankRun = 0;
  };

  for (const line of lines) {
    const isBlank = !String(line || "").trim();
    if (isBlank) {
      blankRun += 1;
      continue;
    }
    flushBlanks();
    out.push(line);
  }
  flushBlanks();

  return out;
}

function formatXAiText(text, opts = {}) {
  const normalizeSpaces = opts.normalizeSpaces !== false;
  const maxChars = Number.isFinite(Number(opts.maxChars)) ? Number(opts.maxChars) : 180;
  const raw = String(text || "").trim();
  if (!raw) return "";

  const { body, tags } = splitTrailingHashtags(raw);

  let base = String(body || "")
    .replace(/\r\n/g, "\n")
    .replace(/[。．.]\s*(?=\p{Extended_Pictographic})/gu, "")
    .replace(/(\p{Extended_Pictographic}\uFE0F?)。/gu, "$1");

  if (normalizeSpaces) {
    base = base.replace(/[ \t]+/g, " ");
  }

  base = base.replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])\s+([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, "$1\n$2");
  base = base.replace(/。\s*(?=\S)/g, "。\n\n");
  base = base.replace(/(\p{Extended_Pictographic}\uFE0F?)(?!\n)/gu, "$1\n\n");

  const rawLines = base.split("\n");
  const normalized = collapseBlankRuns(rawLines);

  const outLines = [];
  for (const line of normalized) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      outLines.push("");
      continue;
    }
    outLines.push(trimmed);
  }

  let cleaned = outLines;
  while (cleaned.length && !String(cleaned[cleaned.length - 1] || "").trim()) {
    cleaned = cleaned.slice(0, -1);
  }

  if (tags.length) {
    cleaned.push("", tags.join(" "));
  }

  let out = cleaned.join("\n").trim();

  if (maxChars && tags.length && countChars(out) > maxChars) {
    let curTags = tags.slice();
    while (curTags.length && countChars(out) > maxChars) {
      curTags.pop();
      const rebuilt = cleaned.slice(0, cleaned.length - 2);
      if (curTags.length) {
        rebuilt.push("", curTags.join(" "));
      }
      out = rebuilt.join("\n").trim();
    }
  }

  return out;
}

function stripCodeFences(text) {
  const raw = String(text || "");
  if (!raw.includes("```")) return raw;
  const fenced = raw.match(/```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/);
  if (fenced && fenced[1]) return fenced[1].trim();
  return raw.replace(/```/g, "").trim();
}

function normalizeObservationLines(text) {
  const raw = normalizeNewlines(String(text || "")).trim();
  const lines = raw
    .split("\n")
    .map((line) => String(line || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines.join("\n");
}

function applyNormalizeRule(text, rule, opts = {}) {
  const r = String(rule || "").trim();
  if (!r) return text;
  switch (r) {
    case "trim":
      return String(text || "").trim();
    case "normalize_newlines":
      return normalizeNewlines(text);
    case "collapse_spaces":
      return collapseSpaces(normalizeNewlines(text));
    case "collapse_inline_spaces":
      return collapseInlineSpaces(normalizeNewlines(text));
    case "collapse_blank_lines":
      return collapseBlankLines(normalizeNewlines(text));
    case "normalize_observation_lines":
      return normalizeObservationLines(text);
    case "strip_code_fences":
      return stripCodeFences(text);
    case "format_x_text":
      return formatXAiText(text, opts?.xFormat || {});
    default:
      return text;
  }
}

function applyNormalizeRules(text, rules = [], opts = {}) {
  const list = Array.isArray(rules) ? rules : [rules];
  return list.reduce((acc, rule) => applyNormalizeRule(acc, rule, opts), String(text || ""));
}

module.exports = {
  applyNormalizeRules,
  applyNormalizeRule,
  formatXAiText,
  stripCodeFences,
  normalizeObservationLines,
};
