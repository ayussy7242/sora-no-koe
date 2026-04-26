"use strict";

const { boolish, toNumberSafe, normLower } = require("../../utils/data/parse");
const {
  isYYYYMMDD,
  toDateLocalJST,
  toDateTimeLocalJST,
  asOfIsoFromDateLocalJST,
  runtimeAsOfIsoFromDateLocalJST,
  isValidISO,
  normalizeDateTimeLocalJST,
} = require("../../utils/time");

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

function normalizeAsOfCandidate(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  // In query strings, "+" in timezone offsets is often decoded as a space.
  return text.replace(/(\d{2}:\d{2}:\d{2}(?:\.\d+)?) (\d{2}:\d{2})$/, "$1+$2");
}

function pickAsOfISO({ q, b, dateLocal = null, fallbackFromDateLocal = false } = {}) {
  const asOfRaw = normalizeAsOfCandidate(
    b?.as_of ?? q?.as_of ?? b?.asOfISO ?? q?.asOfISO
  );
  if (isValidISO(asOfRaw)) return String(asOfRaw);

  const dtLocalRaw = b?.datetime_local ?? q?.datetime_local;
  const dtLocal = normalizeDateTimeLocalJST(dtLocalRaw);
  if (dtLocal) return dtLocal;

  if (fallbackFromDateLocal && dateLocal) {
    return runtimeAsOfIsoFromDateLocalJST(dateLocal) || asOfIsoFromDateLocalJST(dateLocal);
  }
  return toDateTimeLocalJST();
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
