# Blueprint v2 出力設計書

JSONスキーマ + ページ構成 + 各ページ役割

## 0｜目的

Blueprint v2 は、
自分の出生図を理解するための、読み応えのある占星術資料 を目指す。

これは

性格診断ではない

未来予測ではない

助言コンテンツではない

代わりに、

チャートの偏り

重心

組み合わせ

力学

軸

アスペクト

を通して、
出生図そのものの構造を理解できる資料 にする。

## 1｜設計方針

### 1-1｜思想

主語は配置・構造・軸・組み合わせ

人物像を固定しない

未来を断定しない

助言しない

救済しない

物語化しすぎない

### 1-2｜資料としての方向

雰囲気ではなく、構造理解を優先する

一般論より、このチャート固有の読みを優先する

スマホで読める長さにする

ただし薄くしない

図と要約と短文を組み合わせる

### 1-3｜改善の核

旧Blueprintの「天体ごとの長文説明」から離れ、
部品説明 → 構造単位の出力 に切り替える。

## 2｜最終JSONスキーマ（確定版）

```
{
  "core_snapshot": "...",
  "structure_summary": {
    "elements": "...",
    "modalities": "...",
    "dominance": "...",
    "house_emphasis": "..."
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
  "planet_groups": {
    "core": "...",
    "personal": "...",
    "social_transpersonal": "..."
  },
  "deep_axis": {
    "nodes": "...",
    "chiron": "...",
    "lilith": "..."
  },
  "angles": {
    "asc": "...",
    "mc": "...",
    "ic": "...",
    "dc": "..."
  },
  "aspect_map": [
    { "key": "aspect_1", "text": "..." },
    { "key": "aspect_2", "text": "..." },
    { "key": "aspect_3", "text": "..." },
    { "key": "aspect_4", "text": "..." },
    { "key": "aspect_5", "text": "..." }
  ],
  "chart_pattern": "...",
  "closing_summary": "..."
}
```

### 2-1｜各キーの意味

core_snapshot

出生図全体の第一印象。
太陽・月・ASC、元素や三区分の偏り、重心サイン・重心ハウスなどを含めて、
このチャートの輪郭を最初に掴むための短い総括。

structure_summary

チャートの骨格を4つの視点で分けて出す。

elements

火・地・風・水のバランスと、その偏りがどう出るか。

modalities

活動・不動・柔軟のバランスと、その動き方。

dominance

重心サイン、集中サイン、目立つ偏り、核になる集中帯。

house_emphasis

ハウスの集中や強い領域、人生のどの場面に圧が集まりやすいか。

planet_roles

天体の役割レイヤー。
一般論ではなく、このチャートの中で「その天体が何を担っているか」を書く。
天体単体の辞書説明にしない。

planet_groups

天体を単体説明ではなく、意味のまとまりで出す。

core

太陽・月・ASC を中心とした核。
存在の出方、中心の熱、反応の仕方、外側との接点。

personal

水星・金星・火星。
思考、愛着、動き方、対人や日常の回路。

social_transpersonal

木星・土星・天王星・海王星・冥王星。
拡張、制約、変化、理想、深層変容など、人生の大きい層。

deep_axis

深層レイヤー。

nodes

北ノード / 南ノードの軸。
慣れやすい方向、不慣れな方向、構造的な進行軸。

chiron

傷・違和感・刺さりやすい入口。

lilith

外しにくい影、強い反応、無視しにくい圧。

angles

軸の出方。

asc

外に出る入口。第一印象、出方、世界との接点。

mc

社会に立つ方向。外で立ち上がる軸。

ic

根、内側、土台。

dc

他者との接点、向かい合う関係軸。

aspect_map

主要アスペクトを 3〜5件程度。
優先順位は以下。

conjunction

opposition

square

trine

sextile

各 text は
一般的なアスペクト解説ではなく、この出生図においてその角度がどう働くか を書く。

chart_pattern

この出生図全体に通るパターン。
偏り、緊張、重心、つながり、外側と内側の差、核と反応のズレや一致などをまとめる。

これは
Blueprint v2 の神ページ用テキスト。

closing_summary

最後の静かなまとめ。
全体像を短く閉じる。
結論で断定しすぎず、構造の余韻を残す。

## 3｜ページ構成（確定版）

全12ページ構成を基本とする。

Cover

Quick Map

Structure

Planet Roles

Planet Core

Personal Planets

Outer Planets

Deep Axis

Angles

Aspect Map

Chart Pattern

Closing

## 4｜各ページ役割（1行定義つき）

### 1｜Cover

役割：所有感と世界観を置く表紙。

内容

タイトル

出生情報

ネイタルホイール（小〜中）

宇宙背景（強め）

目的

最初に「これは自分の資料だ」と感じさせる。
説明はしない。
静かに入る。

### 2｜Quick Map

役割：この出生図の輪郭を一目で掴むページ。

内容

太陽 / 月 / ASC

元素バランス

三区分バランス

重心サイン

重心ハウス

必要なら天体集中帯

