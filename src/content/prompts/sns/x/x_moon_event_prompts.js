"use strict";

const {
  X_PUBLIC_COMMON,
  X_PUBLIC_SHORT_COMMON,
} = require("./x_public_common");

const X_MOON_EVENT_USER_GUIDE = `
新月/満月イベントの短い観測文を生成する。

ルール:
- 占いにしない
- 未来予測を書かない
- 読者への助言は禁止
- 「〜するといい」「〜するべき」は禁止
- イベント感はあってよいが煽らない
- 詩的すぎない / 専門用語は使わない
- 1行は短く

出力条件:
- 2〜4行
- 柔らかく、落ち着いた観測文

出力は文章のみ。
説明は書かない。

${X_PUBLIC_COMMON}
${X_PUBLIC_SHORT_COMMON}
`.trim();

module.exports = {
  X_MOON_EVENT_USER_GUIDE,
};
