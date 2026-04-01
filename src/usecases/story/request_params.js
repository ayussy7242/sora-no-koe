"use strict";

const {
  isYYYYMMDD,
  toDateLocalJST,
  toDateTimeLocalJST,
  isValidISO,
  normalizeDateTimeLocalJST,
} = require("../../utils/time");

function pickAppUserId(req) {
  return req.query.app_user_id || req.header("x-app-user-id") || "public";
}

/**
 * routes の “mode” は storyService の mode と別物として扱う
 * - req.mode: now | public | auto | (default)
 * - storyService mode: public | auto のみ
 */
function resolveStoryMode(reqMode, appUserId) {
  const m = String(reqMode || "").trim().toLowerCase();

  if (m === "auto") return "auto";
  if (m === "public") return "public";

  return String(appUserId) === "public" ? "public" : "auto";
}

/**
 * “as_of をどう決めるか” を統一
 * 優先順位:
 * 1) ?as_of=... (完全指定)
 * 2) ?datetime_local=... (JSTとして解釈してISO化)
 * 3) default: NOW (new Date().toISOString())
 */
function resolveAsOfISO(req) {
  const asOfRaw = req.query.as_of;
  if (isValidISO(asOfRaw)) return String(asOfRaw);

  const dtLocal = normalizeDateTimeLocalJST(req.query.datetime_local);
  if (dtLocal) return dtLocal;

  return toDateTimeLocalJST();
}

/**
 * “date_local をどう決めるか”
 * - 明示指定があればそれ（YYYY-MM-DDのみ）
 * - 無ければ “今のJST日付”
 */
function resolveDateLocal(req) {
  const dateLocalRaw = req.query.date_local;
  if (isYYYYMMDD(dateLocalRaw)) return String(dateLocalRaw);
  return toDateLocalJST();
}

module.exports = {
  pickAppUserId,
  resolveStoryMode,
  resolveAsOfISO,
  resolveDateLocal,
};
