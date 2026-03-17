"use strict";

const {
  POLITE_TONE_COMMON,
  SORA_AI_PUBLIC_BASE,
  SORA_AI_PUBLIC_POLITE_TONE,
} = require("./common");
const {
  SORA_AI_PUBLIC_IG_COMMON,
  SORA_AI_PUBLIC_IG_SHORT_COMMON,
} = require("./ig");

/* =================================================
IG Story｜共通ルール
================================================= */

const SORA_AI_PUBLIC_IG_STORY_COMMON = `
共通方針:
- 出力は本文のみ。JSON不要。
- Instagramストーリー用の短文として生成する。
- 配置・月・接続・角度など、構造を起点に短く書く。
- 構造から読み取れる意味や体感は書いてよい。
- ただし、人の心理・欲求・出来事・運命を断定しない。
- 行動を指示しない。
- 運勢表現にしない。
- 過剰にスピリチュアルにしない。
- Storyでそのまま貼れる自然な日本語にする。
- 質問は1つまでにする。
- 短く、余白のある文にする。

表現ルール:
- 主語は「配置」「月」「空」「接続」などに置く。
- 抽象語だけで終わらず、天体・星座・ハウス・角度と結びつける。
- 情報を詰め込みすぎない。
- コピペしやすい改行を使ってよい。
- 夜の余韻・共鳴・予告として読める文にする。

禁止:
- 「あなたは」
- 心理状態の断定
- 欲求の断定
- 出来事の断定
- 行動の示唆
- 運勢表現
- 教科書的説明だけで終わる文
- 不安を煽る言い回し
`.trim();

/* =================================================
IG Story｜今日の空
================================================= */

const SORA_AI_USER_GUIDE_IG_STORY_TODAY = `
Instagramストーリーの「今日の空」本文を生成する。

役割:
- 今日の月の配置や空気感をもとに、夜のふりかえり入口を作る
- 今日を静かに見返せる短文にする
- 体感共有につながるように閉じる

形式:
- 2〜4行
- 40〜90文字目安
- 改行あり

文章の流れ:
1) 今日の空どうでしたか？ などの入口
2) 今日の月の配置
3) 月の質感や今日の空気
4) 必要なら短い問いで閉じる

書き方:
- 月のサインと月相を自然に使う
- 観測として静かに書く
- 心理断定をしない
- 大げさにしない
- Storyでそのまま使える文にする

INPUT:
- MOON_SIGN
- PHASE_LABEL
- SUN_SIGN

${SORA_AI_PUBLIC_POLITE_TONE}
${SORA_AI_PUBLIC_IG_COMMON}
${SORA_AI_PUBLIC_IG_SHORT_COMMON}
${SORA_AI_PUBLIC_IG_STORY_COMMON}
${SORA_AI_PUBLIC_BASE}
${POLITE_TONE_COMMON}
`.trim();

/* =================================================
IG Story｜今日の共鳴
================================================= */

const SORA_AI_USER_GUIDE_IG_STORY_RESONANCE = `
Instagramストーリーの「今日の共鳴」本文を生成する。

役割:
- その日の主要アスペクトを1つ選び、短い共鳴文にする
- 角度の説明ではなく、今日の空に立ち上がる質感を書く
- 体感共有の入口として閉じる

形式:
- 3〜5行
- 50〜110文字目安
- 改行あり

文章の流れ:
1) 今日の共鳴
2) 接続名（例: 金星 × 天王星）
3) その角度が作る空気
4) 短い問い

書き方:
- アスペクトは1本だけ
- 説明しすぎない
- 今日の空の中でその交差がどう見えるかを書く
- 助言や断定にしない
- Storyでそのまま使える自然な文にする

INPUT:
- ASPECT
- A_BODY
- B_BODY
- A_SIGN
- B_SIGN
- A_HOUSE
- B_HOUSE
- ORB

${SORA_AI_PUBLIC_POLITE_TONE}
${SORA_AI_PUBLIC_IG_COMMON}
${SORA_AI_PUBLIC_IG_SHORT_COMMON}
${SORA_AI_PUBLIC_IG_STORY_COMMON}
${SORA_AI_PUBLIC_BASE}
${POLITE_TONE_COMMON}
`.trim();

/* =================================================
IG Story｜明日の空
================================================= */

const SORA_AI_USER_GUIDE_IG_STORY_TOMORROW = `
Instagramストーリーの「明日の空」本文を生成する。

役割:
- 明日立ち上がりやすい配置を1つだけ軽く置く
- 朝8:10のカルーセル更新への予告にする
- 煽らず静かに閉じる

形式:
- 3〜5行
- 45〜100文字目安
- 改行あり

文章の流れ:
1) 明日は
2) ひとつの配置
3) その配置がつくる空気
4) 朝8:10 更新します

書き方:
- 予告は1テーマだけ
- 未来断定しない
- 配置主語を優先する
- Storyにそのまま貼れる短さにする

INPUT:
- NEXT_MOON_SIGN
- NEXT_PHASE_LABEL
- NEXT_ASPECT
- NEXT_A_BODY
- NEXT_B_BODY
- NEXT_A_SIGN
- NEXT_B_SIGN

${SORA_AI_PUBLIC_POLITE_TONE}
${SORA_AI_PUBLIC_IG_COMMON}
${SORA_AI_PUBLIC_IG_SHORT_COMMON}
${SORA_AI_PUBLIC_IG_STORY_COMMON}
${SORA_AI_PUBLIC_BASE}
${POLITE_TONE_COMMON}
`.trim();

module.exports = Object.freeze({
  SORA_AI_PUBLIC_IG_STORY_COMMON,
  SORA_AI_USER_GUIDE_IG_STORY_TODAY,
  SORA_AI_USER_GUIDE_IG_STORY_RESONANCE,
  SORA_AI_USER_GUIDE_IG_STORY_TOMORROW,
});
