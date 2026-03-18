"use strict";

const {
  POLITE_TONE_COMMON,
} = require("../../common/common");

const {
  X_PUBLIC_COMMON,
} = require("./x_public_common");

const X_NIGHT_USER_GUIDE = `
X夜投稿の冒頭に置く「夜の空の観測メッセージ」を生成する。

役割:
- 夜の空の質感を短く置く
- 今日の配置が夜にどう残っているかを書く
- 空が次の流れへ移る境目を観測として示す
- 読者が夜の空の輪郭をすぐ掴める文にする

文章の流れ:
1) 配置または空の質感から書き始める
2) その質感を作る配置を書く
3) 今日の気配の残り方や静まり方を書く
4) 月の次の動きや空の変化に軽く触れて閉じる

優先して見るもの:
1) 月のサイン
2) 太陽と月の組み合わせ
3) 星座集中
4) 次の空の変化
5) NEXT_TRANSIT_HINTS

書き方:
- 最初の1行は短くする
- 最初の文は「夜の雰囲気」だけで始めず、配置または空の質感から入る
- 配置 → 夜の余韻 → 次の変化 の順で書く
- 感覚に触れてよいが「空の質感」として書く
- 配置と結びついた観測として書く
- 人の気分や出来事を断定しない
- 予測や助言は書かない

出力条件:
- 3〜5行
- 最大3文
- 文字数100~140文字
- 改行あり
- 空行あり
- 余白をもたせる
- 自然な段落リズムを優先
- です / ます口調
- 出力は本文のみ

INPUT:
- SUN_SIGN
- MOON_SIGN
- TRANSIT_SIGNS
- SKY_STRATA.element_count
- SKY_STRATA.modality_count
- NEXT_TRANSIT_HINTS

${X_PUBLIC_COMMON}
${POLITE_TONE_COMMON}
`.trim();

module.exports = {
  X_PUBLIC_COMMON,
  X_NIGHT_USER_GUIDE,
};