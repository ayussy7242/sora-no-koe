"use strict";

const { SIGN_EN, SIGN_SYMBOL } = require("../shared");

function formatSignEnglish(meta) {
  if (!meta) return "";
  const key = meta.sign_key || "";
  const sym = SIGN_SYMBOL[key] || "";
  const en = SIGN_EN[key] || meta.sign_ja || "";
  return `${sym} ${en}`.trim();
}

function formatSignEnglishWithDegree(meta) {
  if (!meta) return "";
  const mm = String(meta.min).padStart(2, "0");
  const key = meta.sign_key || "";
  const sym = SIGN_SYMBOL[key] || "";
  const en = SIGN_EN[key] || meta.sign_ja || "";
  const deg = Number.isFinite(meta.deg) ? `${meta.deg}°${mm}’` : "";
  return `${sym} ${en} ${deg}`.trim();
}

function formatSignEnglishName(meta) {
  if (!meta) return "";
  const key = meta.sign_key || "";
  return SIGN_EN[key] || meta.sign_ja || "";
}

function stripCountsLine(text) {
  const raw = String(text || "");
  const lines = raw.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return "";
  if (/^(?:🔥|🏃|🪨|💨|💧)/.test(lines[0]) && /[0-9]/.test(lines[0])) {
    return lines.slice(1).join("\n");
  }
  return raw;
}

module.exports = {
  formatSignEnglish,
  formatSignEnglishWithDegree,
  formatSignEnglishName,
  stripCountsLine,
};
