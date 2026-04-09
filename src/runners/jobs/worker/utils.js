"use strict";

const crypto = require("crypto");

function minutes(n) {
  return n * 60 * 1000;
}

function nowMs() {
  return Date.now();
}

function nowDate() {
  return new Date();
}

function randomId(len = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function getFetch() {
  if (typeof fetch === "function") return fetch;
  // Node18未満などの保険（入ってなければエラーになるが、その場合は push だけスキップされる）
  const mod = await import("node-fetch");
  return mod.default;
}

function toFixedPrecision(n, precisionDeg = 0.01) {
  const x = Number(n);
  const p = 1 / precisionDeg;
  return Math.round(x * p) / p;
}

function isFiniteNumber(x) {
  return typeof x === "number" && Number.isFinite(x);
}

function sha256Hex(str) {
  return crypto.createHash("sha256").update(String(str ?? ""), "utf8").digest("hex");
}

// deep clone（Firestoreの既存オブジェクトを破壊しないため）
function deepClone(v) {
  if (v === null || v === undefined) return v;
  if (typeof v !== "object") return v;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    // stringifyできない型が混じっても落とさない（最終防衛）
    return v;
  }
}

/**
 * 超軽量TZ対応（現要件：Asia/Tokyo を確実に通す）
 * - job.birth_utc_iso があればそれを優先
 * - 無ければ date_local + time_hm + tz から生成
 */
function birthUtcIsoFromJob(job) {
  if (job?.birth_utc_iso) return String(job.birth_utc_iso);

  const b = job?.birth || {};
  const dateLocal = b?.date_local || job?.date_local || null;
  const timeHm = b?.time_hm || job?.time_hm || null;
  const tz = b?.timezone || job?.timezone || null;

  if (!dateLocal) return null;
  // 時刻不明は 12:00 を仮置き（ASC/MC は近似値になる）
  const timeSafe = timeHm || "12:00";

  if (tz === "Asia/Tokyo" || !tz) {
    const iso = `${dateLocal}T${timeSafe}:00+09:00`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  // 将来拡張するならここ
  return null;
}

module.exports = {
  minutes,
  nowMs,
  nowDate,
  randomId,
  getFetch,
  toFixedPrecision,
  isFiniteNumber,
  sha256Hex,
  deepClone,
  birthUtcIsoFromJob,
};
