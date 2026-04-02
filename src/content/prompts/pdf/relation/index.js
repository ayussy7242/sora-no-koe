"use strict";

const {
  SYSTEM_COMMON,
  STYLE_COMMON,
  PROHIBITED_COMMON,
  TONE_COMMON,
  SENTENCE_COMMON,
  REPETITION_COMMON,
  POLITE_TONE_COMMON,
  PDF_ABSOLUTE_COMMON,
  PDF_WRITING_COMMON,
} = require("../common");

/**
 * Relation Prompt Set (PDF)
 * - Blueprintと同じ思想で定義
 * - 各セグメントは単独で意味が通る構成
 * - limitsは generation/limits.js 側で管理
 */

const RELATION_COMMON = `
${SYSTEM_COMMON}

${STYLE_COMMON}

${PROHIBITED_COMMON}

${TONE_COMMON}

${SENTENCE_COMMON}

${REPETITION_COMMON}

${POLITE_TONE_COMMON}

${PDF_ABSOLUTE_COMMON}

${PDF_WRITING_COMMON}

#Relation全体の絶対原則
- Relationは二人の関係を「構造」として観測する資料である。
- 各セクションの役割重複を避ける。

#文章ルール（共通）
- 主語を立てすぎず、構造が立ち上がる書き方にする。
`.trim();

const RELATION_BATCH_PREFIX = RELATION_COMMON;

const OUTPUT_TEXT = `#出力形式（必須）\n- JSON文字列のみ。\n- 形式：{\"text\":\"...\"}\n- キーは text 固定。\n- 値は日本語文字列。\n- 改行が必要なら \\n を使う。\n- 余計な前置き・説明・コードフェンスは禁止。`;

const OUTPUT_LINES = `#出力形式（必須）\n- JSON文字列のみ。\n- 形式：{\"lines\":[\"...\",\"...\"]}\n- キーは lines 固定。\n- 値は日本語文字列の配列。\n- 入力順に対応。\n- 配列の要素数を勝手に増減しない。\n- 空行禁止。\n- 余計な前置き・説明・コードフェンスは禁止。`;

const RELATION_SEGMENT_PROMPT_CENTER = `
${RELATION_BATCH_PREFIX}

#役割
- 関係の重心を「重なり・分離・流れ」でまとめる。

${OUTPUT_TEXT}

#INPUT
- a_center
- b_center
- relation_center

#書くこと
- 重なり・分離・流れの3点を統合する。
- A/B個別の説明に寄りすぎない。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 1文目で重心、2文目で動き、3文目で輪郭を補助する。

#文字量
- 120〜200字。
`.trim();

const RELATION_SEGMENT_PROMPT_CENTER_OVERLAP = `
${RELATION_BATCH_PREFIX}

#役割
- 重なりの中心を1文で示す。

${OUTPUT_TEXT}

#INPUT
- overlap_band
- shared_sign_label
- shared_house_cluster

#書くこと
- overlap_band を重心として示す。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 一文で重心だけを立てる。

#文字量
- 60〜90字。
`.trim();

const RELATION_SEGMENT_PROMPT_CENTER_DIRECTION = `
${RELATION_BATCH_PREFIX}

#役割
- 関係の方向性を1文で示す。

${OUTPUT_TEXT}

#INPUT
- direction_vector
- separation_band

#書くこと
- direction_vector を動線として示す。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 一文で方向だけを立てる。

#文字量
- 60〜90字。
`.trim();

const RELATION_SEGMENT_PROMPT_CENTER_SEPARATION = `
${RELATION_BATCH_PREFIX}

#役割
- 分離の重心差を1文で示す。

${OUTPUT_TEXT}

#INPUT
- separation_band
- separation_label

#書くこと
- separation_band の距離感を示す。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 一文で重心だけを立てる。

#文字量
- 60〜90字。
`.trim();

const RELATION_SEGMENT_PROMPT_CENTER_FLOW = `
${RELATION_BATCH_PREFIX}

#役割
- 流れの動線を1文で示す。

${OUTPUT_TEXT}

#INPUT
- flow_band
- flow_label

#書くこと
- flow_band / direction_vector を動線として示す。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 一文で動線だけを立てる。

#文字量
- 60〜90字。
`.trim();

