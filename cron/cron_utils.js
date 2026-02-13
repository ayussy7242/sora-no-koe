"use strict";

// cron_utils.js
// - daily8 / rebuild8 など cron 系で共通の小物を集約

const { toDateLocalJST, asOfIsoFromDateLocalJST } = require("../engine/time_utils");

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toSafeText(x, maxLen = 4800) {
  const s = x == null ? "" : String(x);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function isNonEmptyText(x) {
  const s = x == null ? "" : String(x);
  return s.trim().length > 0;
}

function normLower(x, fallback = "") {
  const s = x == null ? "" : String(x);
  const t = s.trim().toLowerCase();
  return t || fallback;
}

function pickMode(x) {
  const m = normLower(x, "today");
  return m === "sky" ? "sky" : "today";
}

function pickTarget(x) {
  const t = normLower(x, "all");
  return t === "owner" ? "owner" : "all";
}

function pickNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function getLineUserIdFromUserDoc(user) {
  const a =
    user?.channels?.line?.line_user_id ||
    user?.channels?.line_user_id ||
    user?.line_user_id ||
    null;
  return a ? String(a) : null;
}

/**
 * renderer picker
 * - daily8 と同じ思想：存在するものを優先順で拾う
 * - これにより「renderer差し替えたのに rebuild だけ反映されない」を防ぐ
 */
function pickRenderer(renderers) {
  if (typeof renderers?.renderKyou === "function") return renderers.renderKyou.bind(renderers);
  if (typeof renderers?.renderToday === "function") return renderers.renderToday.bind(renderers);
  if (typeof renderers?.renderLineToday === "function") return renderers.renderLineToday.bind(renderers);
  if (typeof renderers?.renderLine === "function") return renderers.renderLine.bind(renderers);
  return null;
}

module.exports = {
  isYYYYMMDD,
  toDateLocalJST,
  asOfIsoFromDateLocalJST,
  toSafeText,
  isNonEmptyText,
  normLower,
  pickMode,
  pickTarget,
  pickNum,
  clamp,
  getLineUserIdFromUserDoc,
  pickRenderer,
};
