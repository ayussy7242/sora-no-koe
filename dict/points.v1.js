"use strict";

/**
 * points.v1
 * - 計算点 / 角度 / 感受点
 * - storyには直接入れず、参照辞書として使う
 */
const POINTS_V1 = {
  version: "points.v1",
  points: {
    ASC: {
      label_ja: "ASC",
      core: "入口・印象・身体感覚",
      field: "出会い方/立ち位置",
      sora_short: "世界との接点。最初の立ち姿。",
      sora: "世界との接点。どんな姿勢で現実に立ちやすいか。",
      sora_deep: "身体感覚を通した世界との接触点。第一印象や無意識の立ち位置。",
      keywords: ["入口", "印象", "身体感覚"],
      ai_tags: ["persona", "stance"],
    },

    MC: {
      label_ja: "MC",
      core: "頂点・社会的方向",
      field: "役割/見られ方/到達点",
      sora_short: "向かう先。社会での輪郭。",
      sora: "向かう先。役割や見られ方の方向性が浮かびやすい点。",
      sora_deep: "人生の外側に見える“方向”の焦点。到達点として意識が向きやすい。",
      keywords: ["役割", "社会", "到達点"],
      ai_tags: ["career", "public"],
    },

    Vertex: {
      label_ja: "Vertex",
      core: "交差点・出会いの焦点",
      field: "縁/転機/接点",
      sora_short: "交差点。縁が動く。",
      sora: "交差点。外部との縁が動きやすい焦点。",
      sora_deep: "自分の意志だけでは説明しにくい“接点”として現れやすい。",
      keywords: ["縁", "転機", "接点"],
      ai_tags: ["fated", "encounter"],
    },

    Lilith_mean: {
      label_ja: "リリス（平均）",
      core: "影・欲望・タブー・拒絶",
      field: "境界/本音/抑圧の解放",
      sora_short: "影の輪郭。本音が浮かぶ。",
      sora: "影の輪郭。避けてきた本音や、境界のテーマが立ち上がりやすい点。",
      sora_deep:
        "抑圧や禁忌として扱われてきた領域に、感情や欲求が集まりやすい焦点。扱い方がテーマになりやすい。",
      keywords: ["影", "本音", "タブー", "境界", "欲望"],
      ai_tags: ["shadow", "taboo", "raw_desire"],
      aliases: ["Lilith"], // UIや出力で短縮表示したい時用
    },

    Lilith_true: {
      label_ja: "リリス（真）",
      core: "影の揺れ・瞬間的な焦点",
      field: "境界/反応/無意識の尖り",
      sora_short: "影の揺れ。反応が尖る。",
      sora: "影の揺れ。瞬間的に境界が鋭くなりやすい点。",
      sora_deep:
        "短期的に反応が尖りやすい焦点。平均リリスよりも“揺れ”として出やすい扱い。",
      keywords: ["影", "揺れ", "境界", "反応"],
      ai_tags: ["shadow", "spike", "edge"],
      enabled_by_default: false, // まずは off 推奨（必要になったら on）
    },
  },

  order: ["ASC", "MC", "Vertex", "Lilith_mean"],

  // deep宇宙向け（必要な時だけ）
  deep_space_order: ["Lilith_true"],
};

module.exports = { POINTS_V1 };
