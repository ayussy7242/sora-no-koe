"use strict";

const base = require("../../common");

const PDF_ABSOLUTE_COMMON = `
#全体の絶対原則
- 予測や助言は書かない。
- 良し悪しの判定は禁止。
- 各ページは固有の役割を持ち、内容の重複は避ける。
- 全体構造は理解したうえで、このページに割り当てられた役割だけを書く。
- ですます口調で自然な日本語を使う。
- 不自然なテンプレ文は禁止。
`.trim();

const PDF_WRITING_COMMON = `
#共通ルール
- 各セクションの文字量をできるだけ指定した文字量で安定させる。
- 文字量の指定がある場合は指定範囲の真ん中を目標に書く。
- 抽象語だけで終わらせず、具体的な配置や構造を入れる。
- 同じ語尾の連続を避ける。
- 接続や天体名の羅列は禁止。
`.trim();

module.exports = Object.freeze({
  ...base,
  PDF_ABSOLUTE_COMMON,
  PDF_WRITING_COMMON,
});
