"use strict";

/**
 * Text normalization utilities for v2.
 * This is where post-process can shorten output.
 * If text feels trimmed, inspect tidyConsolidatedText + limits.
 */
function normalizeParagraph(text) {
  let out = String(text || "").trim();
  if (!out) return "";
  out = out.replace(/\r/g, "");
  out = out.replace(/\\n/g, "\n");
  out = out
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

function coerceText(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.join("\n");
  if (value && typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    if (typeof value.value === "string") return value.value;
    if (Array.isArray(value.lines)) return value.lines.join("\n");
    if (Array.isArray(value.items)) return value.items.join("\n");
    const collected = [];
    for (const v of Object.values(value)) {
      if (typeof v === "string") collected.push(v);
      else if (Array.isArray(v)) collected.push(v.filter((s) => typeof s === "string").join("\n"));
      else if (v && typeof v === "object" && typeof v.text === "string") collected.push(v.text);
    }
    if (collected.length) return collected.join("\n");
  }
  return String(value || "");
}

function normalizedLength(text) {
  return Array.from(String(text || "").replace(/\s/g, "")).length;
}

function splitSentences(text) {
  return String(text || "")
    .split(/[。！？]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tidyConsolidatedText(text, { minSentences = 3, maxSentences = 5 } = {}) {
  let out = normalizeParagraph(text);
  if (!out) return out;
  const sentences = splitSentences(out);
  const uniq = [];
  const seen = new Set();
  for (const s of sentences) {
    const key = s.replace(/[、。「」\s]/g, "");
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(s);
  }
  const sliced = uniq.slice(0, maxSentences);
  if (sliced.length < minSentences) {
    return out;
  }
  out = sliced.join("。");
  if (out && !out.endsWith("。")) out = `${out}。`;
  return out;
}

function isTooShort(text, minChars) {
  const len = Array.from(String(text || "").replace(/\s/g, "")).length;
  return len < minChars;
}

function normalizeV2Text(text, { minSentences, maxSentences, minChars } = {}) {
  let out = normalizeParagraph(coerceText(text));
  if (!out) return "";
  out = out.replace(/モダリティ|モード/gi, "三区分");
  out = out
    .replace(/Cardinal/gi, "活動宮")
    .replace(/Fixed/gi, "不動宮")
    .replace(/Mutable/gi, "柔軟宮")
    .replace(/Cluster/gi, "集中型（クラスター）");
  if (!out) return "";
  // Do not trim or compress sentences here.
  // Keep raw output length unless explicitly requested elsewhere.
  if (isTooShort(out, minChars)) return out;
  return out;
}

function normalizeV2AspectText(text, limits) {
  const cfg = limits?.aspects?.item || {};
  return normalizeV2Text(text, {
    minSentences: cfg.minSentences ?? 2,
    maxSentences: cfg.maxSentences ?? 3,
    minChars: cfg.min ?? 0,
  });
}

function stripPlacementTokens(text) {
  let out = coerceText(text);
  if (!out) return "";
  out = out.replace(/(牡羊座|牡牛座|双子座|蟹座|獅子座|乙女座|天秤座|蠍座|射手座|山羊座|水瓶座|魚座)/g, "");
  out = out.replace(/\b(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)\b/gi, "");
  out = out.replace(/\d+\s*(?:°|度)/g, "");
  out = out.replace(/\b\d+\s*H\b/gi, "");
  out = out.replace(/\b\d+\s*ハウス\b/g, "");
  out = out.replace(/[|｜]/g, " ");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}

module.exports = {
  normalizeParagraph,
  coerceText,
  normalizedLength,
  splitSentences,
  tidyConsolidatedText,
  isTooShort,
  normalizeV2Text,
  normalizeV2AspectText,
  stripPlacementTokens,
};
