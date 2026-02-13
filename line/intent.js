"use strict";

/**
 * line/intent.js
 * 🌌 LINEコマンドの唯一の正規判定点（UNIFIED STABLE）
 *
 * Goals:
 * - normalizeは “ここだけ” が真実
 * - 日本語ゆれ / 英語 / 記号 / 絵文字 / スペース を吸収
 * - intentFromcommand は routes/line.js が信頼してよい単一判定点
 */

function normalizeText(text) {
  return String(text ?? "")
    .trim()
    .replace(/\u3000/g, " ")  // 全角スペース→半角
    .replace(/\s+/g, " ");   // 連続スペースつぶす
}

function stripDecorations(text) {
  // ざっくり「装飾」だけ落とす（安全側）
  // ※絵文字全般を完全除去は難しいので、よく使う系を削る
  return String(text).replace(/[🌌✨⭐️💫🩷🩵💙♾️🛜👽🔥☀️🌙🛸📡📮🕊️]+/g, "");
}

function stripPunct(text) {
  return String(text)
    .replace(/[！!？?。．,.、，・:;／/\\\-_—~〜…'"“”‘’]+/g, "")
    .replace(/[【】「」『』（）()\[\]{}<>]/g, "");
}

/**
 * normalizeForCommand:
 * - lower化（英語コマンド安定）
 * - スペースを最終的に全部消す（"わたし の ほし" を拾う）
 */
function normalizeForCommand(text) {
  let t = normalizeText(text);
  t = stripDecorations(t);
  t = stripPunct(t);
  t = normalizeText(t);
  t = t.toLowerCase();
  t = t.replace(/\s+/g, "");
  return t;
}

const INTENT = Object.freeze({
  START: "start",
  PUBLIC_SKY: "public_sky",
  PERSONAL_TODAY: "personal_today",
  NATAL: "natal_list",
  ANSHIN: "anshin",

  HELP: "help",
  RESET: "reset",
  CANCEL: "cancel",
  PING: "ping",
  TEST: "test",
});

const SORA_MODE = Object.freeze({
  SORA_TOP: "sora_top",
  SORA_ALL: "sora_all",
  SORA_URA: "sora_ura",
  SORA_URA_SILENT: "sora_ura_silent",
  SORA_URA_RARE: "sora_ura_rare",
  SORA_URA_HARMONY: "sora_ura_harmony",
});

const { SORA_ALIAS_ENTRIES } = require("./sora_alias");

const MAP = new Map([
  // START / 登録導線
  ["はじめる", INTENT.START],
  ["はじめて", INTENT.START],
  ["開始", INTENT.START],
  ["スタート", INTENT.START],
  ["start", INTENT.START],
  ["begin", INTENT.START],
  ["register", INTENT.START],

  // PERSONAL_TODAY（個人 or 自動）
  ["今日", INTENT.PERSONAL_TODAY],
  ["きょう", INTENT.PERSONAL_TODAY],
  ["今日の星", INTENT.PERSONAL_TODAY],
  ["今日のほし", INTENT.PERSONAL_TODAY],
  ["きょうのほし", INTENT.PERSONAL_TODAY],
  ["today", INTENT.PERSONAL_TODAY],

  // PUBLIC_SKY（公開）
  ["そら", INTENT.PUBLIC_SKY],
  ["空", INTENT.PUBLIC_SKY],
  ["今日の空", INTENT.PUBLIC_SKY],
  ["きょうのそら", INTENT.PUBLIC_SKY],
  ["宇宙", INTENT.PUBLIC_SKY],
  ["sky", INTENT.PUBLIC_SKY],
  ["public", INTENT.PUBLIC_SKY],

  // NATAL
  ["ほし", INTENT.NATAL],
  ["星", INTENT.NATAL],
  ["わたしのほし", INTENT.NATAL],
  ["わたしの星", INTENT.NATAL],
  ["私のほし", INTENT.NATAL],
  ["私の星", INTENT.NATAL],
  ["ネイタル", INTENT.NATAL],
  ["ネイタルチャート", INTENT.NATAL],
  ["出生図", INTENT.NATAL],
  ["natal", INTENT.NATAL],

  // ANSHIN
  ["あんしん", INTENT.ANSHIN],
  ["安心", INTENT.ANSHIN],
  ["わたしのあんしん", INTENT.ANSHIN],
  ["私のあんしん", INTENT.ANSHIN],
  ["わたしの安心", INTENT.ANSHIN],
  ["私の安心", INTENT.ANSHIN],
  ["あんしんねいたる", INTENT.ANSHIN],
  ["安心ネイタル", INTENT.ANSHIN],

  // HELP
  ["help", INTENT.HELP],
  ["へるぷ", INTENT.HELP],
  ["ヘルプ", INTENT.HELP],
  ["使い方", INTENT.HELP],
  ["コマンド", INTENT.HELP],

  // RESET
  ["reset", INTENT.RESET],
  ["りせっと", INTENT.RESET],
  ["リセット", INTENT.RESET],
  ["初期化", INTENT.RESET],

  // CANCEL
  ["cancel", INTENT.CANCEL],
  ["やめる", INTENT.CANCEL],
  ["中止", INTENT.CANCEL],
  ["停止", INTENT.CANCEL],

  // PING
  ["ping", INTENT.PING],
  ["疎通", INTENT.PING],

  // TEST
  ["test", INTENT.TEST],
  ["てすと", INTENT.TEST],
  ["テスト", INTENT.TEST],
]);

const SORA_MAP = new Map(
  SORA_ALIAS_ENTRIES.map(({ alias, mode }) => [normalizeForCommand(alias), mode])
);

function intentFromcommand(rawText) {
  const key = normalizeForCommand(rawText);
  if (!key) return null;
  return MAP.get(key) || null;
}

function soraModeFromCommand(rawText) {
  const key = normalizeForCommand(rawText);
  if (!key) return null;
  return SORA_MAP.get(key) || null;
}

function isunknown(text) {
  const t = normalizeForCommand(text);
  return /^(不明|unknown|dontknow|わからない|分からない|知らない)$/i.test(t);
}

module.exports = {
  INTENT,
  SORA_MODE,
  normalizeText,
  normalizeForCommand,
  intentFromcommand,
  soraModeFromCommand,
  isunknown,
};