const RELATION_SEGMENT_PROMPT_CENTER_SUMMARY = `
${RELATION_BATCH_PREFIX}

#役割
- OVERLAP / SEPARATION / FLOW を1文に統合する。

${OUTPUT_TEXT}

#INPUT
- overlap_band
- separation_band
- flow_band
- direction_vector

#書くこと
- 重心と動きの要約。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 一文で要点だけを立てる。

#文字量
- 60〜90字。
`.trim();

const RELATION_SEGMENT_PROMPT_SIGN_FACING = `
${RELATION_BATCH_PREFIX}

#役割
- サインの向かい合いが空気をどう作るか示す。

${OUTPUT_TEXT}

#INPUT
- sign_facing
- relation_counts

#書くこと
- 向き・対比・馴染み方の見え方を書く。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 1文目で対比、2文目で余韻。

#文字量
- 120〜170字。
`.trim();

const RELATION_SEGMENT_PROMPT_SIGN_FACING_ROWS = `
${RELATION_BATCH_PREFIX}

#役割
- 各行の空気の差を短く示す。

${OUTPUT_LINES}

#INPUT
- sign_facing

#書くこと
- それぞれの行の構造だけを書く。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 1行40〜60字。

#文字量
- 行数分だけ。
`.trim();

const RELATION_SEGMENT_PROMPT_CORE = `
${RELATION_BATCH_PREFIX}

#役割
- 関係の核を「主軸 → 張力 → 通路 → 型」で示す。

${OUTPUT_TEXT}

#INPUT
- relation_core
- core_links
- relation_center

#書くこと
- 主軸・張力・通路・型を順に示す。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 順序を崩さない。

#文字量
- 140〜210字。
`.trim();

const RELATION_SEGMENT_PROMPT_FLOW = `
${RELATION_BATCH_PREFIX}

#役割
- FLOW の層を通路として示す。

${OUTPUT_TEXT}

#INPUT
- flow

#書くこと
- 流れ・抜け・循環の性質。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 1文目に流れの核。

#文字量
- 100〜150字。
`.trim();

const RELATION_SEGMENT_PROMPT_FRICTION = `
${RELATION_BATCH_PREFIX}

#役割
- FRICTION の層を張りとして示す。

${OUTPUT_TEXT}

#INPUT
- friction

#書くこと
- 緊張や輪郭の立ち方。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 1文目に張りの核。

#文字量
- 100〜150字。
`.trim();

const RELATION_SEGMENT_PROMPT_COMM = `
${RELATION_BATCH_PREFIX}

#役割
- COMM の層を会話・理解の回路として示す。

${OUTPUT_TEXT}

#INPUT
- comm

#書くこと
- 認識・共有の動き。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 構造が立ち上がる書き方にする。

#文字量
- 100〜150字。
`.trim();

const RELATION_SEGMENT_PROMPT_ATTRACTION = `
${RELATION_BATCH_PREFIX}

#役割
- ATTRACTION の層を惹きつけ・熱の回路として示す。

${OUTPUT_TEXT}

#INPUT
- attraction

#書くこと
- 熱・引力・拡散の性質。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 1文目で熱の核。

#文字量
- 100〜150字。
`.trim();

const RELATION_SEGMENT_PROMPT_AXIS = `
${RELATION_BATCH_PREFIX}

#役割
- AXIS の接触が関係の骨組みに与える作用を示す。

${OUTPUT_TEXT}

#INPUT
- axis

#書くこと
- 入口・軸・向きの働き。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 骨組みとしての役割を明確に。

#文字量
- 100〜150字。
`.trim();

const RELATION_SEGMENT_PROMPT_DEEP = `
${RELATION_BATCH_PREFIX}

#役割
- DEEP の接触が深層に残る力として示す。

${OUTPUT_TEXT}

#INPUT
- deep

#書くこと
- 地下構造・残存感の性質。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 深層としての質感を明確に。

#文字量
- 100〜150字。
`.trim();

const RELATION_SEGMENT_PROMPT_PERSONAL = `
${RELATION_BATCH_PREFIX}

#役割
- PERSONAL の層を体感・感情・意思として示す。

${OUTPUT_TEXT}

#INPUT
- personal

#書くこと
- 体感の核と反応の質。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 体感の重心を先に置く。

#文字量
- 100〜150字。
`.trim();

const RELATION_SEGMENT_PROMPT_SOCIAL = `
${RELATION_BATCH_PREFIX}

#役割
- SOCIAL の層を外部接点・拡張として示す。

${OUTPUT_TEXT}

#INPUT
- social

#書くこと
- 拡張や制御の動き。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 社会側の輪郭を明確に。

#文字量
- 100〜150字。
`.trim();

