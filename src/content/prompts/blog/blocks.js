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

/**
 * sora-no-koe blog prompt set (block-specific flow)
 * - 共通思想は common から読む
 * - ブロックごとに“流れ”だけ変える
 */

const BLOG_STYLE_CORE = `
${SYSTEM_COMMON}

${STYLE_COMMON}

${PROHIBITED_COMMON}

${TONE_COMMON}

${SENTENCE_COMMON}

${REPETITION_COMMON}

${POLITE_TONE_COMMON}

- ゆったりとした自然な日本語で書く
- このブログでは語尾を「です・ます」に統一する
- 「だ・である」調は禁止
- 「語尾を固定しない」ルールはブログでは適用しない
- 、はあまり使わない

`.trim();

const BLOG_ANCHOR_RULE = `
【具体アンカー】
- 具体アンカーを最低1つ入れる(度数/サイン/ハウス/逆行/元素数/モード数/角度/orb/時刻/scoreなど)。
`.trim();

/** =========================
 * Block-specific flow presets
 * ========================= */

/** 0|全体圧: 俯瞰→重心→配置→余韻(2段落) */
const FLOW_OVERVIEW = `
文章構造(0|全体圧):
- 2段落固定(空行1つ)。
- 段落1: FACTSを3文で圧縮(配置の集中/強い角度/逆行など、具体的に書く)。
- 段落2: 重心(どこに寄るか)→配置(天体同士の関係や位置の特徴)→余韻(結論なし)を2〜3文。

`.trim();

/** 1|配置(各天体): 事実→作用点→入り方→余韻(2段落まで) */
const FLOW_POSITION_ITEM = `
文章構造(1|配置 ITEM):
- 1〜2段落。合計3〜5文で固定。
- 160〜240字目安(最大260字)。
- FACTSをもとに意味を書く。
- サイン/度数/ハウス/逆行の要素を最低1つは本文に織り込む。
`.trim();

/** 2|共鳴: 角度の働き→接続先→余韻(1〜2段落) */
const FLOW_RESONANCE = `
- 160〜240字目安(最大260字)。
- FACTSをもとに意味を書く。

文章の流れ（必須）:
1文目：
天体Aがどこにあり、
その天体が持つ働きがどの方向に動いているかを書く。
（惑星＝何が動くか／星座＝どう動くか を分けずに統合する）

2文目：
天体Bについても同様に、
その天体の働きがどの方向に動いているかを書く。

3文目：
天体Aと天体Bとアスペクトの動きを統合した意味を具体的に体感として書く。

4文目：
ピーク時刻（ある場合のみ）

表現の方向:
- 星座は「意味」ではなく、その位置で立ち上がる動きとして扱う
- 事実×力学の掛け合わせで“空気”を立てる
- 惑星の意味と星座の向きを内部で統合して使う
- 出力では、意味を説明せず、動きとして置く
`.trim();

/** 🌙 本日の月: 短文で1〜2文 */
const FLOW_MOON = `
文章構造(🌙 本日の月):
- 各項目は1〜2文。
- H3タイトルは入力どおりに保持する(書き換えない)。
- その月の月相とサインの力学を書く
- 事実を短く言い換え、余韻で閉じる。
`.trim();

/** 🏠 ハウス集中: 短文で2〜3文 */
const FLOW_HOUSE_FOCUS_ITEM = `
文章構造(🏠 ハウス集中 ITEM):
- 1段落で短く書く。
- 2〜3文。
- 最初に、どの領域に天体が集まっているかを置く。
- 次に、その領域で立ち上がりやすい動きや意識を書く。
- 具体アンカーとして、ハウス番号 または 天体数 を1つ入れる。
`.trim();

/** 3|はうす: 集中先→出入口→残り方(2段落) */
const FLOW_HOUSE = `
文章構造(3|はうす):
- 2段落固定(空行1つ)。
- 段落1: 集中先の事実(ハウス番号/サイン/主要天体を入れて2文)。
- 段落2: 出入口(何が入りやすく何が出にくいか)→残り方(結論なし)を2文。
- 「テーマ」「重要」「深い」などの抽象締めを避ける。
`.trim();

/** 4|元素／三区分: 物性→欠け→速度→余韻(2段落) */
const FLOW_ELEMENTS = `
文章構造(4|元素／三区分):
- 2段落固定(空行1つ)。
- 段落1: 元素の物性を数つきで(優勢→少なさ)3文まで。
- 段落2: モード数で速度と切り替えを書き、最後は余韻で閉じる(結論なし)2〜3文。
`.trim();

/** 6|近日: データ優先、短く整える(定型寄りOK) */
const FLOW_UPCOMING = `
文章構造(6|近日):
- 1段落〜複数段落OKだが、1項目は短く。
- 角度名/度数/orb/時刻は崩さない。
`.trim();

/** 8|余韻: 自由枠(短めで呼吸) */
const FLOW_AFTERTASTE = `
文章構造(8|余韻):
- 1〜2段落。
- 重心→強い層→滞留場所 の順で短く。
`.trim();

/** ============
 * Generators
 * ============ */

