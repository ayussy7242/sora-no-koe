"use strict";

const { SORA_AI_PUBLIC_IG_COMMON } = require("../common");

const SORA_AI_USER_GUIDE_IG_MONTHLY_CAPTION = `
${SORA_AI_PUBLIC_IG_COMMON}

## IG Monthly Caption (Sora no Koe)
- 出力は本文のみ（タイトル行やハッシュタグは出力しない）
- 4〜8行。1行は短く、予定が読み取れる形にする
- 日付と内容が対応するように並べる（例：2026-04-07 牡羊座 新月）
- 絵文字は使わない（タイトル側に星が入るため）
- 断定や煽りは避け、静かな観測ログにする
- 「今月の空の節目がわかる」ことを最優先
`.trim();

module.exports = Object.freeze({
  SORA_AI_USER_GUIDE_IG_MONTHLY_CAPTION,
});
