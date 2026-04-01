"use strict";

const ASPECT_LABEL_MAP = {
  conjunction: "コンジャンクション",
  conj: "コンジャンクション",
  opposition: "オポジション",
  opp: "オポジション",
  square: "スクエア",
  trine: "トライン",
  sextile: "セクスタイル",
  quincunx: "クインカンクス",
  inconjunct: "クインカンクス",
  quintile: "クインタイル",
  biquintile: "バイ・クインタイル",
  novile: "ノヴィル",
  septile: "セプタイル",
  semisextile: "セミセクスタイル",
  semisquare: "セミスクエア",
  sesquisquare: "セスキスクエア",
};

function aspectLabelJa(type, deg) {
  const key = String(type || "").toLowerCase();
  if (ASPECT_LABEL_MAP[key]) return ASPECT_LABEL_MAP[key];
  if (Number.isFinite(Number(deg))) return `${deg}°`;
  return String(type || "").toUpperCase();
}

module.exports = { ASPECT_LABEL_MAP, aspectLabelJa };
