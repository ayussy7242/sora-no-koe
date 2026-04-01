"use strict";

const {
  SYSTEM_COMMON,
  STYLE_COMMON,
  PROHIBITED_COMMON,
  TONE_COMMON,
  SENTENCE_COMMON,
  REPETITION_COMMON,
  POLITE_TONE_COMMON,
} = require("../common");

const BLOG_STYLE_CORE = `
${SYSTEM_COMMON}

${STYLE_COMMON}

${PROHIBITED_COMMON}

${TONE_COMMON}

${SENTENCE_COMMON}

${REPETITION_COMMON}

${POLITE_TONE_COMMON}

- 美しい自然な日本語で書く。
- 日本語として不自然な助詞・活用・語順を禁止する。
- 「翻訳調」「AI生成っぽい機械文」は不可。
- 「この配置は〜」の反復、「〜をもたらす／促す／与える」の多用を避ける。
- 構造が見える具体語で書き、抽象語の連打で埋めない。
- 「〜されている」「〜といえる」「〜が見受けられる」を多用しない
- 不自然な連結語（そのため／したがって／また）を減らす
- 日本語として読んで違和感があれば必ず書き直す
- 「翻訳文っぽさ」を検出したら書き直す
`.trim();

const BLOG_ANCHOR_RULE = `
【具体アンカー】
- 具体アンカーを最低1つ入れる（度数/サイン/元素数/モード数/角度/orb/時刻/scoreなど）。
`.trim();

const BLOG_MOON_EVENT_GUIDE = `
以下のINPUTから、満月/新月当日のブログ本文をHTMLのみで生成する。

出力構成:
- <h2>DATE_DOTS｜MOON_SIGN + PHASE</h2>
- 導入（1〜2文）: この満月/新月の配置を一言で置く
- <h2>1｜太陽と月</h2>
  - サイン・度数・関係（角度）だけ書く。一般論や意味づけは禁止。
- <h2>2｜軸</h2>
  - 向かい合い / 重なり / 張力 を状態として置く。
- <h2>3｜全体構造</h2>
  - 元素 / モード / 分布 を短く。
- <h2>4｜観測</h2>
  - 状態として閉じる（結論なし）。

出力ルール:
- HTMLのみ。Markdown禁止。
- 箇条書き禁止。
- 未来断定/指示/救済/運命固定/「あなた」を避ける。
- 「満月/新月の意味」一般論は禁止。
- 入力にない天体/時刻は追加しない。
- 冗長に引き伸ばさない。

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim();

module.exports = Object.freeze({
  BLOG_MOON_EVENT_GUIDE,
});
