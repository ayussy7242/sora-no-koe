"use strict";

/**
 * aspects.v1
 * - core/feel/sora は “そらのこえ正式トーン”
 * - deep_space は paid/advanced 用（無料では基本出さない）
 * - future: ai_tags はLLMプロンプト時のラベルに使える
 */
const ASPECTS_V1 = {
  version: "aspects.v1",
  major: {
    conjunction: {
      deg: 0,
      key: "conjunction",
      label_ja: "コンジャンクション",
      core: "重なり・融合・増幅",
      feel: ["強い", "逃げ場がない", "無自覚に出る"],
      sora: "同じ領域でエネルギーが重なり、性質が強く表れやすい配置。",
      ai_tags: ["dense", "merge"],
    },
    sextile: {
      deg: 60,
      key: "sextile",
      label_ja: "セクスタイル",
      core: "チャンス・協力・選択肢",
      feel: ["やればできる感じ", "意識すると活きる"],
      sora: "意識的に使うことで、可能性が広がりやすい配置。",
      ai_tags: ["option", "bridge"],
    },
    square: {
      deg: 90,
      key: "square",
      label_ja: "スクエア",
      core: "摩擦・調整・ズレ",
      feel: ["引っかかる", "ストレス", "試行錯誤"],
      sora: "進行方向の異なる力が交差し、調整が求められやすい配置。",
      ai_tags: ["friction", "adjust"],
    },
    trine: {
      deg: 120,
      key: "trine",
      label_ja: "トライン",
      core: "調和・才能・自然さ",
      feel: ["楽", "当たり前", "気づかない才能"],
      caution: "楽すぎて使われないことが多い",
      sora: "エネルギーが自然に循環し、無理なく機能しやすい配置。",
      ai_tags: ["flow", "ease"],
    },
    opposition: {
      deg: 180,
      key: "opposition",
      label_ja: "オポジション",
      core: "対立・鏡・関係性",
      feel: ["葛藤", "引き合い", "投影"],
      sora: "向かい合う位置関係により、外側の出来事を通してテーマが浮かびやすい配置。",
      ai_tags: ["mirror", "polarity"],
    },
  },

  // paid / advanced
  deep_space: {
    enabled_by_default: false,

    semi_sextile_30: {
      deg: 30,
      key: "semi_sextile_30",
      label_ja: "セミセクスタイル",
      core: "気配レベルの関係",
      feel: ["かすかな接点", "ほぼ無意識"],
      sora: "意識の外側で、かすかな接点が生まれやすい配置。",
      ai_tags: ["subtle", "hint"],
    },

    semi_square_45: {
      deg: 45,
      key: "semi_square_45",
      label_ja: "セミスクエア",
      core: "小さな苛立ち",
      feel: ["モヤモヤ", "微不快", "地味にストレス"],
      sora: "小さな引っかかりが積み重なり、調整のサインとして現れやすい配置。",
      ai_tags: ["micro_friction", "irritation"],
    },

    sesqui_square_135: {
      deg: 135,
      key: "sesqui_square_135",
      label_ja: "セスキスクエア",
      core: "蓄積された摩擦",
      feel: ["もう無理", "限界", "爆発前夜"],
      sora: "積み重なった摩擦が表面化し、方向転換が求められやすい配置。",
      ai_tags: ["pressure", "threshold"],
    },

    quincunx_150: {
      deg: 150,
      key: "quincunx_150",
      label_ja: "インコンジャンクト",
      core: "噛み合わなさ・調整不能",
      feel: ["違和感", "説明できないズレ", "共通言語がない"],
      sora: "性質が異なり、自然な調整が難しい配置。",
      ai_tags: ["mismatch", "recalibration"],
    },

    quintile_72: {
      deg: 72,
      key: "quintile_72",
      label_ja: "クインタイル",
      core: "創造・職人芸",
      feel: ["ピンポイントな才能", "意識すると覚醒"],
      sora: "意識的に磨くほど、独自の創造性が立ち上がりやすい配置。",
      ai_tags: ["craft", "creative_edge"],
    },

    biquintile_144: {
      deg: 144,
      key: "biquintile_144",
      label_ja: "バイクインタイル",
      core: "創造の反復",
      feel: ["表現の熟成", "才能の反復"],
      sora: "反復と試行錯誤を通じて、表現が熟成しやすい配置。",
      ai_tags: ["refine", "iteration"],
    },

    septile_family: {
      key: "septile_family",
      label_ja: "セプタイル系",
      core: "運命・神秘・説明不能",
      feel: ["なぜかそうなる", "意味が後から来る"],
      sora: "理屈を超えた結びつきとして現れやすい配置（深宇宙専用）。",
      ai_tags: ["fate", "mystic"],
      // degはケースにより 360/7, 2*360/7, 3*360/7 など。ここでは family として扱う
    },
  },

  // utility: aspect degrees list (major only)
  major_list: [
    { type: "conjunction", deg: 0 },
    { type: "sextile", deg: 60 },
    { type: "square", deg: 90 },
    { type: "trine", deg: 120 },
    { type: "opposition", deg: 180 },
  ],
};

module.exports = { ASPECTS_V1 };
