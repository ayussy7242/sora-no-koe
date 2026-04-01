"use strict";

// parse.js
// - small, shared parsers for query/body/opts

const { clamp } = require("./math");

function toNumberSafe(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function boolish(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v !== "string") return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function normLower(x, fallback = "") {
  const s = x == null ? "" : String(x);
  const t = s.trim().toLowerCase();
  return t || fallback;
}

function parseYYYYMMDD(text) {
  const t = String(text || "").trim();
  const m1 = t.match(/(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/);
  if (m1) {
    const cand = String(m1[1]).trim().replace(/[\/\.]/g, "-");
    const mm = cand.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!mm) return null;
    const y = mm[1];
    const mo = String(mm[2]).padStart(2, "0");
    const d = String(mm[3]).padStart(2, "0");
    const dateLocal = `${y}-${mo}-${d}`;
    const dt = new Date(`${dateLocal}T00:00:00.000Z`);
    if (Number.isNaN(dt.getTime())) return null;
    if (dt.toISOString().slice(0, 10) !== dateLocal) return null;
    return dateLocal;
  }

  const m2 = t.match(/(\d{8})/);
  if (m2) {
    const s = m2[1];
    const y = s.slice(0, 4);
    const mo = s.slice(4, 6);
    const d = s.slice(6, 8);
    const dateLocal = `${y}-${mo}-${d}`;
    const dt = new Date(`${dateLocal}T00:00:00.000Z`);
    if (Number.isNaN(dt.getTime())) return null;
    if (dt.toISOString().slice(0, 10) !== dateLocal) return null;
    return dateLocal;
  }

  return null;
}

function parseHHMM(text) {
  const t = String(text || "").trim();
  const m = t.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function normalizeDigits(text) {
  return String(text || "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0))
    .trim();
}

function parseSelectionIndex(text) {
  const t = normalizeDigits(text);
  const m = t.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

module.exports = {
  toNumberSafe,
  clamp,
  boolish,
  normLower,
  parseYYYYMMDD,
  parseHHMM,
  normalizeDigits,
  parseSelectionIndex,
};