const RELATION_SEGMENT_PROMPT_TRANSPERSONAL = `
${RELATION_BATCH_PREFIX}

#役割
- TRANSPERSONAL の層を構造変化として示す。

${OUTPUT_TEXT}

#INPUT
- transpersonal

#書くこと
- 外側の揺れ・更新の質。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 変化の方向性を明確に。

#文字量
- 100〜150字。
`.trim();

const RELATION_SEGMENT_PROMPT_AXIS_COMPARE = `
${RELATION_BATCH_PREFIX}

#役割
- AXIS（同天体比較）の層を入口・軸として示す。

${OUTPUT_TEXT}

#INPUT
- axis_compare

#書くこと
- 軸の比較が生む構造。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 入口の感触を明確に。

#文字量
- 100〜150字。
`.trim();

const RELATION_SEGMENT_PROMPT_DEEP_COMPARE = `
${RELATION_BATCH_PREFIX}

#役割
- DEEP（同天体比較）の層を地下構造として示す。

${OUTPUT_TEXT}

#INPUT
- deep_compare

#書くこと
- 深層に残る接点の質。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 深層としての残り方を示す。

#文字量
- 100〜150字。
`.trim();

const RELATION_SEGMENT_PROMPT_HOUSE_INGRESS_LINES = `
${RELATION_BATCH_PREFIX}

#役割
- ハウス流入の各行を短く示す。

${OUTPUT_LINES}

#INPUT
- houses

#書くこと
- 各ハウスの働きと入っている天体の性質を結ぶ。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 1行40〜70字。

#文字量
- 行数分だけ。
`.trim();

const RELATION_SEGMENT_PROMPT_HOUSE_INGRESS_SUMMARY = `
${RELATION_BATCH_PREFIX}

#役割
- 流入全体の動きを1文でまとめる。

${OUTPUT_TEXT}

#INPUT
- houses

#書くこと
- 全体の流れと重心。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 一文で要点だけを立てる。

#文字量
- 60〜90字。
`.trim();

const RELATION_SEGMENT_PROMPT_PATTERN = `
${RELATION_BATCH_PREFIX}

#役割
- Relationの型として総括する。

${OUTPUT_TEXT}

#INPUT
- relation_pattern
- relation_center
- relation_core
- pattern_evidence

#書くこと
- relation_center と relation_core をつなげて型としてまとめる。
- pattern_evidence を最低2つ反映する。

#書かないこと
- 接続の列挙。
- 評価や助言。

#文章ルール
- 抽象に逃げず、構造として言い切る。

#文字量
- 140〜210字。
`.trim();

module.exports = Object.freeze({
  RELATION_COMMON,
  RELATION_BATCH_PREFIX,
  RELATION_SEGMENT_PROMPT_CENTER,
  RELATION_SEGMENT_PROMPT_CENTER_OVERLAP,
  RELATION_SEGMENT_PROMPT_CENTER_DIRECTION,
  RELATION_SEGMENT_PROMPT_CENTER_SEPARATION,
  RELATION_SEGMENT_PROMPT_CENTER_FLOW,
  RELATION_SEGMENT_PROMPT_CENTER_SUMMARY,
  RELATION_SEGMENT_PROMPT_SIGN_FACING,
  RELATION_SEGMENT_PROMPT_SIGN_FACING_ROWS,
  RELATION_SEGMENT_PROMPT_CORE,
  RELATION_SEGMENT_PROMPT_FLOW,
  RELATION_SEGMENT_PROMPT_FRICTION,
  RELATION_SEGMENT_PROMPT_COMM,
  RELATION_SEGMENT_PROMPT_ATTRACTION,
  RELATION_SEGMENT_PROMPT_AXIS,
  RELATION_SEGMENT_PROMPT_DEEP,
  RELATION_SEGMENT_PROMPT_PERSONAL,
  RELATION_SEGMENT_PROMPT_SOCIAL,
  RELATION_SEGMENT_PROMPT_TRANSPERSONAL,
  RELATION_SEGMENT_PROMPT_AXIS_COMPARE,
  RELATION_SEGMENT_PROMPT_DEEP_COMPARE,
  RELATION_SEGMENT_PROMPT_HOUSE_INGRESS_LINES,
  RELATION_SEGMENT_PROMPT_HOUSE_INGRESS_SUMMARY,
  RELATION_SEGMENT_PROMPT_PATTERN,
});
