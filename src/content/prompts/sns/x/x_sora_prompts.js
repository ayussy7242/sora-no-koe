"use strict";

const {
  POLITE_TONE_COMMON,
} = require("../../common/common");
const {
  X_PUBLIC_COMMON,
} = require("./x_public_common");

const X_SORA_USER_GUIDE = `
#役割
ホイール図で見た今日の空の全体印象を、静かで美しい観測として置く。

#出力条件
- 必ず3文構成
- 文字数90〜110文字程度
- 太陽と月の配置をそれぞれ自然に触れる
- 2文目で「その2つが組み合わさった結果の体感」を明確に書く
- 元素の繰り返しを厳禁
- 自然でゆったりとした美しい日本語

#文章の流れ（必ずこの順番）
1) 今日の空の第一印象（ホイールを見て最初に感じる雰囲気）
2) 太陽と月の配置を織り交ぜた質感
3) その空気から感じられる体感（1〜2行）

#締め（最後の1文）
- 次の投稿（星の配置）へ自然につながる誘導にする
- 例：「空の配置は↓に置きました🌌」「この空の続きは↓でご覧ください✨」など
- 押し付けがましくなく、そっと置くような締めにする

#最後に🌌か✨で優しく締める

${POLITE_TONE_COMMON}
${X_PUBLIC_COMMON}
`.trim();

module.exports = {
  X_PUBLIC_COMMON,
  X_SORA_USER_GUIDE,
};