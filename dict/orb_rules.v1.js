"use strict";

/**
 * orb_rules.v1
 * - aspect 判定のための許容オーブ（度）
 * - "検出ルール" なので、文章はここから直接出さない
 */
const ORB_RULES_V1 = {
  version: "orb_rules.v1",

  // 推奨：major は広め / minor は狭め
  aspect_defaults: {
    major: { orb_deg: 6.0 },
    minor: { orb_deg: 2.0 },
    deep_space: { orb_deg: 1.5 },
  },

  // 天体別（主にネイタル×ネイタル or トランジット×ネイタルの重み）
  by_body: {
    Sun: { orb_deg: 6.0 },
    Moon: { orb_deg: 7.0 },      // 月は体感が出やすいので少し広め
    Mercury: { orb_deg: 5.0 },
    Venus: { orb_deg: 5.0 },
    Mars: { orb_deg: 5.0 },
    Jupiter: { orb_deg: 4.0 },
    Saturn: { orb_deg: 4.0 },
    Uranus: { orb_deg: 3.0 },
    Neptune: { orb_deg: 3.0 },
    Pluto: { orb_deg: 3.0 },
    Chiron: { orb_deg: 3.0 },

    // 角度/ポイント系（狭めに）
    ASC: { orb_deg: 2.0 },
    MC: { orb_deg: 2.0 },
    Vertex: { orb_deg: 1.5 },
    Lilith_mean: { orb_deg: 2.0 },
    Lilith_true: { orb_deg: 1.0 },
    NorthNode: { orb_deg: 2.0 },
    SouthNode: { orb_deg: 2.0 },
    PartOfFortune: { orb_deg: 1.5 },
  },

  // ケース別の係数（検出の厳しさ調整に使える）
  multipliers: {
    natal_to_natal: 1.0,
    transit_to_natal: 0.8,
    transit_to_transit: 0.6,
  },
};

module.exports = { ORB_RULES_V1 };
