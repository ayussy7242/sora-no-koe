"use strict";

const { boolish, toNumberSafe, normLower } = require("../../utils/parse");
const {
  isYYYYMMDD,
  toDateLocalJST,
  asOfIsoFromDateLocalJST,
  isValidISO,
  normalizeDateTimeLocalJST,
} = require("../../utils/time_utils");

function getRequestParts(req) {
  return { q: req.query || {}, b: req.body || {} };
}

function pickMode({ q, b } = {}) {
  const m = normLower(b?.mode ?? q?.mode, "today");
  return m === "sky" ? "sky" : "today";
}

function pickTarget({ q, b } = {}) {
  const t = normLower(b?.target ?? q?.target, "all");
  return t === "owner" ? "owner" : "all";
}

function pickDateLocal({ q, b, fallbackNow = true } = {}) {
  const raw = b?.date_local ?? q?.date_local;
  if (isYYYYMMDD(raw)) return String(raw);
  return fallbackNow ? toDateLocalJST() : null;
}

function pickAsOfISO({ q, b, dateLocal = null, fallbackFromDateLocal = false } = {}) {
  const asOfRaw = b?.as_of ?? q?.as_of;
  if (isValidISO(asOfRaw)) return String(asOfRaw);

  const dtLocalRaw = b?.datetime_local ?? q?.datetime_local;
  const dtLocal = normalizeDateTimeLocalJST(dtLocalRaw);
  if (dtLocal) return dtLocal;

  if (fallbackFromDateLocal && dateLocal) return asOfIsoFromDateLocalJST(dateLocal);
  return null;
}

function pickDryRun({ q, b } = {}) {
  return boolish(b?.dryRun ?? q?.dryRun ?? b?.dry_run ?? q?.dry_run);
}

function pickBoolFlag({ q, b, keys = [], defaultValue = undefined } = {}) {
  for (const key of keys) {
    const hit = b?.[key] ?? q?.[key];
    if (hit !== undefined) return boolish(hit);
  }
  return defaultValue;
}

function pickNumberFlag({ q, b, keys = [], defaultValue = undefined } = {}) {
  for (const key of keys) {
    const hit = b?.[key] ?? q?.[key];
    if (hit !== undefined) return toNumberSafe(hit, defaultValue);
  }
  return defaultValue;
}

module.exports = {
  getRequestParts,
  pickMode,
  pickTarget,
  pickDateLocal,
  pickAsOfISO,
  pickDryRun,
  pickBoolFlag,
  pickNumberFlag,
};
