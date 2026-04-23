"use strict";

/**
 * Relation PDF (14P fixed) page config.
 * - Page order is fixed.
 * - Each page consumes exactly one block source.
 * - AI is injected by slot mapping (renderer decides placement).
 *
 * NOTE:
 * This is intentionally JS (CommonJS) to fit current repo conventions.
 * Types live in JSDoc for editor support.
 */

/**
 * @typedef {{ min?: number, max?: number }} AiLength
 * @typedef {{
 *   slot: string,
 *   source: string,
 *   ai_input_key?: string,
 *   output_kind?: "summary" | "lines" | "scalar",
 *   item_count?: number,
 *   role?: string,
 *   rule?: string[],
 *   required?: boolean,
 *   length?: AiLength
 * }} AiSlot
 * @typedef {{
 *   page: number,
 *   key: string,
 *   block_source: string,
 *   template: string,
 *   ai_slots?: AiSlot[],
 *   options?: Record<string, any>
 * }} RelationPdfPageConfigItem
 */

/** @type {RelationPdfPageConfigItem[]} */
const RELATION_PDF_PAGE_CONFIG = Object.freeze([
  { page: 1, key: "cover", block_source: "static.cover", template: "cover", ai_slots: [] },
  { page: 2, key: "pair_natal_overview", block_source: "static.pair_natal_overview", template: "pair_natal_overview", ai_slots: [] },

  {
    page: 3,
    key: "relation_type_page",
    block_source: "relation_type",
    template: "relation_type_page",
    ai_slots: [
      {
        slot: "summary",
        source: "relation_type.ai_summary",
        ai_input_key: "relation_type_text",
        output_kind: "summary",
        role: "関係の全体構造の説明",
        rule: [
          "主軸・張力・型を含める",
          "2人の関係の成り立ち方を構造として説明する",
          "良し悪しや助言は書かない",
        ],
        required: true,
        length: { min: 300, max: 400 },
      },
    ],
  },
  {
    page: 4,
    key: "balance_page",
    block_source: "balance",
    template: "balance_page",
    ai_slots: [
      {
        slot: "summary",
        source: "balance.ai_summary",
        ai_input_key: "element_modality_text",
        output_kind: "summary",
        role: "属性と区分の相性の説明",
        rule: [
          "A/B の主成分と動き方の差を示す",
          "温度と速度の噛み合いを構造として書く",
          "印象論ではなく配置差としてまとめる",
        ],
        required: true,
        length: { min: 160, max: 240 },
      },
    ],
  },
  {
    page: 5,
    key: "center_page",
    block_source: "center",
    template: "center_page",
    ai_slots: [
      {
        slot: "summary",
        source: "center.ai_summary",
        ai_input_key: "relation_center",
        output_kind: "summary",
        role: "重心と方向の説明",
        rule: [
          "支配サイン・支配ハウス・支配属性・支配区分を踏まえる",
          "重なりとズレの両方を書く",
          "関係の向かう方向を構造として示す",
        ],
        required: true,
        length: { min: 150, max: 220 },
      },
    ],
  },
  {
    page: 6,
    key: "core_page",
    block_source: "core",
    template: "core_page",
    ai_slots: [
      {
        slot: "summary",
        source: "core.ai_summary",
        ai_input_key: "relation_core",
        output_kind: "summary",
        role: "関係の核構造の説明",
        rule: [
          "主軸・張力・通路・型を統合する",
          "主要接点が核にどう寄与するかを書く",
          "結果評価ではなく構造の骨組みを示す",
        ],
        required: true,
        length: { min: 180, max: 260 },
      },
    ],
  },
  {
    page: 7,
    key: "flow_friction_page",
    block_source: "flow_friction",
    template: "flow_friction_page",
    ai_slots: [
      {
        slot: "flow_items_lines",
        source: "flow_friction.flow",
        ai_input_key: "flow_items_lines",
        output_kind: "lines",
        item_count: 2,
        role: "スムーズに流れやすい接続の説明",
        rule: [
          "各項目ごとに1行ずつ書く",
          "なぜ自然につながるかを書く",
          "どの要素が一致しているかを示す",
          "結果ではなく構造を書く",
        ],
        required: true,
        length: { min: 70, max: 140 },
      },
      {
        slot: "friction_items_lines",
        source: "flow_friction.friction",
        ai_input_key: "friction_items_lines",
        output_kind: "lines",
        item_count: 2,
        role: "ズレやすい構造の説明",
        rule: [
          "各項目ごとに1行ずつ書く",
          "どこがズレるかを書く",
          "なぜズレるかを書く",
          "対立ではなく構造差として書く",
        ],
        required: true,
        length: { min: 70, max: 140 },
      },
    ],
  },
  {
    page: 8,
    key: "communication_attraction_page",
    block_source: "communication_attraction",
    template: "communication_attraction_page",
    ai_slots: [
      {
        slot: "communication_items_lines",
        source: "communication_attraction.communication",
        ai_input_key: "comm_items_lines",
        output_kind: "lines",
        item_count: 2,
        role: "会話の接続構造の説明",
        rule: [
          "各項目ごとに1行ずつ書く",
          "なぜ理解が通りやすいか、またはズレやすいかを書く",
          "言葉と受け取りの構造を書く",
          "感想ではなく接続の質として示す",
        ],
        required: true,
        length: { min: 70, max: 140 },
      },
      {
        slot: "attraction_items_lines",
        source: "communication_attraction.attraction",
        ai_input_key: "attraction_items_lines",
        output_kind: "lines",
        item_count: 2,
        role: "惹き合いの構造の説明",
        rule: [
          "各項目ごとに1行ずつ書く",
          "どこで自然に引き合うかを書く",
          "感覚や価値観の共鳴を示す",
          "恋愛評価ではなく構造の一致として書く",
        ],
        required: true,
        length: { min: 70, max: 140 },
      },
    ],
  },
  {
    page: 9,
    key: "bodies_personal_page",
    block_source: "bodies_personal",
    template: "bodies_personal_page",
    ai_slots: [
      {
        slot: "personal_items_lines",
        source: "bodies_personal.items",
        ai_input_key: "personal_items_lines",
        output_kind: "lines",
        item_count: 5,
        role: "同天体の違いの構造説明",
        rule: ["各項目ごとに1行ずつ書く", "方向性や出方の違いを書く", "対比として書く"],
        required: true,
        length: { min: 50, max: 120 },
      },
    ],
  },
  {
    page: 10,
    key: "bodies_social_page",
    block_source: "bodies_social",
    template: "bodies_social_page",
    ai_slots: [
      {
        slot: "social_items_lines",
        source: "bodies_social.items",
        ai_input_key: "social_items_lines",
        output_kind: "lines",
        item_count: 5,
        role: "社会層の同天体比較",
        rule: ["各項目ごとに1行ずつ書く", "広げ方や積み上げ方や変化の違いを書く", "社会構造の差として書く"],
        required: true,
        length: { min: 50, max: 120 },
      },
    ],
  },
  {
    page: 11,
    key: "axis_deep_page",
    block_source: "axis_deep",
    template: "axis_deep_page",
    options: {
      // ON: show per-item short AI lines when available (axis_deep.axis.items[i].ai_summary etc.)
      // OFF: show only summaries.
      item_ai: "toggle",
    },
    ai_slots: [
      {
        slot: "axis_summary",
        source: "axis_deep.axis.ai_summary",
        ai_input_key: "axis_compare_text",
        output_kind: "summary",
        role: "関係の軸構造の説明",
        rule: [
          "ASC/DC/MC/ICのズレと共通点を書く",
          "関係の立ち上がり方を示す",
          "印象評価ではなく軸構造として書く",
        ],
        required: true,
        length: { min: 120, max: 220 },
      },
      {
        slot: "deep_summary",
        source: "axis_deep.deep.ai_summary",
        ai_input_key: "deep_compare_text",
        output_kind: "summary",
        role: "関係の深層構造の説明",
        rule: [
          "ノード・リリス・キロンの差と共通点を書く",
          "無意識に残るテーマを書く",
          "感情評価ではなく地下構造として書く",
        ],
        required: true,
        length: { min: 120, max: 220 },
      },
      // Optional per-item AI lines (renderer decides if enabled)
      {
        slot: "asc_summary",
        source: "axis_deep.axis.items[0].ai_summary",
        ai_input_key: "axis_compare_lines",
        output_kind: "lines",
        item_count: 4,
        role: "個別軸の短文説明",
        rule: ["第一印象や立ち上がり方を書く", "強さや差の出方を書く", "短く構造で書く"],
        required: false,
        length: { min: 40, max: 120 },
      },
      {
        slot: "dc_summary",
        source: "axis_deep.axis.items[1].ai_summary",
        ai_input_key: "axis_compare_lines",
        output_kind: "lines",
        item_count: 4,
        role: "個別軸の短文説明",
        rule: ["各項目ごとに1行ずつ書く", "関係の持ち方や距離感の差を書く", "短く構造で書く"],
        required: false,
        length: { min: 40, max: 120 },
      },
      {
        slot: "mc_summary",
        source: "axis_deep.axis.items[2].ai_summary",
        ai_input_key: "axis_compare_lines",
        output_kind: "lines",
        item_count: 4,
        role: "個別軸の短文説明",
        rule: ["各項目ごとに1行ずつ書く", "外側の見え方や役割の差を書く", "短く構造で書く"],
        required: false,
        length: { min: 40, max: 120 },
      },
      {
        slot: "ic_summary",
        source: "axis_deep.axis.items[3].ai_summary",
        ai_input_key: "axis_compare_lines",
        output_kind: "lines",
        item_count: 4,
        role: "個別軸の短文説明",
        rule: ["各項目ごとに1行ずつ書く", "内側の安心や心の開き方を書く", "短く構造で書く"],
        required: false,
        length: { min: 40, max: 120 },
      },
      {
        slot: "north_node_summary",
        source: "axis_deep.deep.items[0].ai_summary",
        ai_input_key: "deep_compare_lines",
        output_kind: "lines",
        item_count: 4,
        role: "個別深層点の短文説明",
        rule: ["進んでいく方向を書く", "共有されやすい流れを書く", "短く構造で書く"],
        required: false,
        length: { min: 40, max: 120 },
      },
      {
        slot: "south_node_summary",
        source: "axis_deep.deep.items[1].ai_summary",
        ai_input_key: "deep_compare_lines",
        output_kind: "lines",
        item_count: 4,
        role: "個別深層点の短文説明",
        rule: ["各項目ごとに1行ずつ書く", "慣れたパターンや無意識の距離感を書く", "短く構造で書く"],
        required: false,
        length: { min: 40, max: 120 },
      },
      {
        slot: "lilith_summary",
        source: "axis_deep.deep.items[2].ai_summary",
        ai_input_key: "deep_compare_lines",
        output_kind: "lines",
        item_count: 4,
        role: "個別深層点の短文説明",
        rule: ["各項目ごとに1行ずつ書く", "衝動や本音の出方を書く", "短く構造で書く"],
        required: false,
        length: { min: 40, max: 120 },
      },
      {
        slot: "chiron_summary",
        source: "axis_deep.deep.items[3].ai_summary",
        ai_input_key: "deep_compare_lines",
        output_kind: "lines",
        item_count: 4,
        role: "個別深層点の短文説明",
        rule: ["各項目ごとに1行ずつ書く", "敏感になる領域や気になりやすい点を書く", "短く構造で書く"],
        required: false,
        length: { min: 40, max: 120 },
      },
    ],
  },
  {
    page: 12,
    key: "house_ingress_ab_page",
    block_source: "house_ingress_ab",
    template: "house_ingress_page",
    ai_slots: [
      {
        slot: "ingress_1_summary",
        source: "house_ingress_ab.items",
        ai_input_key: "house_ingress_a_lines",
        output_kind: "lines",
        item_count: 3,
        role: "片方がもう片方に何を持ち込むかの説明",
        rule: ["A→Bで何が流入するかを書く", "ハウス領域ベースで書く", "感情評価ではなく構造で書く"],
        required: false,
        length: { min: 80, max: 140 },
      },
    ],
  },
  {
    page: 13,
    key: "house_ingress_ba_page",
    block_source: "house_ingress_ba",
    template: "house_ingress_page",
    ai_slots: [
      {
        slot: "ingress_1_summary",
        source: "house_ingress_ba.items",
        ai_input_key: "house_ingress_b_lines",
        output_kind: "lines",
        item_count: 3,
        role: "片方がもう片方に何を持ち込むかの説明",
        rule: ["B→Aで何が流入するかを書く", "ハウス領域ベースで書く", "感情評価ではなく構造で書く"],
        required: false,
        length: { min: 80, max: 140 },
      },
    ],
  },
  {
    page: 14,
    key: "pattern_page",
    block_source: "pattern",
    template: "pattern_page",
    ai_slots: [
      {
        slot: "pattern_name",
        source: "pattern.name",
        output_kind: "scalar",
        role: "関係構造の名称",
        rule: ["短く覚えやすく書く", "印象語より構造語を優先する"],
        required: true,
      },
      {
        slot: "pattern_summary",
        source: "pattern.ai_summary",
        ai_input_key: "relation_pattern",
        output_kind: "summary",
        role: "関係全体の構造まとめ",
        rule: [
          "center + core + flow/friction を統合する",
          "1つの構造として言語化する",
          "結論ではなく配置の整理として書く",
        ],
        required: true,
        length: { min: 180, max: 300 },
      },
      {
        slot: "structure_summary",
        source: "pattern.structure_summary",
        output_kind: "summary",
        role: "最終ページの補助構造説明",
        rule: [
          "pattern_summary を補強する",
          "証拠の言い換えではなく全体像を整理する",
          "助言ではなく構造補足に留める",
        ],
        required: false,
        length: { min: 120, max: 240 },
      },
    ],
  },
]);

module.exports = {
  RELATION_PDF_PAGE_CONFIG,
};
