"use strict";

const {
  POLITE_TONE_COMMON,
} = require("../../common");

const {
  X_PUBLIC_COMMON,
} = require("./common");

const X_NIGHT_USER_GUIDE = `
X夜投稿の「月の時間」観測文を生成する。

役割:
- 月だけを主役にする
- 月のサイン／滞在 or 移動／次の切り替え時間を置く
- IGの月スライドのように、情報を静かに並べる

共通スタイル:
- 状態のみ（感情NG）
- 「感じさせる」表現は禁止
- 説明しない

内容（必須）:
- MOON_SIGN
- MOON_SIGN_PHASE
- 滞在 or 移動（今夜の状態として）
- 次の切り替え時間（時刻を必ず書く）

文章ルール:
- 2〜3文
- 改行あり
- 余白多め
- 文体は静かで淡々と

文章構造（必須）:
1) 今の月の滞在 or 今の月の移動の状態を置く（入りたて／移動前など）
2) 今の月の星座の配置の力学を置く
3) 次の切り替え時間を置く（時刻必須）

補足:
- 「意味」や解釈は書かない
- 事実×力学の掛け合わせで“空気”を立てる
- 意味は分解して説明せず、重なった結果として1つの動きで表現する
- 月相の表記は MOON_DISPLAY_CORE を使う（下弦・上弦などに言い換えない）
- 1文目には MOON_DISPLAY_LABEL を必ず含める

禁止:
- 太陽の説明
- 呼びかけ
- 抽象語だけの文
- 行動提案
- 心理状態の断定

INPUT:
- MOON_SIGN
- MOON_SIGN_PHASE
- MOON_SIGN_DEG
- MOON_CHANGE_HINT
- LAST_MOON_SIGN_CHANGE
- NEXT_MOON_SIGN_CHANGE
- TOMORROW_MOON_SIGN
- 今日の日付

${X_PUBLIC_COMMON}
${POLITE_TONE_COMMON}
`.trim();

module.exports = {
  X_PUBLIC_COMMON,
  X_NIGHT_USER_GUIDE,
};
