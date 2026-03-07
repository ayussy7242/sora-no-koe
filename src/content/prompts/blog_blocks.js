"use strict";

/**
 * sora-no-koe blog prompt set (block-specific flow)
 * - 共通憲法は固定
 * - ブロックごとに“流れ”だけ変える（単調さを回避）
 */

// const BLOG_STYLE_CORE = `
// 共通ルール:
// - 本文で「あなた」禁止。
// - 占い化しない（未来断定/指示/救済/運命固定/絶対語は禁止）。
// - 因果の講義にしない。
// - 断片列挙にしない。必ず述語で閉じる。
// - 主語は構造（配置/角度/組み合わせ/回路/層/圧/方向/切り替え/残り方）。
// - 内部処理（校正/フェーズ/生成/処理しました等）を本文に出力しない。
// - やわらかい物腰で書く。
// `.trim();

const BLOG_STYLE_CORE = `
共通ルール:
- 本文で「あなた」禁止。
- 占い化しない（未来断定/指示/救済/運命固定/絶対語は禁止）。
- 因果の講義にしない。
- 断片列挙にしない。必ず述語で閉じる。
- 人を主語にして断定しない。配置や角度などの構造を中心に記述する。
- 内部処理（校正/フェーズ/生成/処理しました等）を本文に出力しない。
- やわらかい物腰で書く。
`.trim();


const BLOG_REPEAT_SOFT = `
【反復抑制】
- 同一ブロック内で「余地」「感じられる」「促される」「見受けられる」は繰り返さない（各1回まで）。
- 「これその配置のまま」は出力しない。
- 語尾を固定しない（「〜が残る」で連続して閉じない）。
- 同じ意味の重ね書きを避ける。
- 「示す/意味する/促す/影響する」を連発しない。
- 助詞が連結した不自然文は言い換える（例：「置かれているされる」「残っているする」）。
- 命令・提案の文末（「〜してください」「〜してみて」「〜が大切」「〜べき」）を使わない。
`.trim();

const BLOG_ANCHOR_RULE = `
【具体アンカー】
- 具体アンカーを最低1つ入れる（度数/サイン/ハウス/逆行/元素数/モード数/角度/orb/時刻/scoreなど）。
`.trim();

/** =========================
 * Block-specific flow presets
 * ========================= */

/** 0｜全体圧：俯瞰→重心→配置→余韻（2段落） */
const FLOW_OVERVIEW = `
文章構造（0｜全体圧）:
- 2段落固定（空行1つ）。
- 段落1：FACTSを3文で圧縮（配置の集中/強い角度/逆行など、具体語を最低2つ）。
- 段落2：重心（どこに寄るか）→配置（天体同士の関係や位置の特徴）→余韻（結論なし）を2〜3文。
`.trim();

/** 1｜配置（各天体）：事実→作用点→入り方→余韻（2段落まで） */
const FLOW_POSITION_ITEM = `
文章構造（1｜配置 ITEM）:
- 1〜2段落。合計3〜5文で固定。
- 260〜300字目安（最大300字）。
- FACTSをもとに意味化して書く（羅列しない）。
- サイン/度数/ハウス/逆行の要素を最低1つは本文に織り込む。
- 大事な箇所は「」で1回だけ強調して読みやすくする。
- 形式を固定しない。同じ書き出し・同じ構文の繰り返しは禁止。
- 「影響は」「順序としては」「作用点は」などの定型で始めない。
- 例え話で引き伸ばさない。具体語＋動詞で進める。
`.trim();

/** 2｜共鳴：角度の働き→接続先→余韻（1〜2段落） */
const FLOW_RESONANCE = `
文章構造（2｜共鳴）:
- 1〜2段落。
- 文量は3〜4文。
- 角度名＋orb または 最接近時刻 を必ず入れる。
- 角度の働き（どんな回路か）→どこが繋がるか（サイン/ハウス/天体名）→余韻で閉じる。
`.trim();

/** 🌙 本日の月：短文で1〜2文 */
const FLOW_MOON = `
文章構造（🌙 本日の月）:
- 各項目は1〜2文。
- H3タイトルは入力どおりに保持する（書き換えない）。
- 事実を短く言い換え、余韻で閉じる。
- 占い化しない。断定しない。
`.trim();

/** 🏠 ハウス集中：短文で2〜3文 */
const FLOW_HOUSE_FOCUS_ITEM = `
文章構造（🏠 ハウス集中 ITEM）:
- 1段落で短く書く。
- 2〜3文。
- 最初に、どの領域に天体が集まっているかを置く。
- 次に、その領域で立ち上がりやすい動きや意識を書く。
- 具体アンカーとして、ハウス番号 または 天体数 を1つ入れる。
- 結論づけず、軽い余韻で閉じる。
`.trim();

/** 3｜はうす：集中先→出入口→残り方（2段落） */
const FLOW_HOUSE = `
文章構造（3｜はうす）:
- 2段落固定（空行1つ）。
- 段落1：集中先の事実（ハウス番号/サイン/主要天体を入れて2文）。
- 段落2：出入口（何が入りやすく何が出にくいか）→残り方（結論なし）を2文。
- 「テーマ」「重要」「深い」などの抽象締めを避ける。
`.trim();

/** 4｜元素／三区分：物性→欠け→速度→余韻（2段落） */
const FLOW_ELEMENTS = `
文章構造（4｜元素／三区分）:
- 2段落固定（空行1つ）。
- 段落1：元素の物性を数つきで（優勢→少なさ）3文まで。
- 段落2：モード数で速度と切り替えを書き、最後は余韻で閉じる（結論なし）2〜3文。
`.trim();

