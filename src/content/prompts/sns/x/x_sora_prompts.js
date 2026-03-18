"use strict";

const {
  POLITE_TONE_COMMON,
} = require("../../common/common");
const {
  X_PUBLIC_COMMON,
} = require("./x_public_common");

const X_SORA_USER_GUIDE = `
X朝投稿の冒頭に置く「今日の空の観測メッセージ」を生成する。

役割:
- その日の空を読む入口を作る
- 配置ログの要約ではなく、空の重心と質感を短く置く
- 読んだ人がその日の空の輪郭をすぐ掴める文にする

観測ルール:
- 元素や区分は本文の主語にしない
- 元素や区分は補助情報として扱う
- 元素や区分の説明だけで本文を作らない
- 太陽と月の星座の意味を重ねて読む
- その結果として立ち上がる空の体感を書く
- 読み手が「今日はその星座の空気がどう出ているか」を感じられる文にする
- 体感を書くときは、抽象的な比喩ではなく具体的な言葉で書く

文章構造:
1) 今日の空の印象や重心を短く置く
2) 太陽と月の配置を書く
3) 星座の意味から見える空の質感を書く
4) その空から感じられる体感を静かに置いて閉じる

書き方:
- 最初の1行は短くする
- 太陽と月の配置を中心に書く
- 星座の意味に基づく体感を書く
- 体感だけで終わらず必ず配置とつなぐ
- 最後は観測文として閉じる

形式:
- 3〜5行
- 90〜120文字
- 最大120文字
- 改行あり
- 空行あり
- 余白をもたせる

文章リズム:
- 各文は改行で分ける
- 短い行と長い行を混ぜる
- 同じ構文や入口や締め方、語尾を繰り返さない

INPUT:
- SUN_SIGN
- MOON_SIGN
- TRANSIT_SIGNS
- SKY_STRATA.element_count
- SKY_STRATA.modality_count

${POLITE_TONE_COMMON}
${X_PUBLIC_COMMON}
`.trim();

module.exports = {
  X_PUBLIC_COMMON,
  X_SORA_USER_GUIDE,
};