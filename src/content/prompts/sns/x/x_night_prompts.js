"use strict";

const {
  POLITE_TONE_COMMON,
} = require("../../common/common");

const {
  X_PUBLIC_COMMON,
} = require("./x_public_common");

const X_NIGHT_USER_GUIDE = `
X夜投稿の1投稿目冒頭に置く「夜の空の観測メッセージ」を生成する。

役割:
- ホイール図の美しさを活かした「夜の入口」にする
- 今日の配置が夜にどう残っているか、静かな体感で短く置く
- 夜の締めとして「次の月情報」を必ず入れて、朝との違いを明確にする
- Xでバズりやすいよう、短く・感情に刺さり・「この夜どう？」と共有したくなる言葉にする

月の動きの扱い（ここを最終調整）:
- 次の月情報は必ず入れる（これが朝との最大の違い）
- 現在（今夜の月）→ 必ず触れる
- 次（未来）→ 必ずサイン名＋移動時刻を入れる
- 移動が近い場合は、停滞を断定せず、移行の気配が伝わる表現にする
- 「その後◯◯座へ移ります」だけで終わらせない。必ず夜の余韻と結びつけて書く
 - NEXT_MOON_SIGN_CHANGE がある場合は、その時刻を必ず書く（例: 3/25 02:18（牡牛座へ））
 - TOMORROW_MOON_SIGN は翌日の体感補助（JST 12:00基準）。必要なときだけ添える
 - LAST_MOON_SIGN_CHANGE があれば「今夜は◯◯座入りしたばかり」など一言で触れてよい
 - MOON_CHANGE_HINT が空でない場合は、必ず短く入れる（「入りたて」「もうすぐ移る」など）
 - MOON_SIGN_DEG / MOON_SIGN_PHASE は必要なときにだけ補助的に使う（数値は出さない）

文章構造（必ずこの順番）:
1) 月の配置＋今日の空の夜の残り方
2) その余韻から感じられる夜の体感（1行）
3) 次の月情報で静かに閉じる（必ずここで締め）

書き方:
- 全体で90〜120文字以内
- 改行や空行は読みやすさ最優先で整える（意味のかたまりで区切る）
- 単語の途中や句読点の途中で改行しない
- 最後に「🩷」か「🌙」で優しく締める
- ハッシュタグは最後に3つだけ（#夜の空 #星の配置 #ホイール図）
- 文体は「です・ます」体で統一する（断定でも丁寧形）

形式:
- 改行・空行は任意。読みやすさと余白感が出るよう整える
- ホイール図と一緒に貼ったときに美しく見えるよう整える

INPUT:
- SUN_SIGN
- MOON_SIGN
- TRANSIT_SIGNS
- SKY_STRATA.element_count
- SKY_STRATA.modality_count
- NEXT_TRANSIT_HINTS
- LAST_MOON_SIGN_CHANGE
- NEXT_MOON_SIGN_CHANGE
- TOMORROW_MOON_SIGN
- 今日の日付
- MOON_CHANGE_HINT
- MOON_SIGN_DEG
- MOON_SIGN_PHASE

${X_PUBLIC_COMMON}
${POLITE_TONE_COMMON}
`.trim();

module.exports = {
  X_PUBLIC_COMMON,
  X_NIGHT_USER_GUIDE,
};
