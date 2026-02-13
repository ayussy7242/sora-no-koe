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

function asOfIsoFromDateLocalJST(dateLocal) {
  // JST 12:00 == UTC 03:00
  return `${dateLocal}T03:00:00.000Z`;
}

module.exports = { ymdInTimeZone, toDateLocalJST, asOfIsoFromDateLocalJST };
