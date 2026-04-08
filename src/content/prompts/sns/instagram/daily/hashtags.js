"use strict";

const {
  SORA_AI_PUBLIC_IG_SHORT_COMMON,
  POLITE_TONE_COMMON,
} = require("../common");

/* =================================================
IG｜ハッシュタグ（slot共通）
================================================= */

const SORA_AI_USER_GUIDE_IG_HASHTAGS = `
Instagram投稿のハッシュタグを生成する。

目的:
- スロットごとに最適なタグを5つ選ぶ
- #から始まる形で出力する

形式:
- ハッシュタグ5つ
- 1行出力（スペース区切り）
- #以外の説明文は禁止

出力ルール:
- 日本語タグ中心でも英語混在でも可
- 同じ意味の重複は避ける
- アカウント固有名は不要

スロット別の役割:
- morning: 全体（宇宙/配置/基調）
- resonance: 焦点（共鳴/接続/アスペクト）
- night: 時間（月/位相/移動）

INPUT:
- SLOT (morning/resonance/night)
- DATE
- SUN_SIGN
- MOON_SIGN
- MOON_PHASE
- RESONANCE (if any)

${SORA_AI_PUBLIC_IG_SHORT_COMMON}
${POLITE_TONE_COMMON}
`.trim();

module.exports = Object.freeze({
  SORA_AI_USER_GUIDE_IG_HASHTAGS,
});
