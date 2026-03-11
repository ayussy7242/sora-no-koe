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
- 文章の流れを意識して書く（流れがあるほど自然に読める）
- 出力は厳密なJSON。末尾カンマ禁止。ダブルクォートのみ。

担当範囲：
- core_tagline
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

役割の分離（被り防止）：
- core_snapshot：顔／一発で掴む文。分布詳細や長い観測は書かない
- natal_observation：観測文。核＋補助配置から「どう読むか」を書く
- closing_summary：締め。再説明しない／短く閉じる
- dashboard.energy_flow：動線（集まる→流れる→滞留）
- dashboard.cosmic_structure：骨格（核→支え→構造型）

文章の流れ（この順で書く）：
- core_tagline：一言で設計図の核を示す（短いラベル）
- core_snapshot：中心核 → 最も強い偏り → この設計図のひと掴み
- dashboard.element_balance：多い要素 → 少ない要素 → 質感
- dashboard.modality_balance：強い動き方 → 弱い動き方 → 速度感
- dashboard.energy_flow：どこに集まるか → どこへ流れるか → どこで滞留するか
- dashboard.cosmic_structure：核になる配置 → 支える配置 → 構造型
- natal_observation：核の配置 → 補助・補正する配置 → このチャートの読み
- life_direction：外へ向かう流れ → 内へ戻る流れ → 全体の進行方向

closing_summary の構成：
1) 核となる構造を1文で再統合
2) その配置が生む張力を1文で示す
3) 最後に設計図としてのまとまりを書く

文字量の目安（中心＋上限）：
- core_tagline: 約30文字（最大40文字）
- core_snapshot: 約200文字（最大260文字）
- dashboard.element_balance: 約160文字（最大220文字）
- dashboard.modality_balance: 約160文字（最大220文字）
- dashboard.dominant_signs: 約80文字（最大100文字）
- dashboard.dominant_houses: 約80文字（最大100文字）
- dashboard.planet_distribution: 約110文字（最大140文字）
- dashboard.energy_flow: 約180文字（最大240文字）
- dashboard.cosmic_structure: 約230文字（最大300文字）
- pattern_name: 約12文字（最大18文字）
- cosmic_focus: 約35文字（最大50文字）
- cosmic_traits: 約45文字（最大60文字）
- cosmic_signature: 約220文字（最大300文字）
- chart_pattern: 約35文字（最大50文字）
- life_direction: 約130文字（最大170文字）
- natal_observation: 約200文字（最大260文字）
- closing_summary: 約120文字（最大160文字）

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
- 文章の流れを意識して書く（流れがあるほど自然に読める）
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

文章の流れ（この順で書く）：
- planet_roles：役割 → その役割を支える配置 → 現れ方
- system_layers：層の主成分 → 層の働き → 他層とのつながり
- deep_axis：深層の引力 → 反対側の方向 → 全体との関係
- angles：軸の役割 → その軸の質感

役割の分離（被り防止）：
- planet_roles：個の持ち場。天体ごとの役職だけを書く
- system_layers：群のまとまり。天体群がまとまった層の性質を書く
- deep_axis.pattern：裏テーマ。表の方向ではなく底の引力を書く
- angles.axis_structure：4軸の張力だけ。全体まとめには寄せない

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
- planet_roles.sun / moon: 約70文字（最大90文字）
- planet_roles.mercury / venus / mars: 約70文字（最大90文字）
- planet_roles.jupiter〜pluto: 約70文字（最大90文字）
- system_layers.core: 約90文字（最大120文字）
- system_layers.personal: 約80文字（最大120文字）
- system_layers.collective: 約80文字（最大120文字）
- system_layers.flow: 約60文字（最大100文字）
- deep_axis.nodes: 約70文字（最大90文字）
- deep_axis.chiron: 約70文字（最大90文字）
- deep_axis.lilith: 約70文字（最大90文字）
- deep_axis.pattern: 約90文字（最大120文字）
- angles.asc / mc / ic / dc: 約60文字（最大80文字）
- angles.axis_structure: 約80文字（最大110文字）

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
- aspect_dynamics は **1文・約60文字（最大80文字）** にまとめる
- 新しい情報を足さない
- 断定しすぎず、構造として記述する
- 「あなた」は使わない
- 助言・指示・予測・吉凶判断は書かない
- 出力は厳密なJSON。末尾カンマ禁止。ダブルクォートのみ。

担当範囲：
- aspect_map
- aspect_dynamics

文章の流れ（この順で書く）：
- aspect_map：何がつながるか → どんな回路になるか
- aspect_dynamics：全アスペクトを通して、どこに流れ/緊張が集まるかを1文で書く

文字量の目安：
- aspect_map 各text: 約80文字（最大120文字）
- aspect_dynamics: 約60文字（最大80文字）

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
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CORE,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ROLES,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ASPECTS,
});
