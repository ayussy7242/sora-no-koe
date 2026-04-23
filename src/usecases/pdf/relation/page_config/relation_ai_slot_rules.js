"use strict";

/**
 * SSOT-like AI slot rules for Relation blocks.
 * - Not enforced in renderer yet; meant for AI generation + validation.
 */

const RELATION_AI_SLOT_RULES = Object.freeze({
  relation_type: {
    min: 300,
    max: 400,
    required: true,
    role: "関係の全体構造の説明",
    rule: ["主軸・張力・型を含める", "2人の関係の成り立ち方を構造として説明する", "良し悪しや助言は書かない"],
  },
  balance: {
    min: 160,
    max: 240,
    required: true,
    role: "属性と区分の相性の説明",
    rule: ["A/B の主成分と動き方の差を示す", "温度と速度の噛み合いを構造として書く", "印象論ではなく配置差としてまとめる"],
  },
  center: {
    min: 150,
    max: 220,
    required: true,
    role: "重心と方向の説明",
    rule: ["重なりとズレの両方を書く", "関係の向かう方向を構造として示す", "印象評価ではなく配置差として書く"],
  },
  core: {
    min: 180,
    max: 260,
    required: true,
    role: "関係の核構造の説明",
    rule: ["主軸・張力・通路・型を統合する", "主要接点が核にどう寄与するかを書く", "結果評価ではなく骨組みを示す"],
  },
  connection_item: {
    min: 70,
    max: 140,
    required: true,
    role: "接続単位の構造説明",
    rule: ["なぜつながるか、またはズレるかを書く", "一致点または差分の要因を書く", "結果ではなく構造として書く"],
  },
  body_item: {
    min: 50,
    max: 120,
    required: true,
    role: "同天体比較の構造説明",
    rule: ["方向性や出方の違いを書く", "対比として簡潔に書く", "良し悪しではなく差の輪郭を書く"],
  },
  axis_deep_summary: {
    min: 120,
    max: 220,
    required: true,
    role: "軸または深層の全体構造説明",
    rule: ["ズレと共通点をまとめる", "関係の立ち上がり方や深層テーマを書く", "印象評価ではなく構造を書く"],
  },
  axis_deep_item: {
    min: 40,
    max: 120,
    required: false,
    role: "個別軸/個別深層点の短文説明",
    rule: ["1項目だけに集中する", "短く構造で書く", "助言や評価は書かない"],
  },
  house_ingress_item: {
    min: 80,
    max: 140,
    required: false,
    role: "片方がもう片方に持ち込む構造の説明",
    rule: ["流入先ハウスを軸に書く", "何が持ち込まれるかを書く", "感情評価ではなく領域構造として書く"],
  },
  pattern_summary: {
    min: 180,
    max: 300,
    required: true,
    role: "関係全体の構造まとめ",
    rule: ["center + core + flow/friction を統合する", "1つの構造として言語化する", "結論ではなく配置の整理として書く"],
  },
  pattern_structure_summary: {
    min: 120,
    max: 240,
    required: false,
    role: "最終ページの補助構造説明",
    rule: ["pattern_summary を補強する", "証拠の言い換えではなく全体像を整理する", "助言ではなく構造補足に留める"],
  },
});

module.exports = { RELATION_AI_SLOT_RULES };
