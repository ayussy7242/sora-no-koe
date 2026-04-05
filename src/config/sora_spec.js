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
      closest: "🔥 今日の最大接近",
      closestRef: (orbText) => `🔥 今日の最大接近（参考｜orb ${orbText}°）`,
      closestPaid: (orb) => `🔥 今日の最大接近（orb≤${orb}°）`,
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

function resolveBlogResonanceOrbLimit(env = process.env) {
  const raw = env?.BLOG_RESONANCE_ORB_LIMIT ?? env?.BLOG_ORB_LIMIT ?? null;
  if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const tier = String(env?.BLOG_RESONANCE_ORB_TIER ?? env?.BLOG_ORB_TIER ?? "").trim().toLowerCase();
  if (tier === "free") return SPEC?.orb?.free ?? 1.5;
  if (tier === "paid") return SPEC?.orb?.paid ?? 3.0;
  return SPEC?.orb?.paid ?? 3.0;
}

module.exports = { SPEC, resolveBlogResonanceOrbLimit };
