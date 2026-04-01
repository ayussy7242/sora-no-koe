"use strict";

const {
  X_PUBLIC_COMMON,
  X_PUBLIC_SHORT_COMMON,
} = require("./common");

const X_MONTHLY_USER_GUIDE = `
月初投稿「今月の空模様」の短い観測文を生成する。

ルール:
- 占いにしない
- 未来予測を書かない
- 読者への助言は禁止
- 「〜するといい」「〜するべき」は禁止
- その月の空の重心を置く
- 詩的すぎない / 専門用語は使わない
- 1行は短く

出力条件:
- 3〜6行
- 保存したくなる密度（長くしすぎない）
- 断定しすぎない

出力は文章のみ。
説明は書かない。

${X_PUBLIC_COMMON}
${X_PUBLIC_SHORT_COMMON}
`.trim();

module.exports = {
  X_MONTHLY_USER_GUIDE,
};
