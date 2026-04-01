"use strict";

// engine/time_utils.js
// - 日付/時刻の共通ヘルパー（JST / timezone）

function ymdInTimeZone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

function toDateLocalJST(date = new Date()) {
  return ymdInTimeZone(date, "Asia/Tokyo");
}

function formatDateLabel(dateLocal) {
  return String(dateLocal || "").replace(/-/g, ".");
}

function formatJstYmd(date, opts = {}) {
  const fallback = opts?.fallback != null ? String(opts.fallback) : "";
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return fallback;
  const ymd = toDateLocalJST(date);
  return ymd ? ymd.replace(/-/g, ".") : fallback;
}

function dateTimePartsInTimeZone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const out = {};
  for (const p of parts) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

function toDateTimeLocalJST(date = new Date()) {
  const { year, month, day, hour, minute, second } = dateTimePartsInTimeZone(date, "Asia/Tokyo");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}+09:00`;
}

function asOfIsoFromDateLocalJST(dateLocal) {
  // JST 12:00 == UTC 03:00
  return `${dateLocal}T03:00:00.000Z`;
}

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isValidISO(s) {
  if (typeof s !== "string" || !s) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

/**
 * datetime_local を “JST +09:00” として ISO化
 * - 受け付け例:
 *   1) 2026-01-23T18:10:00+09:00 (そのまま)
 *   2) 2026-01-23T18:10:00Z      (そのまま)
 *   3) 2026-01-23T18:10:00       (JSTとみなして +09:00 を付ける)
 *   4) 2026-01-23 18:10:00       (Tに直して +09:00)
 */
function normalizeDateTimeLocalJST(datetimeLocalRaw) {
  const s0 = String(datetimeLocalRaw || "").trim();
  if (!s0) return null;

  const s = s0.includes(" ") && !s0.includes("T") ? s0.replace(" ", "T") : s0;

  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    return isValidISO(s) ? s : null;
  }

  const withOffset = `${s}+09:00`;
  return isValidISO(withOffset) ? withOffset : null;
}

module.exports = {
  ymdInTimeZone,
  toDateLocalJST,
  formatDateLabel,
  formatJstYmd,
  dateTimePartsInTimeZone,
  toDateTimeLocalJST,
  asOfIsoFromDateLocalJST,
  isYYYYMMDD,
  isValidISO,
  normalizeDateTimeLocalJST,
};
