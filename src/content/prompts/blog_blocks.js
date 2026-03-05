"use strict";

const BLOG_STYLE_CORE = `
共通ルール:
- 本文で「あなた」禁止。
- 占い化しない。未来断定/指示/救済/運命固定/絶対語は禁止。
- 因果の講義にしない。
- 断片列挙にしない。必ず述語で閉じる。
- 主語は構造（配置/角度/組み合わせ/回路/層/圧/方向/切り替え/残り方）。
- 内部処理や工程（校正/フェーズ/実行/処理しました等）を本文に出力しない。
`.trim();

const BLOG_REPEAT_SOFT = `
【反復抑制】
- 同一ブロック内で「余地」「感じられる」「促される」「見受けられる」を繰り返さない（各1回まで）。
- 「これその配置のまま」は本文に出力しない。
- 結びの語尾を固定しない（「〜が残る」で連続して閉じない）。
- 1段落内で同じ名詞（余地/成長/探求/視点 など）を2回以上使わない。
- 「示す/意味する/促す/影響する」を連発しない。
- 助詞が連結した不自然文は言い換える（例：「置かれているされる」「残っているする」）。
- 同じ意味の重ね書きを避ける（例：余地が残る + 余地が広がる）。
`.trim();

const BLOG_ANCHOR_RULE = `
【具体アンカー】
- 具体アンカーを最低1つ入れる（度数/サイン/ハウス/逆行/元素数/モード数/角度/時刻/score など）。
`.trim();

const BLOG_BLOCKS_USER_GUIDE = `
以下のINPUTブロックから、HTMLのみでブログ本文を生成する。

出力ルール:
- 出力はHTMLのみ。Markdown禁止。
- ブロックの順序はINPUTの順序を厳守。
- 各ブロックは必ず <h2>タイトル</h2> で始める。
- 各ブロックの最初の段落は FACTS を2〜3文で要約して書く。
- ITEMS_AS_H3: yes のブロックは、ITEMSを順番に <h3> で1件ずつ書く。
- 箇条書き禁止。短文連発禁止。必ず述語で閉じる。
- まとめは書かない。最後は余韻で閉じる。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim();

const BLOG_BLOCK_SECTION_GUIDE = `
以下のINPUTブロックから、単一ブロックのHTMLを生成する。

出力ルール:
- 出力はHTMLのみ。Markdown禁止。
- <h2>タイトル</h2> から始める。
- FACTSを2〜3文で要約した短い段落を続ける。
- 箇条書き禁止。短文連発禁止。必ず述語で閉じる。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim();

const BLOG_BLOCK_ITEM_GUIDE = `
以下のINPUTから、単一アイテムのHTMLを生成する。

出力ルール:
- 出力はHTMLのみ。Markdown禁止。
- <h3>タイトル</h3> を必ず先頭に置く（タイトルはINPUTの指定どおり）。
- 段落は原則2段落。
  - 段落1：FACTS要約（2文）。度数/サイン/ハウス/逆行 のうち最低1つを含める。
  - 段落2：圧の説明（2文）。「どこに集まるか」→「どう残るか」。
- 箇条書き禁止。短文連発禁止。必ず述語で閉じる。

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
- 90〜130字目安。
- 2文で書く（最大3文）。
- 必ず具体アンカー（ハウス番号/サイン/天体/scoreのいずれか）を1つ入れる。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
  `.trim(),

  BLOG_STRUCT_ELEMENT_GUIDE: `
以下の元素/三区分の数から、短い構造コメントを1段落で書く。

出力ルール:
- 出力は日本語本文のみ（HTMLなし）。
- 90〜130字目安。
- 2文で書く（最大3文）。
- 必ず具体アンカー（元素数/モード数）を入れる。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
  `.trim(),

  BLOG_LONG_OVERVIEW_GUIDE: `
以下のFACTSから「今日の全体圧」を書く（日本語本文のみ／HTMLなし）。

- 2段落固定（段落間は空行）。
- 全体で 260〜360字 目安。
- 段落1（事実圧縮）：元素/モード + 逆行 or 強い角度 を具体語つきで2〜3文。
- 段落2（圧の説明）：強い集中（サイン/ハウス）→残り方（温度/速度/重心）を2〜3文。
- 結論を置かず、余韻で閉じる。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_POSITION_GUIDE: `
以下のFACTSから「天体配置（位置）」の本文を書く（日本語本文のみ／HTMLなし）。

- 2段落まで（基本1段落でOK）。
- 90〜130字目安。
- 3文（最大4文）。
- サインの質／ハウスの質／度数のニュアンス／逆行のみ。角度には触れない。
- 具体アンカー（度数/ハウス/逆行のいずれか）を必ず入れる。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_RESONANCE_GUIDE: `
以下のFACTSから「共鳴（角度）」の本文を書く（日本語本文のみ／HTMLなし）。

- 1〜2段落。
- 110〜150字目安。
- 3文（最大4文）。
- 角度名＋orb（または最接近時刻）のどちらかを必ず入れる。
- 結論を置かず、残り方で閉じる。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_HOUSE_GUIDE: `
以下のFACTSから「ハウス本文」を書く（日本語本文のみ／HTMLなし）。

- 90〜130字目安。
- 3文（最大4文）。
- ハウス番号＋サイン＋主要天体 を必ず入れる。
- 「どこに集まるか」→「どう残るか」で閉じる。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),

  BLOG_LONG_ELEMENTS_GUIDE: `
以下のFACTSから「元素／三区分」の本文を書く（日本語本文のみ／HTMLなし）。

- 2段落（空行1つ）。
- 220〜300字目安。
- 段落1：優勢の物性（元素数を具体で）＋欠損/少なさの影を短く。
- 段落2：モード数との絡み→圧の質感（温度/速度/重心）で閉じる。

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

- 160〜220字目安。
- 1〜2段落。
- 「重心」→「強い層」→「滞留場所」の順で短く。
- 具体アンカー（強いハウス/角度/元素数のいずれか）を1つ入れる。

${BLOG_STYLE_CORE}
${BLOG_REPEAT_SOFT}
${BLOG_ANCHOR_RULE}
`.trim(),
});