const BLOG_BLOCKS_USER_GUIDE = `
以下のINPUTブロックから、HTMLのみでブログ本文を生成する。

出力ルール:
- 出力はHTMLのみ。Markdown禁止。
- ブロック順序はINPUT順序を厳守。
- 各ブロックは必ず <h2>タイトル</h2> で始める。
- ITEMS_AS_H3: yes のブロックは ITEMS を <h3> で1件ずつ出力する。
- 箇条書き禁止。
- まとめを書かない。最後は余韻で閉じる。
- 各ブロックの文字量: 300文字目安
- ですます口調で書く
- ゆったりとした美しい日本語で書く
- 具体語＋動詞で書く。

ブロック別の文章構造:
- タイトルが「0|今日の全体圧」なら: ${FLOW_OVERVIEW}
- タイトルが「1|配置」または「1|きょうのソラの配置」なら: ITEMSは ${FLOW_POSITION_ITEM}(各アイテムに適用)
- タイトルが「2|🌙 本日の月」なら: ITEMSは ${FLOW_MOON}
- タイトルが「3|共鳴」なら: ${FLOW_RESONANCE}
- タイトルが「4|🏠 はうす」なら: ITEMSは ${FLOW_HOUSE}(ログは事実のみでOK)
- タイトルが「5|🏠 ハウス集中」なら: ITEMSは ${FLOW_HOUSE_FOCUS_ITEM}
- タイトルが「6|🔥 元素／三区分」なら: ${FLOW_ELEMENTS}
- タイトルが「7|📅 近日」なら: ${FLOW_UPCOMING}
- タイトルが「8|余韻」なら: ${FLOW_AFTERTASTE}

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim();


const BLOG_BLOCK_SECTION_GUIDE = `
以下のINPUTブロックから単一ブロックのHTMLを生成する。

出力:
<h2>タイトル</h2>
本文

- タイトルに応じて、上の「ブロック別の文章構造」を適用する。

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim();

const BLOG_BLOCK_ITEM_GUIDE = `
以下のINPUTから単一アイテムのHTMLを生成する。

出力形式:
<h3>タイトル</h3>
本文

- H3_TITLE は入力どおりに出力する(書き換えない)。
- 親ブロックの種類(配置/はうす等)に応じて、対応する文章構造を選ぶ。
- BLOCK_TITLE が「🌙 本日の月」の場合は、2〜3文で短く書く。
- BLOCK_TITLE が「4|🏠 ハウス集中」の場合は、2〜3文で短く書く。
- 事実 → 構造 → 余韻(結論なし)。

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim();

module.exports = Object.freeze({
  BLOG_BLOCKS_USER_GUIDE,
  BLOG_BLOCK_SECTION_GUIDE,
  BLOG_BLOCK_ITEM_GUIDE,

  BLOG_STRUCT_HOUSE_GUIDE: `
以下のHOUSE情報から、短い構造記述を1段落で書く。

出力ルール:
- 出力は日本語本文のみ(HTMLなし)。
- 2段落固定(空行1つ)。
- 段落1: 集中先の事実(ハウス番号/サイン/主要天体/scoreを入れて2文)。
- 段落2: 出入口(何が入りやすく何が出にくいか)→残り方(結論なし)を2文。

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
  `.trim(),

  BLOG_STRUCT_ELEMENT_GUIDE: `
以下の元素/三区分の数から、短い構造コメントを1段落で書く。

出力ルール:
- 出力は日本語本文のみ(HTMLなし)。
- 2段落固定(空行1つ)。
- 段落1: 元素の物性を数つきで(優勢→少なさ)3文まで。
- 段落2: モード数で速度と切り替えを書き、最後は余韻で閉じる(結論なし)2〜3文。

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
  `.trim(),

  BLOG_LONG_OVERVIEW_GUIDE: `
以下のFACTSから「今日の全体圧」を書く

${FLOW_OVERVIEW}

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_POSITION_GUIDE: `
以下のFACTSから「天体配置(位置)」の本文を書く

${FLOW_POSITION_ITEM}

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_RESONANCE_GUIDE: `
以下のFACTSから「共鳴(角度)」の本文を書く

${FLOW_RESONANCE}

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_HOUSE_GUIDE: `
以下のFACTSから「ハウス本文」を書く

${FLOW_HOUSE}

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_HOUSE_FOCUS_GUIDE: `
以下のFACTSから「ハウス集中」の本文を書く

${FLOW_HOUSE_FOCUS_ITEM}

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_ELEMENTS_GUIDE: `
以下のFACTSから「元素／三区分」の本文を書く

${FLOW_ELEMENTS}

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_RETRO_GUIDE: `
以下のFACTSから「逆行本文」を書く

- 160〜220字目安。
- 2段落まで。
- 逆行天体名＋サイン＋ハウス を必ず入れる。
- 一般論で埋めず、FACTSから書く。

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_AFTERTASTE_GUIDE: `
以下のFACTSから「余韻」を書く

${FLOW_AFTERTASTE}

${BLOG_STYLE_CORE}
${BLOG_ANCHOR_RULE}
`.trim(),
});
