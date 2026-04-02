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
 * Blueprint Light v2 - 最終スッキリ版（エラー完全修正）
 */
const BLUEPRINT_COMMON = `
${SYSTEM_COMMON}

${STYLE_COMMON}

${PROHIBITED_COMMON}

${TONE_COMMON}

${SENTENCE_COMMON}

${REPETITION_COMMON}

${POLITE_TONE_COMMON}

#Blueprint全体の絶対原則
- Blueprintは占星術の配置を、読み応えのある出生図資料として記述する。
- これは性格診断ではなく、チャート理解のための構造資料である。
- 予測や助言は書かない。
- 各ページは固有の役割を持ち、内容の重複は避ける。
- 全体構造は理解したうえで、このページに割り当てられた役割だけを書く。
- 重心が強い場合でも、重心だけで文章を閉じない。
- 可能な限り、重心配置・支える配置・別方向の配置・離れて配置された天体に触れる。
- すべてを均等に説明する必要はないが、重心のみで完結する構造は禁止する。
- 配置の観測として書く。教科書説明・人生解釈・抽象語のみ・配置の単純列挙は禁止。
- ですます口調で自然で美しい日本語を使う。
- かたすぎず、やわらかく、静かな温度で書く。

#共通ルール（全セクション共通）
- 各セクションの文字量を**できるだけ指定した文字量で安定**させる
- 文字量の指定がある場合は**指定範囲の真ん中を目標**に書く
- 抽象語だけで終わらせず、具体的な配置や体感を必ず入れる
`.trim();

/**
 * 後方互換性のため、古い定数名をすべて定義（これでエラー完全解消）
 */
const SYSTEM_BLUEPRINT_LIGHT          = BLUEPRINT_COMMON;
const USER_GUIDE_BLUEPRINT_LIGHT       = BLUEPRINT_COMMON;
const RULES_BLUEPRINT_LIGHT_PROSE      = BLUEPRINT_COMMON;
const BLUEPRINT_CONSTITUTION           = BLUEPRINT_COMMON;
const BLUEPRINT_WRITING_RULES          = BLUEPRINT_COMMON;
const BLUEPRINT_PAGE_DICTIONARY        = BLUEPRINT_COMMON;
const BLUEPRINT_BATCH_COMMON           = BLUEPRINT_COMMON;
const BLUEPRINT_LIGHT_USER_PROMPT_PREFIX = BLUEPRINT_COMMON;
const BLUEPRINT_LIGHT_USER_PROMPT_TEMPLATE = BLUEPRINT_COMMON;
const BLUEPRINT_LIGHT_V2_USER_PROMPT_TEMPLATE = BLUEPRINT_COMMON;

/**
 * F. BATCH_PREFIX（共通ルールだけを参照）
 */
const BLUEPRINT_BATCH_PREFIX = BLUEPRINT_COMMON;

module.exports = Object.freeze({
  SYSTEM_BLUEPRINT_LIGHT,
  USER_GUIDE_BLUEPRINT_LIGHT,
  RULES_BLUEPRINT_LIGHT_PROSE,
  BLUEPRINT_CONSTITUTION,
  BLUEPRINT_WRITING_RULES,
  BLUEPRINT_PAGE_DICTIONARY,
  BLUEPRINT_BATCH_COMMON,
  BLUEPRINT_LIGHT_USER_PROMPT_PREFIX,
  BLUEPRINT_LIGHT_USER_PROMPT_TEMPLATE,
  BLUEPRINT_LIGHT_V2_USER_PROMPT_TEMPLATE,
  BLUEPRINT_COMMON,
  BLUEPRINT_BATCH_PREFIX,
});

/**
 * F-1. CORE
 */
const BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CORE = `
${BLUEPRINT_BATCH_PREFIX}

#役割
この出生図の中心核と推進方向を、入口として置く。

#担当範囲
- star_drive
- star_signature

#出力JSONの形 (必須)
{
  "star_drive": "...",
  "star_signature": "..."
}

#書くこと
- 前面に出る重心
- それを支える配置帯域
- 別方向にある配置
- 全体としてどこへ向くか

#書かないこと
- 分布の詳説
- ホイール観測の詳述
- 個別天体の持ち場の詳説
- アスペクト回路の説明
- 最終型の総括

────────────────

[star_drive]
#FACT SOURCE: primary_house, house_counts, planet_distribution, planets[], angles.mc, element_balance
#役割: この図の中心圧がどこで生まれ、どの経路を通り、どんな性質で外へ押し出されるかを書く。
#構造: 1文目＝圧が生まれる集中帯、2文目＝その圧がどの性質を通り、どのような外向きの出方を取るか
#文字量: 25〜45文字 (最大45文字)
#
#補助ルール:
- primary_house がある場合はそれを「中心圧の発生帯」として優先する
- house_counts の最大帯が primary_house と異なる場合は「分布帯」として補助的に触れる

────────────────

[star_signature]
#FACT SOURCE: primary_house, house_counts, planet_distribution, planets[], angles.asc, angles.mc, element_balance, modality_balance
#役割: この出生図の「中心圧」と「向き」を短く掴ませる。重心・出方・流れを一つのまとまりとして示す。
#構成 (4〜5文):
- 1文目: 重心配置 (どこに圧が集まるか)
- 2文目: 重心の質感 (その帯域の圧・温度・出方)
- 3文目: 向き (その圧がどの領域へ向かうか)
- 4文目: 動き (圧がどう流れるか / 広がるか)
- 5文目: 観測の焦点 or 補助 (必要な場合のみ)

#文章ルール
- 自然な長さで読みやすく
- 文字量: 150〜180文字 (最大180文字)
- 自然で美しい日本語

#共通ルール (全項目)
- sign / house / degree / element / modality / phase / strength はfactにあるものだけを材料として使う
- 最強重心だけで閉じず、支える配置・別方向の配置を必ず含める
- 配置の観測として書く。教科書説明・人生解釈・抽象語のみ・配置の単純列挙は禁止
- サイン／ハウス／度数などの座標情報を本文で読み上げすぎない
- 各本文には具体アンカーを最低1つ入れる
- 結論や総括で閉じず、構造印象で止める
- 「活動宮」「不動宮」「柔軟宮」などの専門用語は使わない → 「始動的な」「安定した」「柔軟に切り替わる」など自然な言葉に置き換える

`.trim();

/**
 * F-2. MAP
 */
const BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_MAP = `
${BLUEPRINT_BATCH_PREFIX}

#役割
エレメント分布とモード分布から、図全体の作動パターンを観測として書く。

#出力形式（必須）
{
  "dashboard": {
    "energy_flow": "..."
  }
}

#書くこと
- element_balance と modality_balance の数値を自然に織り交ぜる
- その分布が作る「動き方・流れ・作動の印象」を具体的に
- 始動・維持・切り替えの関係や全体のバランス感

#書かないこと
- 元素・モード以外の話
- 人格説明・人生解釈
- 抽象語だけのまとめ
- 他のdashboard項目

#文章ルール（ここを強化！）
- **必ず3文構成**にする
- 1文目：主な元素の基盤とその印象
- 2文目：活動・不動などのモードが作る動きやバランス
- 3文目：風や他の要素の少ない分が生むリズムや印象（柔らかく）
- 文字量：100〜120文字程度（最大120文字）
- ですます口調で、自然で美しい日本語
- 「欠如」「欠く」などのネガティブ表現は避け、「少ない分」「じっくりと」など柔らかい言葉に置き換える
- 数値をそのまま羅列せず、作動パターンとして読み手がイメージできる文にする
- 出力はenergy_flowのみ

`.trim();

/**
 * F-3. OBS - natal wheel chart observation
 */
const BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_OBS = `
${BLUEPRINT_BATCH_PREFIX}

#役割
出生ホイールの配置を「視覚観測記録」として、静かで美しい日本語で記述する。
天体の意味解釈は一切せず、ホイールを図として見たときの「見え方・分布・バランス」を言語化する。

#出力形式 (必須)
{
"natal_observation": "..."
}

#観測の基本
- 最初に目に入る「集中している場所」を1文で
- その帯がどう続いているか、どこで分かれているかを書く
- 空白や離れた配置、単独点も必ず触れる
- ASC / MC / IC / DC の視覚位置を必ず1回触れる
- 最後にホイール全体の「見え方」を1文でまとめる (構図名は自然に出てくる程度でOK)

#文章ルール
- 文字量: 200〜235文字 (最大235文字)
- ゆったりとした美しい日本語
- 改行を適度に入れて読みやすく
- 主語は「配置」「帯」「位置」など視覚的なものにする
- 擬人化・因果・解釈は一切禁止
- 「〜に見える」「〜として広がる」など、視覚を尊重した表現を積極的に使う

#ホイール基準
- ASC = 左 (9時) / DC = 右 (3時)
- MC = 下 (6時) / IC = 上 (12時)
- 左右上下はこの表示上の視覚位置として扱う
- ハウス意味で位置判断しない (例: 10H=上 などは禁止)
- 位置は必ずホイール座標で判断する

#禁止
- 意味・役割・性格の説明
- アスペクト解釈
- エレメント・モダリティ分析
- 「影響」「支える」「導く」などの言葉
- 一般論や抽象的なまとめだけでの締め
`.trim();

/**
 * F-4. ROLES
 */
const BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ROLES = `
${BLUEPRINT_BATCH_PREFIX}

#役割
各天体の持ち場・層構造・深層軸・四軸を記述する。

#出力形式 (必須)
{
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
  "system_layers": { "core": "...", "personal": "...", "collective": "..." },
  "deep_axis": { "nodes_north": "...", "nodes_south": "...", "chiron": "...", "lilith": "..." },
  "angles": { "asc": "...", "mc": "...", "ic": "...", "dc": "..." }
}

#planet_roles
- 各天体ごとに配置から自然に出る「出方・体感・反応・振る舞い」を書く
- **必ず4文以上**で、以下の流れを**厳密に守る**：
  1. 配置事実（サイン・度数・ハウス）を自然に織り交ぜる
  2. その配置が生む質感・温度・反応
  3. 実際の出方・動き・振る舞い
  4. 場（公・私・対人・日常など）での現れ方や影響
- **文字量：各150〜170文字を厳密に目指す**
- **最大170文字**
- 文字量を厳密に目指して書く
- 配置（サイン・度数・ハウス）を材料にしつつ、読み手が情景を感じられるように
- タイトル形式（「中心の核｜...」など）は使わない
- 抽象語だけで終わらせず、具体的な出方や体感を入れる

#system_layers
- core → personal → collective の順番を**厳密に固定**して出力する
- 各レイヤーで「その層にいるときの状態・感覚・出方」を具体的に書く
- 必ず3文以内に収めて、簡潔にまとめる
- 文字量: 各140〜150文字を厳密に目指す**
- **最大150文字**
- 文字量を厳密に目指して書く
- タイトルは「中心の層」「個の層」「外の層」と明確に付ける
- 配置（サイン・ハウス）を材料にしつつ、読み手が情景を感じられるように

#deep_axis
- nodes_north / nodes_south / chiron(キロン) / lilith(リリス) の4項目それぞれで
- 配置が作る深層の引力・反応・質感を書く
- 必ず3文以内に収めて、簡潔にまとめる
- 文字量: 各130〜140文字を厳密に目指す**
- **最大140文字**
- 文字量を厳密に目指して書く
- 配置事実 → 質感 → 深層の引力/反応 のシンプルな流れにする
- タイトル（「進行の引力」など）は自然に付けてOK
- 抽象語だけで終わらせず、具体的な感覚を入れる

#angles
- asc / mc / ic / dc の4軸それぞれで
- 配置から立ち上がる接触・表現・関係の現れ方を書く
- 文字量: 各140〜150文字を厳密に目指す**
- **最大150文字**
- 文字量を厳密に目指して書く

#全体ルール
- ですます口調で自然で美しい日本語
- 配置を材料にしつつ、読み手が「その場にいる感覚」を感じられる文にする
- 抽象語だけで終わらせず、具体的な出方や質感をしっかり入れる

`.trim();


