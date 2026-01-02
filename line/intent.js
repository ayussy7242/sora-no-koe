"use strict";

/**
 * line/intent.js
 * 🌌 LINEコマンドの唯一の正規判定点（UNIFIED STABLE）
 *
 * Goals:
 * - normalizeは “ここだけ” が真実
 * - 日本語ゆれ / 英語 / 記号 / 絵文字 / スペース を吸収
 * - intentFromCommand は routes/line.js が信頼してよい単一判定点
 */

function normalizeText(text) {
  return String(text ?? "")
    .trim()
    .replace(/\u3000/g, " ")   // 全角スペース→半角
    .replace(/\s+/g, " ");     // 連続スペースつぶす
}

function stripDecorations(text) {
  // 絵文字・装飾っぽいものを落とす（必要なら追加）
  return String(text)
    .replace(/[🌌✨⭐️💫🩷🩵💙♾️🛜👽🔥☀️🌙🛸📡📮🕊️]+/g, "");
}

function stripPunct(text) {
  // 記号を落とす
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

  // lower（英語系）
  t = t.toLowerCase();

  // 最後にスペース全削除（コマンド判定は “塊” で見る）
  t = t.replace(/\s+/g, "");

  return t;
}

const INTENT = Object.freeze({
  // core
  START: "start",
  PUBLIC_SKY: "public_sky",
  PERSONAL_TODAY: "personal_today",
  NATAL: "natal_list",

  // utilities（routes/line.js の utilities layer で使う想定）
  HELP: "help",
  RESET: "reset",
  CANCEL: "cancel",
  PING: "ping",
  TEST: "test",
});

/**
 * 同義語マップ
 * normalizeForCommand 後の “正規化キー” で判定する
 */
const MAP = new Map([
  // START / 登録導線
  ["はじめる", INTENT.START],
  ["はじめて", INTENT.START],
  ["開始", INTENT.START],
  ["スタート", INTENT.START],
  ["start", INTENT.START],
  ["begin", INTENT.START],
  ["register", INTENT.START],

  // PERSONAL_TODAY（個人）
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
  ["わたしのほし", INTENT.NATAL],
  ["わたし", INTENT.NATAL], // 迷いやすいけど導線としては有効
  ["ネイタル", INTENT.NATAL],
  ["ネイタルチャート", INTENT.NATAL],
  ["出生図", INTENT.NATAL],
  ["natal", INTENT.NATAL],

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
  ["てすと", INTENT.PING],

  // TEST
  ["test", INTENT.TEST],
  ["テスト", INTENT.TEST],
]);

function intentFromCommand(rawText) {
  const key = normalizeForCommand(rawText);
  if (!key) return null;
  return MAP.get(key) || null;
}

/**
 * 不明入力（出生情報で使う）
 * normalizeForCommand後のキーで判定
 */
function isUnknown(text) {
  const t = normalizeForCommand(text);
  return /^(不明|unknown|dontknow|わからない|分からない|知らない)$/i.test(t);
}

module.exports = {
  INTENT,
  normalizeText,
  normalizeForCommand,
  intentFromCommand,
  isUnknown,
};
