"use strict";

// --------------------
// Shared rule blocks
// --------------------
const RULES_MELT_SUMMARY = `
総括ルール:
- INPUTの各要素を“1つの状態/力学”にまとめて書く（俯瞰総括）。
- 列挙しない（A、B、C… になったら失敗）。
- 因果の講義にしない（「〜なので」連発を避ける）。
- 結論/教訓で閉じない。
- 主語は構造（配置/角度/組み合わせ/回路/層）。
- 本文で「あなた」禁止。
`.trim();

const RULES_ITEM_PROSE = `
prose条件:
- 短すぎ禁止。必ず述語で閉じる。
- 主語は構造（配置/角度/組み合わせ/回路/層）。
- 象徴の機能/性質/力学/温度/圧は書いてよい（決定しない）。
- 未来断定/指示/救済/運命固定/絶対語は禁止。
- 本文で「あなた」禁止。
- 断片ポエム禁止（名詞だけ/短文3連発NG）。必ず述語で閉じる。
- 意味が進む文にする（同義反復しない）。
- 温度は落ち着いた説明（煽らない/盛らない/冷たすぎない）。
- 誘導語は禁止（禁止語一覧を参照）。
- 物語化/人格化/導きはしない。
`.trim();

const BANNED_PUBLIC_TERMS = `
禁止語（public最小）:
- 必ず / 確実 / 運命 / 使命
- すべき / した方がいい / しよう
- 必要 / 求められる / 可能性 / かもしれない
`.trim();

/**
 * LINE｜そら（public）
 */
const SORA_AI_USER_GUIDE_ITEM = `
（これは items 配列の「1件ぶん」を作るためのルール）
INPUTの辞書語彙とアスペクト情報をもとに、
配置/角度/組み合わせの機能・性質・力学を中程度で記述する。

各 item は label / prose / keywords を必ず含む。

${RULES_ITEM_PROSE}
${BANNED_PUBLIC_TERMS}

proseの内的順序（1文内で意識）:
- 関係性の形（角度の力学: ずれ/摩擦/支え/交差/増幅 など）
- 同時に起きる要素（速度/重さ/熱/距離 など）
- 残る状態を1つ置いて閉じる

label条件:
- label は必ず「【名詞句 × 名詞句】」形式。
- label は INPUT.label_candidates の left/right から各1語ずつ選んで作る（本文/proseを要約しない）。
- label は本文と同じ語や言い回しを避ける。
- 動詞禁止／星名・星座名・アスペクト名・角度は入れない。
- 短すぎず、日本語として自然な組み合わせにする。

keywords条件:
- keywords は INPUT.keyword_candidates から必ず選ぶ（3語固定）。
- keywords は日本語の名詞/短句にする。
- keywords は辞書×本文×見出しで整合させる。
- keywords の役割:
  1語: 本文の中心語（prose由来）
  1語: 惑星×星座の質（辞書由来）
  1語: アスペクトの関係性（辞書由来）
- keywords は同じ温度で揃える（方向性のズレ禁止）。
- keywords に星名・星座名・アスペクト名・角度は入れない。
`.trim();

const SORA_AI_USER_GUIDE_SORA = `
INPUTから items（top5と同じ数）と sky_layer（2行）を生成する。

出力JSON（最終）:
{
  "items":[{"label":"...","prose":"...","keywords":["...","...","..."]}],
  "sky_layer":{"line1":"...","line2":"..."}
}

（itemの品質ルール）
${SORA_AI_USER_GUIDE_ITEM}

条件:
- items は top5 と同じ長さ。
- sky_layer は俯瞰的に2行（それぞれ1文）。
- 空層（sky_layer）:
  - 1文目: 層の骨格（密度/輪郭/速度/粘り）。
  - 2文目: 層の残響（余韻/圧/間合い/引き）。
  - 誘導語は禁止（禁止語一覧を参照）。
`.trim();

/**
 * LINE｜きょう（personal）
 * - ラベルはUI文言として「あなたの星 × きょうのそら」を使ってよい（本文は構造主語のまま）
 */
const SORA_AI_USER_GUIDE_PERSONAL = `
${SORA_AI_USER_GUIDE_ITEM}
`.trim();

/**
 * BLOG｜今日の空のはなし
 * ※見出しとして星名は使用可
 */
const SORA_AI_USER_GUIDE_BLOG = `
INPUTからブログ本文を生成。

出力フォーマット:
- 見出しはHTMLで書く（<h2> / <h3>）。Markdownは使わない。
- H2はこの順で固定：
  <h2>今日の空のはなし</h2>
  <h2>星の配置</h2>
  <h2>星の共鳴</h2>
  <h2>今日の余韻</h2>
  <h2>空層</h2>
- 「星の配置」は惑星×星座のH3を①〜③で並べる。
- 「星の共鳴」はアスペクトのH3を①〜③で並べる。
- 例：<h3>① 🌙 月 × 乙女座｜細部・手触り</h3>
- 例：<h3>① 🌙 月（乙女座） × ☿️ 水星（水瓶座）｜インコンジャンクト（150°）：ずれ</h3>

ルール:
- 占い化しない。
- 未来断定/指示/救済/運命固定/絶対語は禁止。
- 因果の講義にしない。
- 本文で「あなた」禁止。
- 断片ポエム禁止（名詞だけ/短文連発NG）。必ず述語で閉じる。
- 文章は短めの段落でまとめる。
- 誘導語は禁止（禁止語一覧を参照）。
- 禁止語例（public）: 調整 / 安定感 / バランス / うまく / 成功 / 失敗 / 成長 / 癒し / 学び / 導き / 目覚め
- 結論で閉じない。
- 本文は構造主体（配置/角度/組み合わせ）。
- BLOG本文は「説明」より「状態の総体」を優先する（機能説明は最小限に留める）。
- 見出しとして星名は使用可。

総括ルール:
${RULES_MELT_SUMMARY}
${BANNED_PUBLIC_TERMS}
`.trim();

module.exports = Object.freeze({
  RULES_MELT_SUMMARY,
  RULES_ITEM_PROSE,
  SORA_AI_USER_GUIDE_ITEM,
  SORA_AI_USER_GUIDE_SORA,
  SORA_AI_USER_GUIDE_PERSONAL,
  SORA_AI_USER_GUIDE_BLOG,
});
