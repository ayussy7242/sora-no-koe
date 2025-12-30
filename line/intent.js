"use strict";

/**
 * line/intent.js
 * 🌌 LINEコマンドの唯一の正規判定点
 */

function normalizeText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeForCommand(text) {
  return normalizeText(text)
    // 絵文字・装飾を除去
    .replace(/[🌌✨⭐️💫🩷🩵💙♾️🛜👽🔥☀️🌙🛸📡📮🕊️]+/g, "")
    // 記号を除去
    .replace(/[！!？?。．,.、】【「」『』（）()\[\]{}<>]/g, "")
    .trim();
}

const INTENT = Object.freeze({
  PUBLIC_SKY: "public_sky",
  PERSONAL_TODAY: "personal_today",
  NATAL: "natal_list",
});

function intentFromCommand(rawText) {
  const t = normalizeForCommand(rawText);
  if (!t) return null;

  // 今日（personal）
  if (t === "今日" || t === "きょう" || t === "今日の星" || t === "今日のほし" || t === "きょうのほし") {
    return INTENT.PERSONAL_TODAY;
  }

  // そら（public）
  if (t === "そら" || t === "空" || t === "今日の空" || t === "きょうのそら" || t === "宇宙") {
    return INTENT.PUBLIC_SKY;
  }

  // わたしのほし（natal）
  if (t === "わたしのほし" || t === "わたし" || t === "ネイタル" || t === "ネイタルチャート" || t === "出生図") {
    return INTENT.NATAL;
  }

  return null;
}

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
