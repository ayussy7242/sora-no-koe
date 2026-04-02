"use strict";

const { SIGN_KEYS } = require("../shared");

function normalizeSymbol(glyph) {
  return String(glyph || "").replace(/\uFE0E|\uFE0F/g, "");
}

function calcAscLon(rowsAngles = []) {
  const ascRow = Array.isArray(rowsAngles) ? rowsAngles.find((row) => row?.key === "asc") : null;
  const meta = ascRow?.meta;
  const signKey = meta?.sign_key;
  const idx = SIGN_KEYS.indexOf(String(signKey || ""));
  if (idx < 0) return null;
  const deg = Number(meta?.deg);
  if (!Number.isFinite(deg)) return null;
  const min = Number(meta?.min);
  const minPart = Number.isFinite(min) ? min / 60 : 0;
  return idx * 30 + deg + minPart;
}

function calcMcLon(rowsAngles = []) {
  const mcRow = Array.isArray(rowsAngles) ? rowsAngles.find((row) => row?.key === "mc") : null;
  const meta = mcRow?.meta;
  const signKey = meta?.sign_key;
  const idx = SIGN_KEYS.indexOf(String(signKey || ""));
  if (idx < 0) return null;
  const deg = Number(meta?.deg);
  if (!Number.isFinite(deg)) return null;
  const min = Number(meta?.min);
  const minPart = Number.isFinite(min) ? min / 60 : 0;
  return idx * 30 + deg + minPart;
}

function splitSentences(text) {
  return String(text || "")
    .replace(/([。！？])/g, "$1\n")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripStructureSymbols(text) {
  return String(text || "")
    .replace(/[\u0000-\u001f\u007f\uFEFF\uFFFD]/g, "")
    .replace(/[▲■◆●△□◇○☒]/g, "")
    .replace(
      /(?:火|地|風|水)\s*\d+\s*[/／]\s*(?:火|地|風|水)\s*\d+\s*[/／]\s*(?:火|地|風|水)\s*\d+\s*[/／]\s*(?:火|地|風|水)\s*\d+/g,
      ""
    )
    .replace(
      /(?:火|地|風|水)\s*\d+\s*(?:火|地|風|水)\s*\d+\s*(?:火|地|風|水)\s*\d+\s*(?:火|地|風|水)\s*\d+/g,
      ""
    )
    .replace(
      /(?:活動|不動|柔軟)\s*\d+\s*[/／]\s*(?:活動|不動|柔軟)\s*\d+\s*[/／]\s*(?:活動|不動|柔軟)\s*\d+/g,
      ""
    )
    .replace(
      /(?:活動|不動|柔軟)\s*\d+\s*(?:活動|不動|柔軟)\s*\d+\s*(?:活動|不動|柔軟)\s*\d+/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeSentences(text, limit) {
  const sentences = splitSentences(text);
  if (!sentences.length) return "";
  return sentences.slice(0, Math.max(1, limit)).join("");
}

function collectElementCounts(rowsMain = []) {
  const counts = { fire: 0, earth: 0, air: 0, water: 0 };
  rowsMain.forEach((row) => {
    const element = row?.meta?.element;
    if (element && counts[element] !== undefined) counts[element] += 1;
  });
  return counts;
}

function collectModalityCounts(rowsMain = []) {
  const counts = { cardinal: 0, fixed: 0, mutable: 0 };
  rowsMain.forEach((row) => {
    const modality = row?.meta?.modality;
    if (modality && counts[modality] !== undefined) counts[modality] += 1;
  });
  return counts;
}

function buildParagraphs(text) {
  const raw = String(text || "").replace(/\r/g, "").trim();
  if (!raw) return [];
  const blocks = raw
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+/g, " ").trim())
    .filter(Boolean);
  if (blocks.length > 1) return blocks;
  const sentences = splitSentences(raw);
  return sentences.map((sentence) => {
    const first = sentence.indexOf("、");
    if (first < 0) return sentence;
    const second = sentence.indexOf("、", first + 1);
    if (second < 0) return sentence;
    return `${sentence.slice(0, first + 1)}\n${sentence.slice(first + 1).trim()}`;
  });
}

module.exports = {
  normalizeSymbol,
  calcAscLon,
  calcMcLon,
  splitSentences,
  stripStructureSymbols,
  summarizeSentences,
  collectElementCounts,
  collectModalityCounts,
  buildParagraphs,
};
