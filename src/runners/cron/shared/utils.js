"use strict";

const { toDateLocalJST, isYYYYMMDD } = require("../../../utils/time");

function nowIso(ms = Date.now()) {
  return new Date(ms).toISOString();
}

function parseJsonSafe(raw) {
  try {
    return JSON.parse(String(raw || ""));
  } catch (_) {
    return null;
  }
}

function addDaysToDateLocalJST(dateLocal, offsetDays) {
  if (!isYYYYMMDD(dateLocal)) return dateLocal;
  const base = new Date(`${dateLocal}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return dateLocal;
  const shiftMs = Number(offsetDays) * 86400000;
  if (!Number.isFinite(shiftMs) || shiftMs === 0) return dateLocal;
  const shifted = new Date(base.getTime() + shiftMs);
  return toDateLocalJST(shifted);
}

function safePreview(text, maxLen = 80) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const chars = Array.from(raw);
  if (chars.length <= maxLen) return raw;
  return chars.slice(0, Math.max(0, maxLen - 1)).join("") + "…";
}

module.exports = {
  nowIso,
  parseJsonSafe,
  addDaysToDateLocalJST,
  safePreview,
};
