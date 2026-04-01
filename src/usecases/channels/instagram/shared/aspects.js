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

const ASPECT_CIRCUITS = {
  conjunction: "重なりの回路",
  opposition: "向かい合う回路",
  square: "摩擦と調整の回路",
  trine: "流れの回路",
  sextile: "接点の回路",
  quincunx: "噛み合わせの回路",
  inconjunct: "噛み合わせの回路",
  semisextile: "かすかな接点の回路",
  semi_sextile: "かすかな接点の回路",
  semisquare: "小さな引っかかりの回路",
  semi_square: "小さな引っかかりの回路",
  sesquisquare: "蓄積した摩擦の回路",
  quintile: "創造が立ち上がる回路",
  biquintile: "創造が拡張する回路",
  novile: "内側の熟成の回路",
  septile: "揺らぎの回路",
};

function aspectLabelJa(type, deg) {
  const key = String(type || "").toLowerCase();
  if (ASPECT_LABEL_MAP[key]) return ASPECT_LABEL_MAP[key];
  if (Number.isFinite(Number(deg))) return `${deg}°`;
  return String(type || "").toUpperCase();
}

function aspectCircuitLabel(type) {
  const key = String(type || "").toLowerCase().trim().replace(/_\d+$/, "");
  return ASPECT_CIRCUITS[key] || "接続の回路";
}

module.exports = {
  ASPECT_LABEL_MAP,
  ASPECT_CIRCUITS,
  aspectLabelJa,
  aspectCircuitLabel,
};
