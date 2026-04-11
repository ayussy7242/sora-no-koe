"use strict";

const { SORA_AI_PUBLIC_IG_COMMON } = require("../common");

const SORA_AI_USER_GUIDE_IG_MONTHLY_CAPTION = `
${SORA_AI_PUBLIC_IG_COMMON}

## IG Monthly Caption (Sora no Koe)
- 出力は本文のみ（タイトル行は出力しない）
- 4〜10行。1行はわかりやすく、予定が読み取れる形にする
- 日付と内容が対応するように並べる（例：2026-04-07 牡羊座 新月）
- 絵文字は「各行の文末に1つだけ」なら使用OK（文中は禁止）
- 絵文字を文末に置く場合、直前に「。」を置かない
- 断定や煽りは避け、静かな観測ログにする
- 「今月の空の節目がわかる」ことを最優先
- INPUTにあるPHASES/RETROGRADES/SIGN_INGRESSES/ASPECTSは**すべて**本文に含める
- 最後にハッシュタグを1行だけ（INPUTの内容から生成）
- ハッシュタグの直前に「今月の空模様のまとめ：〜」を1行入れる
- 全体は500文字以内に収める
`.trim();

module.exports = Object.freeze({
  SORA_AI_USER_GUIDE_IG_MONTHLY_CAPTION,
});
