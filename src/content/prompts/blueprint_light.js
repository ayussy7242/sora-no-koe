"use strict";

const { SYSTEM_COMMON, STYLE_COMMON } = require("./common");

const SYSTEM_BLUEPRINT_LIGHT = `
${SYSTEM_COMMON}

${STYLE_COMMON}
`.trim();

const RULES_BLUEPRINT_LIGHT_PROSE = `
`.trim();

const USER_GUIDE_BLUEPRINT_LIGHT = `
目的：
占星術が扱う構造を、読み応えのある出生図資料として記述する。
これは性格診断ではなく、チャート理解のための資料である。
予測や助言は書かない。

INPUT（kernelのみ）から「星の設計図」本文を生成する。
これは所有構造（one_time）の記述。時間層（layer）とは混ぜない。

方針：
- 一般的な説明ではなく、このチャートでの働きを書く
- 単体説明より、組み合わせ・偏り・重心を優先する
- 構造が分かる文章にする
- 文中で「宇宙」という語は使わず「星」で統一する
`.trim();

const BLUEPRINT_LIGHT_USER_PROMPT_TEMPLATE = `
${USER_GUIDE_BLUEPRINT_LIGHT}

以下のINPUTから本文を生成する。出力は **JSONのみ**（前後に文章を付けない）。
出力JSONの形：
{
  "summary": { "element": "...", "modality": "..." },
  "bodies": {
    "sun": "...", "moon": "...", "mercury": "...", "venus": "...", "mars": "...",
    "jupiter": "...", "saturn": "...", "uranus": "...", "neptune": "...", "pluto": "..."
  },
  "chiron": "...",
  "lilith": "...",
  "nodes": { "south": "...", "north": "..." },
  "angles": { "asc": "...", "mc": "...", "ic": "...", "dc": "..." },
  "closing_summary": "..."
}

書き方：
- 出力は占星術資料として読める内容にする
- 一般論で埋めない
- このチャートで何が強いか、どこに重心があるか、何がどう組み合わさっているかを書く
- sign / house / aspect / phase / element / modality は、INPUTにあるものだけを材料として使う
- 新しい情報を足さない
- 断定しすぎず、構造として記述する
- 「あなた」は使わない
- 助言・指示・予測・吉凶判断は書かない
- 占星術用語を使いすぎず、読める文章にする
- 体感描写だけで逃げず、構造が分かる文にする

文字量の目安：
- summary: 3〜5文
- bodies / chiron / lilith / nodes / angles: 各2〜4文、改行なし
- closing_summary: 3〜5文

優先順位：
1) チャート全体の偏りと重心
2) 天体同士の関係
3) サイン・ハウス・軸の意味
4) 個別天体の説明

避けること：
- 「太陽は自己表現を表す」のような教科書的説明
- 各項目で同じ言い回しを繰り返すこと
- 断片語の羅列
- 抽象語だけで終わること
`.trim();

