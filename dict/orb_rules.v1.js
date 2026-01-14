"use strict";

/**
 * orb_rules.v1 (refined)
 * - aspect 判定のための許容オーブ（度）
 * - "検出ルール"。文章はここから直接出さない
 * - 占星術的な自然さ：天体の強度 × アスペクトの性質 × ケース係数
 */
const ORB_RULES_V1 = {
  version: "orb_rules.v1",

  // --------------------
  // Policy (最終orbの決定ルール)
  // --------------------
  policy: {
    /**
     * 2天体の基礎orb合成
     * - "min" 推奨：ノイズが減り、主な配置の密度が締まる
     *   （強い天体だけが広く拾うのを防ぐ）
     */
    combine_bodies: "min", // "min" | "max" | "avg"

    /**
     * 基礎orb（body合成）と アスペクト別orb をどう混ぜるか
     * - "min" 推奨：アスペクト側の性質がちゃんと効く
     */
    combine_with_aspect: "min", // "min" | "max" | "avg"

    /**
     * ケース係数（transit系など）をかけるタイミング
     */
    apply_multiplier_at: "final", // "final" only

    /**
     * 最終orbの暴れ防止
     */
    clamp: { min: 0.4, max: 8.0 },
  },

  // --------------------
  // Aspect orbs (type-based)
  // - アスペクトそのものの“効きやすさ”を反映
  // --------------------
  aspect_by_type: {
    // major
    conjunction: { orb_deg: 6.0 }, // 0° は最も強い
    opposition:  { orb_deg: 6.0 }, // 180° も強い
    square:      { orb_deg: 5.0 }, // 摩擦は出るが精度も必要
    trine:       { orb_deg: 5.0 }, // 滑らか（広すぎると甘くなる）
    sextile:     { orb_deg: 4.5 }, // 使う意思が要るので少し狭め

    // minor（無料枠で出すなら“狭めが正義”）
    semi_sextile_30:   { orb_deg: 1.2 },
    semi_square_45:    { orb_deg: 1.0 },
    sesqui_square_135: { orb_deg: 1.0 },
    quincunx_150:      { orb_deg: 1.3 }, // 違和感は鋭いので狭めでOK
    quintile_72:       { orb_deg: 1.0 },
    biquintile_144:    { orb_deg: 1.0 },
  },

  // --------------------
  // Bodies (body-based)
  // - 天体の“主張の強さ”を反映
  // --------------------
  by_body: {
    // luminaries
    Sun:  { orb_deg: 6.0 },
    Moon: { orb_deg: 7.0 },

    // personal planets
    Mercury: { orb_deg: 5.0 },
    Venus:   { orb_deg: 5.0 },
    Mars:    { orb_deg: 5.0 },

    // social planets
    Jupiter: { orb_deg: 4.5 },
    Saturn:  { orb_deg: 4.5 },

    // outer planets（効くけど、検出は絞ると“主な配置”が締まる）
    Uranus:  { orb_deg: 3.5 },
    Neptune: { orb_deg: 3.5 },
    Pluto:   { orb_deg: 3.5 },

    // others
    Chiron: { orb_deg: 3.0 },

    // angles / points（反応が鋭い＝狭めで拾う）
    ASC: { orb_deg: 2.0 },
    MC:  { orb_deg: 2.0 },
    Vertex:        { orb_deg: 1.2 },
    PartOfFortune: { orb_deg: 1.2 },

    // nodes / lilith（感じるがブレやすい＝狭め）
    NorthNode:   { orb_deg: 1.8 },
    SouthNode:   { orb_deg: 1.8 },
    Lilith_mean: { orb_deg: 1.6 },
    Lilith_true: { orb_deg: 1.0 },
  },

  // --------------------
  // Case multipliers
  // - transit_to_transit はノイズが出やすいので締める
  // --------------------
  multipliers: {
    natal_to_natal:     1.0,
    transit_to_natal:   0.85,
    transit_to_transit: 0.65,
  },
};

module.exports = { ORB_RULES_V1 };
