"use strict";

const { SYSTEM_COMMON, STYLE_COMMON } = require("./common");

const SYSTEM_BLUEPRINT_LIGHT = `
${SYSTEM_COMMON}

${STYLE_COMMON}
`.trim();

const RULES_BLUEPRINT_LIGHT_PROSE = `
`.trim();

const USER_GUIDE_BLUEPRINT_LIGHT = `
目的：
占星術が扱う意味・機能・段階性を、構造として、
読みやすく、自己認識しやすい形で記述する。
予測や助言は書かない。

INPUT（kernelのみ）から「星の設計図」本文を生成する。
これは所有構造（one_time）の記述。時間層（layer）とは混ぜない。
`.trim();

module.exports = Object.freeze({
  SYSTEM_BLUEPRINT_LIGHT,
  USER_GUIDE_BLUEPRINT_LIGHT,
  RULES_BLUEPRINT_LIGHT_PROSE,
  BLUEPRINT_LIGHT_USER_PROMPT_PREFIX: `${USER_GUIDE_BLUEPRINT_LIGHT}`.trim(),
});
