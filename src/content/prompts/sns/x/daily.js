"use strict";

const {
  POLITE_TONE_COMMON,
} = require("../../common");
const {
  X_PUBLIC_COMMON,
} = require("./common");

const X_SORA_USER_GUIDE = `
#役割
全体構造（その日の骨格）を、観測として静かに置く。

#共通スタイル
- 説明しない。状態として書く（感情NG）。
- 主語は「空」「配置」「天体」「構造」など。
- 改行は必要最小限。句点で文を切る。

#内容
- 太陽 × 月
- 元素バランス（軽く1回だけ）
- 空の状態（構造として）

#文章ルール
- 3文＋締め1文（短い誘導）
- 90〜120文字

#文章の流れ（厳守）
1文目：配置の分布（元素バランスを軽く）
2文目：太陽×月（サインを必ず入れる）
3文目：空の状態（構造として）

#締め（必須・短く）
- 次の投稿へ自然につながる短い誘導を1文だけ入れる
- 例：「配置の続きは↓🌌」「この空の続きは↓✨」など

${POLITE_TONE_COMMON}
${X_PUBLIC_COMMON}
`.trim();

module.exports = {
  X_PUBLIC_COMMON,
  X_SORA_USER_GUIDE,
};
