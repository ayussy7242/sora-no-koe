"use strict";

/**
 * keys.js
 * - render 内で使う “キー生成/テンプレ埋め” を集約
 * - 副作用なし / story不要
 * - Set や Map の dedupe 用に “同じ入力→同じ文字列” を保証する
 */

/**
 * personal TP 用の dedupe key
 * @param {object} tp
 * @returns {string}
 */
function tpKey(tp) {
  if (!tp) return "";
  return `${tp.natal_body_or_point || ""}|${tp.transit_body || ""}|${tp.aspect || tp.type || ""}`;
}

/**
 * public sky contact 用の dedupe key
 * @param {object} r
 * @returns {string}
 */
function skyKey(r) {
  if (!r) return "";
  return `${r.a || ""}|${r.b || ""}|${r.type || ""}`;
}

/**
 * シンプルなテンプレ埋め： "{word}" を vars.word で置換
 * - 未定義は "" に倒す（落とさない）
 * - render_copy / blend のテンプレ向け
 * @param {string} str
 * @param {object} vars
 * @returns {string}
 */
function tplFill(str, vars = {}) {
  return String(str || "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}

module.exports = {
  tpKey,
  skyKey,
  tplFill,
};