/**
 * F-5. ASPECTS
 */
const BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ASPECTS = `
${BLUEPRINT_BATCH_PREFIX}

#役割
星同士の接続を、配置帯どうしを結ぶ「構造と動き」として記述する。

#出力形式 (必須)
{
  "aspect_map": {
    "planetA_planetB": {
      "type": "trine|opposition|sextile|square|conjunction",
      "text": "..."
    }
  }
}

#書くこと
- どの天体どうしが接続するか
- その接続が生む構造と動き
- 人がどう感じるか・どう動くかの体感

#書かないこと
- 天体の意味説明
- 心理解釈・評価語
- 「現れやすいです」などの弱い締め
- 抽象語だけの文章

#文章ルール
- 各接続は必ず2文構成
- 1文目: 接続の構造 (天体名を必ず入れる)
- 2文目: 動きと体感 (具体的に)
- 自然な日本語・ですます口調
- 文字量: 各70〜98文字 (最大98文字)

#重要
- JSON形状を必ず守る
- キーは天体ペア (例: mars_uranus)
- 出力は最大5件まで

`.trim();



/**
 * F-6. CLOSING
 */
const BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CLOSING = `
${BLUEPRINT_BATCH_PREFIX}

#役割
出生図全体を「構造型」として統合し、最後に静かに閉じる。

#出力形式 (必須)
{
  "pattern_name": "...",
  "closing_summary": "..."
}

#書くこと
- 図全体の骨格と流れ
- 集中と分散の関係
- 最後にこの構造がどのような動きの星として現れるか

#書かないこと
- 他ページの再説明
- 個別天体の列挙
- 性格診断・心理解釈・助言
- 抽象だけの締め

#pattern_name
- 構造型を一言で示す (重心の位置・集中帯の数・帯域の関係から)
- 性格ラベルにしない
- 文字量: 8〜18文字 (最大20文字)

- 命名パターン(参考):
- 重心◯◯型
- ◯層◯◯型
- ◯極構造型
- ◯◯回路型
- ◯◯循環型

- 例(参考):
- 重心分散型
- 二極回路型
- 縦層構造型
- 重心接続型
- 二層展開型

#closing_summary
- 全体の骨格と動きを自然な流れでまとめる
- 最後の1文で「この構造が現実でどう現れるか」を具体的に
- 自然な長さで読みやすく
- ですます口調で美しい日本語
- 文字量: 300〜360文字 (最大360文字)

`.trim();


module.exports = Object.freeze({
  SYSTEM_BLUEPRINT_LIGHT,
  USER_GUIDE_BLUEPRINT_LIGHT,
  RULES_BLUEPRINT_LIGHT_PROSE,
  BLUEPRINT_CONSTITUTION,
  BLUEPRINT_WRITING_RULES,
  BLUEPRINT_PAGE_DICTIONARY,
  BLUEPRINT_BATCH_COMMON,
  BLUEPRINT_LIGHT_USER_PROMPT_PREFIX,
  BLUEPRINT_LIGHT_USER_PROMPT_TEMPLATE,
  BLUEPRINT_LIGHT_V2_USER_PROMPT_TEMPLATE,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CORE,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_MAP,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_OBS,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ROLES,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_ASPECTS,
  BLUEPRINT_LIGHT_V2_SEGMENT_PROMPT_CLOSING,
});
