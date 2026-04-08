"use strict";

const {
  SORA_AI_PUBLIC_IG_COMMON,
  POLITE_TONE_COMMON,
} = require("../common");

/* =================================================
IG｜今日の月（slide2）
================================================= */

const SORA_AI_USER_GUIDE_IG_MOON = `
Instagramカルーセル2枚目の「今日の月」本文を生成する。

役割:
- 今日の月の質感を短く観測する
- 月のサインと月相ラベルをもとに、今日の月だけを書く
- 次の月相や全天の俯瞰には広げない
 - MOON_CHANGE_HINT がある場合は短く触れる
 - NEXT_MOON_SIGN_CHANGE がある場合は、1回だけ時刻と移動先を添えてよい

形式:
- 2〜3文
- 1段落
- 改行しない

文字量: - 70〜90文字(最大100文字)

文章の流れ:
1) 月のサインと月相の配置
2) 月星座が持つ基本的な意味
3) 月相との組み合わせで生まれる今日の体感

月パート固有ルール:
- 1文目は「月の配置」を置く
- 2文目は「月星座の意味」を置く
- 3文目は「今日の体感」を置いてもよい
- 月の星座と月相ラベルを自然に文へ織り込む
 - MOON_CHANGE_HINT がある場合は1〜2文目のどこかに短く入れる
 - NEXT_MOON_SIGN_CHANGE がある場合は、2文目か3文目に短く添える
- 入力データをもとに書き、一般論で埋めない
- 数値は書かない（月齢/照度/次の月相は本文に出さない）
- 時刻は NEXT_MOON_SIGN_CHANGE に限り 1回だけ出してよい
- 「新月」「満月」は、今日がその日なら本文に出してよい
- 月の質感が伝わる、やわらかく美しい日本語にする
- 教科書的な月星座説明にしない
- 月星座の意味は書いてよい
- その日の体感は書いてよい
- ただし、感情や気分を断定しない
- 各文の役割を混ぜない
- 同じ意味を言い換えて引き延ばさない
- 絵文字は使わない

禁止:
- 占い口調
- 助言
- 心理断定

INPUT:
- MOON_SIGN
- PHASE_LABEL
- MOON_CHANGE_HINT
- NEXT_MOON_SIGN_CHANGE
- NEXT_MOON_SIGN_CHANGE_HOURS_AHEAD

${SORA_AI_PUBLIC_IG_COMMON}
${POLITE_TONE_COMMON}
`.trim();

/* =================================================
IG｜今日の月（キャプション / night）
================================================= */

const SORA_AI_USER_GUIDE_IG_MOON_NIGHT_CAPTION = `
Instagram「夜投稿」の月キャプション本文を生成する。

目的:
- カルーセル本文より一段深く、今日の月の意味が読める文章にする
- 月の位置・状態・次の変化を、やわらかく具体的に書く
- カルーセルで置いた内容を広げ、読む意味のある補助線にする

文章の流れ:
1) 月のサインと月相（月名）を置く
2) その配置がいまどういう状態をつくっているかを書く
3) 変化の気配（MOON_CHANGE_HINT / NEXT_MOON_SIGN_CHANGE）を短く添える
4) 保存導線で静かに閉じる

形式:
- 4〜6行
- 改行あり
- 余白あり
- 180〜220文字目安
- 絵文字1つ（文末に控えめに置く）

出力ルール:
- 「◯◯座の◯◯月」の形を自然に入れる
- 数値は出さない（時刻は NEXT_MOON_SIGN_CHANGE のみ可）
- 行間に余白を感じるリズムで改行する
- 絵文字は文末に1つだけ入れる

禁止:
- 占い口調
- 助言 / 心理断定 / 行動示唆
- 「あなた」
- 抽象語だけで終わる文

INPUT:
- MOON_SIGN
- PHASE_LABEL
- MOON_CHANGE_HINT
- NEXT_MOON_SIGN_CHANGE
- NEXT_MOON_SIGN_CHANGE_HOURS_AHEAD

${SORA_AI_PUBLIC_IG_COMMON}
${POLITE_TONE_COMMON}
`.trim();

/* =================================================
IG｜今日の月（Caption）
================================================= */

const SORA_AI_USER_GUIDE_IG_MOON_CAPTION = `
Instagram投稿の「今日の月」キャプションを生成する。

役割:
- 今日の月の配置を簡潔に束ねる
- 月のサイン・月相・変化の気配を入れる
- 詳細は本文に譲り、説明しすぎない
- 保存導線を軽く添える

形式:
- 4〜6行
- 改行あり
- 140〜200文字目安

文章の流れ:
1) 月のサインと月相を短く置く
2) 月の質感を1〜2行で置く
3) 変化の気配（MOON_CHANGE_HINT / NEXT_MOON_SIGN_CHANGE）を短く添える
4) 保存導線で静かに閉じる

書き方:
- 抽象語に寄りすぎない
- 押し付けない
- 「あなた」は使わない
- 数値は出さない（時刻は NEXT_MOON_SIGN_CHANGE のみ可）

INPUT:
- MOON_SIGN
- PHASE_LABEL
- MOON_CHANGE_HINT
- NEXT_MOON_SIGN_CHANGE
- NEXT_MOON_SIGN_CHANGE_HOURS_AHEAD

${SORA_AI_PUBLIC_IG_COMMON}
${POLITE_TONE_COMMON}
`.trim();

module.exports = Object.freeze({
  SORA_AI_USER_GUIDE_IG_MOON,
  SORA_AI_USER_GUIDE_IG_MOON_NIGHT_CAPTION,
  SORA_AI_USER_GUIDE_IG_MOON_CAPTION,
});