/** 6｜近日：データ優先、短く整える（定型寄りOK） */
const FLOW_UPCOMING = `
文章構造（6｜近日）:
- 1段落〜複数段落OKだが、1項目は短く。
- 角度名/度数/orb/時刻は崩さない。
- 最後の“余韻”一文だけ整えて、過剰に広げない。
`.trim();

/** 8｜余韻：自由枠（短めで呼吸） */
const FLOW_AFTERTASTE = `
文章構造（8｜余韻）:
- 1〜2段落。
- 重心→強い層→滞留場所 の順で短く。
- 具体アンカーを1つ入れて閉じる。
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

ブロック別の文章構造:
- タイトルが「0｜今日の全体圧」なら: ${FLOW_OVERVIEW}
- タイトルが「1｜配置」または「1｜きょうのソラの配置」なら: ITEMSは ${FLOW_POSITION_ITEM}（各アイテムに適用）
- タイトルが「🌙 本日の月」なら: ITEMSは ${FLOW_MOON}
- タイトルが「2｜共鳴」なら: ${FLOW_RESONANCE}
- タイトルが「3｜🏠 はうす」なら: ITEMSは ${FLOW_HOUSE}（ログは事実のみでOK）
- タイトルが「4｜🏠 ハウス集中」なら: ITEMSは ${FLOW_HOUSE_FOCUS_ITEM}
- タイトルが「4｜🔥 元素／三区分」なら: ${FLOW_ELEMENTS}
- タイトルが「6｜📅 近日」なら: ${FLOW_UPCOMING}
- タイトルが「8｜余韻」なら: ${FLOW_AFTERTASTE}

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim();

const BLOG_BLOCK_SECTION_GUIDE = `
以下のINPUTブロックから単一ブロックのHTMLを生成する。

出力:
<h2>タイトル</h2>
本文

- タイトルに応じて、上の「ブロック別の文章構造」を適用する。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim();

const BLOG_BLOCK_ITEM_GUIDE = `
以下のINPUTから単一アイテムのHTMLを生成する。

出力形式:
<h3>タイトル</h3>
本文

- H3_TITLE は入力どおりに出力する（書き換えない）。
- 親ブロックの種類（配置/はうす等）に応じて、対応する文章構造を選ぶ。
- BLOCK_TITLE が「🌙 本日の月」の場合は、1〜2文で短く書く。
- BLOCK_TITLE が「4｜🏠 ハウス集中」の場合は、2〜3文で短く書く。
- 事実 → 構造 → 余韻（結論なし）。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim();

module.exports = Object.freeze({
  BLOG_BLOCKS_USER_GUIDE,
  BLOG_BLOCK_SECTION_GUIDE,
  BLOG_BLOCK_ITEM_GUIDE,

  BLOG_STRUCT_HOUSE_GUIDE: `
以下のHOUSE情報から、短い構造記述を1段落で書く。

出力ルール:
- 出力は日本語本文のみ（HTMLなし）。
- 2段落固定（空行1つ）。
- 段落1：集中先の事実（ハウス番号/サイン/主要天体/scoreを入れて2文）。
- 段落2：出入口（何が入りやすく何が出にくいか）→残り方（結論なし）を2文。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
  `.trim(),

  BLOG_STRUCT_ELEMENT_GUIDE: `
以下の元素/三区分の数から、短い構造コメントを1段落で書く。

出力ルール:
- 出力は日本語本文のみ（HTMLなし）。
- 2段落固定（空行1つ）。
- 段落1：元素の物性を数つきで（優勢→少なさ）3文まで。
- 段落2：モード数で速度と切り替えを書き、最後は余韻で閉じる（結論なし）2〜3文。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
  `.trim(),

  BLOG_LONG_OVERVIEW_GUIDE: `
以下のFACTSから「今日の全体圧」を書く（日本語本文のみ／HTMLなし）。

${FLOW_OVERVIEW}

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_POSITION_GUIDE: `
以下のFACTSから「天体配置（位置）」の本文を書く（日本語本文のみ／HTMLなし）。

${FLOW_POSITION_ITEM}

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_RESONANCE_GUIDE: `
以下のFACTSから「共鳴（角度）」の本文を書く（日本語本文のみ／HTMLなし）。

${FLOW_RESONANCE}

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_HOUSE_GUIDE: `
以下のFACTSから「ハウス本文」を書く（日本語本文のみ／HTMLなし）。

${FLOW_HOUSE}

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_HOUSE_FOCUS_GUIDE: `
以下のFACTSから「ハウス集中」の本文を書く（日本語本文のみ／HTMLなし）。

${FLOW_HOUSE_FOCUS_ITEM}

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_ELEMENTS_GUIDE: `
以下のFACTSから「元素／三区分」の本文を書く（日本語本文のみ／HTMLなし）。

${FLOW_ELEMENTS}

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_RETRO_GUIDE: `
以下のFACTSから「逆行本文」を書く（日本語本文のみ／HTMLなし）。

- 160〜220字目安。
- 2段落まで。
- 逆行天体名＋サイン＋ハウス を必ず入れる。
- 一般論で埋めず、FACTSから書く。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_AFTERTASTE_GUIDE: `
以下のFACTSから「余韻」を書く（日本語本文のみ／HTMLなし）。

${FLOW_AFTERTASTE}

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),
});