対応JSON

core_snapshot

structure_summary.elements

structure_summary.modalities

structure_summary.dominance

structure_summary.house_emphasis

目的

このページだけ見ても
「自分のチャートの核」が分かる状態にする。

### 3｜Structure

役割：チャートの骨格を占星術的に読むページ。

内容

Elements の解説

Modalities の解説

Dominance の解説

House emphasis の解説

必要なら視覚チャート

対応JSON

structure_summary

目的

Quick Map で見えた輪郭を、
占星術資料として一段深く読む。

### 4｜Planet Roles

役割：各天体がこのチャートで何を担っているかを短く示すページ。

内容

太陽

月

水星

金星

火星

木星

土星

天王星

海王星

冥王星

対応JSON

planet_roles

目的

構造と回路の間に「個人の担い手」を置く。
辞書説明ではなく、チャート内での役割として書く。

### 5｜Planet Core

役割：存在の中心と外への出方を読むページ。

内容

太陽

月

ASC

対応JSON

planet_groups.core

目的

出生図の中心にある熱、反応、出方をまとめて読む。
1天体ずつの辞書説明にしない。
組み合わせで読む。

### 6｜Personal Planets

役割：日常の思考・愛着・動き方を読むページ。

内容

水星

金星

火星

対応JSON

planet_groups.personal

目的

コミュニケーション、関係性、推進力など、
日常層の回路を読む。

### 7｜Outer Planets

役割：人生の大きい層を読むページ。

内容

木星

土星

天王星

海王星

冥王星

対応JSON

planet_groups.social_transpersonal

目的

拡張、制限、変化、理想、深層変容を、
チャートの大きな流れとして読む。

### 8｜Deep Axis

役割：深層の進行軸・傷・影を読むページ。

内容

北ノード / 南ノード

キロン

リリス

対応JSON

deep_axis.nodes

deep_axis.chiron

deep_axis.lilith

目的

人格説明では届かない層を扱う。
ただし運命固定にはしない。
深く、でも静かに置く。

### 9｜Angles

役割：外界との接点と人生軸を読むページ。

内容

ASC

MC

IC

DC

対応JSON

angles.asc

angles.mc

angles.ic

angles.dc

目的

内側と外側、社会と根、他者との向き合い方を読む。

### 10｜Aspect Map

役割：天体同士の力学を読むページ。

内容

主要アスペクト 3〜5件

必要なら簡易図

各アスペクト短文

対応JSON

aspect_map

目的

占星術資料としての読み応えを一気に引き上げる。
このページで「構造の動き」が見えるようにする。

### 11｜Chart Pattern

役割：出生図全体の輪郭を言語化する神ページ。

内容

全体パターン総括

偏り

緊張

つながり

外側と内側の差

核と反応の仕方

対応JSON

chart_pattern

目的

全ページを読んだあとに
「このチャートはこういう力学なんだ」と一つに繋がるページにする。

### 12｜Closing

役割：静かに閉じる余韻ページ。

内容

短い総括

宇宙背景

タイトル / 署名的要素

対応JSON

closing_summary

目的

教訓で閉じない。
構造の余韻で閉じる。

## 5｜各キーの文字量目安

core_snapshot

3〜5文

structure_summary.*

各 2〜4文

planet_roles.*

各 2〜4文

planet_groups.*

各 3〜5文

deep_axis.*

各 2〜4文

angles.*

各 2〜4文

aspect_map[*].text

1〜2文

chart_pattern

4〜6文

closing_summary

3〜5文

## 6｜文章ルール（v2用）

必須方針

一般論で埋めない

このチャート固有の組み合わせを書く

sign / house / aspect / orb / element / modality / phase / strength は INPUT にあるものだけ使う

天体単体より、偏り・重心・関係を優先

占星術用語だけで閉じない

構造として記述する

避けること

「太陽は自己表現を表す」型の教科書文

各項目で同じ視点・語尾の繰り返し

断片語の羅列

抽象語だけで終わること

助言・指示・予測・吉凶判断

## 7｜優先順位（AI生成時の読み順）

チャート全体の偏りと重心

天体同士の関係

サイン・ハウス・軸の意味

個別天体の説明

## 8｜実装順（推奨）

Phase 1

v1.5 で短文化した出力をテストする
→ 文章の濃さ・短さ・一般論の減り方を確認

Phase 2

Blueprint v2 スキーマを追加
→ core_snapshot / structure_summary / planet_groups / aspect_map / chart_pattern

Phase 3

PDF側の section を v2 構成へ再設計

Phase 4

宇宙背景・ホイール・レイアウトをv2版に最適化

## 9｜この設計のいちばん大きい価値

この Blueprint v2 は、

天体ごとの説明集ではなく

雰囲気だけの魂資料でもなく

「自分の出生図がどういう構造で成り立っているかを理解できる資料」

になる。

ここが核。

## 10｜ひとことでまとめると

Blueprint v2 =
出生図を、偏り・重心・軸・関係・全体パターンで読むための占星術資料。
