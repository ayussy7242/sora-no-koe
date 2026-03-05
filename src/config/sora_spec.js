"use strict";

const SPEC = Object.freeze({
  orb: {
    free: 1.5,
    paid: 3.0,
  },
  tsukiji: {
    minDays: 14,
    maxItems: 3,
  },
  labels: {
    sora: {
      listAll: "【配置一覧】",
      closest: "【今日の共鳴（最大orb接近）】",
      closestRef: (orbText) => `【今日の共鳴（最大orb接近｜参考｜orb ${orbText}°）】`,
      closestPaid: (orb) => `【今日の共鳴（orb≤${orb}°）】`,
      aspectSummaryPrefix: "角度構成：",
    },
    kinjitsu: {
      nowOrb: "現在 orb",
      peak: "最接近",
    },
    tsukiji: {
      approach: "【接近】",
      retro: "【逆行】",
      remaining: "あと",
    },
    bunpu: {
      list: "【一覧】",
    },
    house: {
      bodiesPrefix: "天体",
    },
  },
  retro: {
    suffix: "(R)", // 天体名の直後
    short: "R", // つきじ逆行期間
    joiner: "・", // 星座の後（例：山羊座・R）
  },
  separators: {
    section: "─────────────",
  },
});

module.exports = { SPEC };