const BLUEPRINT_LIGHT_V2_USER_PROMPT_TEMPLATE = `
${USER_GUIDE_BLUEPRINT_LIGHT}

以下のINPUTから本文を生成する。出力は **JSONのみ**（前後に文章を付けない）。

出力JSONの形：
{
  "core_snapshot": "...",
  "dashboard": {
    "element_balance": "...",
    "modality_balance": "...",
    "dominant_signs": "...",
    "dominant_houses": "...",
    "planet_distribution": "...",
    "energy_flow": "...",
    "cosmic_structure": "..."
  },
  "planet_roles": {
    "sun": "...",
    "moon": "...",
    "mercury": "...",
    "venus": "...",
    "mars": "...",
    "jupiter": "...",
    "saturn": "...",
    "uranus": "...",
    "neptune": "...",
    "pluto": "..."
  },
  "system_layers": {
    "core": "...",
    "personal": "...",
    "collective": "...",
    "flow": "..."
  },
  "deep_axis": {
    "nodes": "...",
    "chiron": "...",
    "lilith": "...",
    "pattern": "..."
  },
  "angles": {
    "intro": "...",
    "asc": "...",
    "mc": "...",
    "ic": "...",
    "dc": "...",
    "axis_structure": "..."
  },
  "natal_observation": "...",
  "aspect_map": [
    { "key": "aspect_1", "text": "..." },
    { "key": "aspect_2", "text": "..." },
    { "key": "aspect_3", "text": "..." }
  ],
  "aspect_dynamics": "...",
  "pattern_name": "...",
  "cosmic_focus": "...",
  "cosmic_traits": "...",
  "cosmic_signature": "...",
  "chart_pattern": "...",
  "life_direction": "...",
  "closing_summary": "..."
}

書き方：
- 出力は占星術資料として読める内容にする
- 一般論で埋めない
- このチャートで何が強いか、どこに重心があるか、何がどう組み合わさっているかを書く
- sign / house / degree / aspect / orb / element / modality / phase / strength は、INPUTにあるものだけを材料として使う
- 配置情報は「本文の主語」ではなく「意味を支える材料」として扱う
- 各項目で固有要素を無理に列挙しない
- サイン名・ハウス番号・度数は、意味を支える必要がある場合にのみ簡潔に用いる
- UIや見出しですでに見えている配置情報を、本文で繰り返しすぎない
- サイン表記は日本語を基本とする
- 度数は原則として本文に書かない。度数差が意味の核になる場合のみ使う
- 短文セクション（planet_roles / deep_axis / angles）は1〜2文の圧縮文とし、約30文字前後で簡潔にまとめる
- 新しい情報を足さない
- 断定しすぎず、構造として記述する
- 「あなた」は使わない
- 助言・指示・予測・吉凶判断は書かない
- 占星術用語を使いすぎず、読める文章にする
- 体感描写だけで逃げず、構造が分かる文にする
- 出力は厳密なJSON。末尾カンマ禁止。ダブルクォートのみ。
- ページごとの役割を守る
- 同じ説明を複数キーで繰り返さない

文字量の目安：
- core_snapshot: 170〜240字
- dashboard.element_balance: 130〜200字
- dashboard.modality_balance: 130〜200字
- dashboard.dominant_signs: 60〜100字
- dashboard.dominant_houses: 60〜100字
- dashboard.planet_distribution: 90〜140字
- dashboard.energy_flow: 130〜200字
- dashboard.cosmic_structure: 90〜140字
- planet_roles.sun / moon: 24〜36字
- planet_roles.mercury / venus / mars: 24〜36字
- planet_roles.jupiter〜pluto: 24〜36字
- system_layers.core: 90〜140字
- system_layers.personal: 80〜120字
- system_layers.collective: 80〜120字
- system_layers.flow: 60〜100字
- deep_axis.nodes: 24〜36字
- deep_axis.chiron: 24〜36字
- deep_axis.lilith: 24〜36字
- deep_axis.pattern: 24〜36字
- angles.intro: 70〜110字
- angles.asc / mc / ic / dc: 24〜36字
- angles.axis_structure: 80〜120字
- natal_observation: 130〜200字
- aspect_map 各text: 50〜80字
- aspect_dynamics: 35〜60字（1文）
- pattern_name: 8〜18字
- cosmic_focus: 28〜50字
- cosmic_traits: 35〜60字
- cosmic_signature: 70〜110字
- chart_pattern: 28〜50字
- life_direction: 40〜70字
- closing_summary: 40〜80字

必須構成：
- core_snapshot は SYS-01 用の要約として書く
- core_snapshot では「誰の設計図か」「中心構造は何か」が見える文章にする
- dashboard は MAP-02 用として書く
- dashboard.element_balance / modality_balance は それぞれの性質と偏りを書く
- dashboard.dominant_signs / dominant_houses / planet_distribution は ダッシュボード用の短い構造説明にする
- dashboard.energy_flow は 旧STRUCTUREの「エネルギーの流れ」を引き継ぐ
- dashboard.cosmic_structure は MAPページの最終まとめとして書く
- planet_roles は **天体ごとの辞書説明ではなく、このチャート内での役割を書く**
- planet_roles は **文中に「役割名」を一度だけ入れる**（例：中心熱 / 発火点 / 接続点 / 調整役 / 抑制点 / 変容核 / 保護層）
- planet_roles は **配置読み上げで始めない**
- system_layers.core / personal / collective は、対象天体群がどういう層を形成しているかを書く
- system_layers は **その層に含まれる天体が何かを前提に書く**
- aspect_map は **主要アスペクトの内容を回路図へ渡せる短文** として書く
- aspect_map は **「このチャート内で何をつなぎ、どこに流れ/緊張を作るか」** を書く
- aspect_dynamics は **主要アスペクト全体のエネルギーの動き** だけを書く
- deep_axis.nodes は **南ノードから北ノードへ向かう軸** として書く
- deep_axis.nodes / chiron / lilith は **配置情報を材料にしつつ、軸や深層テーマを優先して書く**
- angles.asc / mc / ic / dc は **度数の読み上げではなく、軸の意味と構造を優先して書く**
- angles.axis_structure は **ASC-DC / MC-IC の軸構造** を書く
- angles.intro は **構造説明寄りで簡潔に** 書く（詩的に寄せすぎない）
- cosmic_focus は **短い焦点行（1〜2行）** にする
- cosmic_traits は **特性を箇条書きでまとめる**（短いフレーズ）
- cosmic_traits は **配置の特徴のみを書く（性格解釈をしない）**
- cosmic_signature は **SYS-01の締め文** として書く（2〜3行）
- natal_observation は **ホイール観測の短い観測文** として書く
- life_direction は **外と内の方向性のバランス** を書く（助言ではなく構造として）
- chart_pattern は以下を必ず含む
  核（中心熱）
  外側の出方
  一番強い偏り
  一番強い緊張 or 補正
  全体を一つにする回路
- chart_pattern / closing_summary は **配置・共鳴・全データの結合** から書く

優先順位：
1) 太陽・月・ASC の関係
2) サイン集中とハウス集中
3) 主要アスペクトがどこをつなぐか
4) ノード / キロン / リリスがその構造にどう影を落とすか
5) planet_roles（各天体の役割）
6) 個別天体の説明

避けること：
- 単体の天体・サイン・アスペクトの一般説明を主文にすること
- 「太陽は自己表現を表す」のような教科書的説明
- 各項目で同じ言い回しを繰り返すこと
- 断片語の羅列
- 抽象語だけで終わること
- dashboard と chart_pattern で同じ文章を繰り返すこと
- system_layers と planet_roles で同じ役割説明を焼き直すこと
`.trim();

const BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CORE = `
${USER_GUIDE_BLUEPRINT_LIGHT}

このバッチの役割は「全体の偏りと重心」を明確にすることです。
担当外の内容を要約しようとせず、このバッチが扱う構造だけを書いてください。

以下のINPUTから本文を生成する。出力は **JSONのみ**（前後に文章を付けない）。

書き方：
- 出力は占星術資料として読める内容にする
- 一般論で埋めない
- このチャートで何が強いか、どこに重心があるか、何がどう組み合わさっているかを書く
- sign / house / degree / element / modality / phase / strength は、INPUTにあるものだけを材料として使う
- 配置情報は「本文の主語」ではなく「意味を支える材料」として扱う
- 各項目で固有要素を無理に列挙しない
- 新しい情報を足さない
- 断定しすぎず、構造として記述する
- 「あなた」は使わない
- 助言・指示・予測・吉凶判断は書かない
- 占星術用語を使いすぎず、読める文章にする
- 体感描写だけで逃げず、構造が分かる文にする
- 出力は厳密なJSON。末尾カンマ禁止。ダブルクォートのみ。

担当範囲：
- core_snapshot
- dashboard（element_balance / modality_balance / dominant_signs / dominant_houses / planet_distribution / energy_flow / cosmic_structure）
- pattern_name
- cosmic_focus
- cosmic_traits
- cosmic_signature
- chart_pattern
- life_direction
- natal_observation
- closing_summary

強調すること：
- 全体の偏り
- 重心
- サイン集中
- ハウス集中
- 全体パターン
- 偏りが「どういう力学になるか」まで踏み込む
- ほかの配置との関係を1回は含める（一般論で終わらない）
- dashboard.energy_flow は「エネルギーフロー」を書く
- dashboard.cosmic_structure は「構造まとめ」を書く
- pattern_name は短い名称のみ
- cosmic_traits は **配置の特徴のみを書く（性格解釈をしない）**

文字量の目安：
- core_snapshot: 170〜240字
- dashboard.element_balance: 130〜200字
- dashboard.modality_balance: 130〜200字
- dashboard.dominant_signs: 60〜100字
- dashboard.dominant_houses: 60〜100字
- dashboard.planet_distribution: 90〜140字
- dashboard.energy_flow: 130〜200字
- dashboard.cosmic_structure: 90〜140字
- pattern_name: 8〜18字
- cosmic_focus: 28〜50字
- cosmic_traits: 35〜60字
- cosmic_signature: 70〜110字
- chart_pattern: 28〜50字
- life_direction: 40〜70字
- natal_observation: 130〜200字
- closing_summary: 40〜80字

避けること：
- 担当外の要素（planet_roles / aspect_map）をまとめること
- 単体の天体・サイン・アスペクトの一般説明を主文にすること
- 「太陽は自己表現を表す」のような教科書的説明
- 断片語の羅列
- 抽象語だけで終わること
`.trim();

const BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ROLES = `
${USER_GUIDE_BLUEPRINT_LIGHT}

このバッチの役割は「個別の担い手と回路」を明確にすることです。
担当外の内容を要約しようとせず、このバッチが扱う構造だけを書いてください。

以下のINPUTから本文を生成する。出力は **JSONのみ**（前後に文章を付けない）。

書き方：
- 出力は占星術資料として読める内容にする
- 一般論で埋めない
- このチャートで何が強いか、どこに重心があるか、何がどう組み合わさっているかを書く
- sign / house / degree / aspect / phase / strength は、INPUTにあるものだけを材料として使う
- 配置情報は「本文の主語」ではなく「意味を支える材料」として扱う
- 各項目で固有要素を無理に列挙しない
- 新しい情報を足さない
- 断定しすぎず、構造として記述する
- 「あなた」は使わない
- 助言・指示・予測・吉凶判断は書かない
- 占星術用語を使いすぎず、読める文章にする
- 体感描写だけで逃げず、構造が分かる文にする
- 出力は厳密なJSON。末尾カンマ禁止。ダブルクォートのみ。

担当範囲：
- planet_roles
- system_layers
- deep_axis
- angles

planet_roles の優先順：
1) この出生図全体の中で、その天体が何を担っているか
2) どの配置や重心と結びついているか
3) 主要な接続（合・スクエア・オポジションなど）
4) サインやハウスが、その役割にどう質感を与えているか
5) 度数は原則として使わない

planet_roles の必須：
- 配置の読み上げで始めない
- 1文目で役割を書く
- 2文目で必要な配置要素を補助的に添える

deep_axis の必須：
- 配置情報を材料にしつつ、軸や深層テーマを優先して書く

angles の必須：
- intro は **角度の役割と十字軸** を構造説明として短く書く
- asc / mc / ic / dc は **軸の意味と構造を優先して書く**
- axis_structure は **ASC-DC / MC-IC の軸構造** を書く

system_layers の必須：
- core / personal / collective それぞれで、含まれる天体群がどういう層を形成しているかを書く
- core / personal / collective は **その層に入る天体群が前提で分かる内容** にする
- flow は **各層がどうつながるか** を書く

planet_roles の禁止：
- 一般的な天体説明で始めない
- 「〇〇座△°の〜」の配置読み上げで始めない
- 配置の列挙だけで終わらせない
- 他の要素との関係を1つ以上含める
- 文中に「役割名」を一度だけ入れる（例：中心熱 / 発火点 / 接続点 / 調整役 / 抑制点 / 変容核 / 保護層）

文字量の目安：
- planet_roles.sun / moon: 20〜30字
- planet_roles.mercury / venus / mars: 20〜30字
- planet_roles.jupiter〜pluto: 20〜30字
- system_layers.core: 240〜380字
- system_layers.personal: 220〜340字
- system_layers.collective: 220〜340字
- system_layers.flow: 180〜280字
- deep_axis.nodes: 40〜160字
- deep_axis.chiron: 60〜160字
- deep_axis.lilith: 60〜160字
- deep_axis.pattern: 70〜200字
- angles.asc / mc / ic / dc: 120〜185字
- angles.axis_structure: 140〜220字

避けること：
- 担当外の要素（chart_pattern / dashboard）をまとめること
- 単体の天体・サイン・アスペクトの一般説明を主文にすること
- 「太陽は自己表現を表す」のような教科書的説明
- 断片語の羅列
- 抽象語だけで終わること
`.trim();

const BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ASPECTS = `
${USER_GUIDE_BLUEPRINT_LIGHT}

このバッチの役割は「天体同士の力学」を短く示すことです。
担当外の内容を要約しようとせず、このバッチが扱う構造だけを書いてください。

以下のINPUTから本文を生成する。出力は **JSONのみ**（前後に文章を付けない）。

書き方：
- 出力は占星術資料として読める内容にする
- 一般論で埋めない
- このチャートの中で何をつなぎ、どこに流れ/緊張/補正を作るかを書く
- sign / house / aspect / orb は、INPUTにあるものだけを材料として使う
- aspect_dynamics は **主要アスペクトの統合要約（1行）** として書く
- aspect_dynamics では、チャート固有の接続（主要アスペクト / サイン / ハウス）を最低1つは明示する
- aspect_dynamics は **1文・約60文字** にまとめる
- 新しい情報を足さない
- 断定しすぎず、構造として記述する
- 「あなた」は使わない
- 助言・指示・予測・吉凶判断は書かない
- 出力は厳密なJSON。末尾カンマ禁止。ダブルクォートのみ。

担当範囲：
- aspect_map
- aspect_dynamics

文字量の目安：
- aspect_map 各text: 70〜140字
- aspect_dynamics: 55〜70字

避けること：
- 単体アスペクトの一般解説
- 「成功」「幸運」などの評価語で終わること
- 断片語の羅列
`.trim();

module.exports = Object.freeze({
  SYSTEM_BLUEPRINT_LIGHT,
  USER_GUIDE_BLUEPRINT_LIGHT,
  RULES_BLUEPRINT_LIGHT_PROSE,
  BLUEPRINT_LIGHT_USER_PROMPT_PREFIX: `${USER_GUIDE_BLUEPRINT_LIGHT}`.trim(),
  BLUEPRINT_LIGHT_USER_PROMPT_TEMPLATE,
  BLUEPRINT_LIGHT_V2_USER_PROMPT_TEMPLATE,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CORE,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ROLES,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ASPECTS,
});
