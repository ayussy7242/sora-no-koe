# Blueprint v2.5 Generation Spec

## 基本方針
- 文章はすべてAI生成
- ページごとに渡すデータを変える
- 固定文で埋めない
- 辞書の丸写しは禁止（材料としてはOK）
- 同じ情報を別ページで同じ角度で書かない

## 確認ルール
- エレメント数の説明は **MAP** でAI生成
- 天体説明は辞書説明ではなく「このチャート内での役割」
- ノード個別説明は **DEP** でAI生成（PATで繰り返さない）
- アスペクト個別説明は **ASP** でAI生成（PATで繰り返さない）

---

## ページ別 生成仕様

### SYS-01 宇宙の設計図
**AIが書く**
- `core_snapshot`
- `cosmic_focus`
- `cosmic_traits`
- `cosmic_signature`

**渡すデータ**
- 名前 / 出生情報
- 太陽 / 月 / ASC
- 支配エレメント / 支配モード / 強調ハウス
- チャートタイプ
- 主な重心情報

**書かない**
- エレメント数の詳説
- 天体分布の羅列
- アスペクト個別説明

---

### MAP-02 宇宙ダッシュボード
**AIが書く**
- `dashboard.element_balance`
- `dashboard.modality_balance`
- `dashboard.dominant_signs`
- `dashboard.dominant_houses`
- `dashboard.planet_distribution`
- `dashboard.energy_flow`
- `dashboard.cosmic_structure`

**渡すデータ**
- エレメント数 / モード数
- 支配サイン / 支配ハウス
- 天体分布
- エネルギーフロー材料

---

### OBS-03 出生ホイール
**AIが書く**
- `natal_observation`

**渡すデータ**
- ホイール全体
- 太陽 / 月 / ASC
- ハウス集中
- 主要アスペクト
- 欠け要素など観測補助情報

---

### PLN-04 PLANET SYSTEM
**AIが書く**
- `planet_roles.*`

**渡すデータ**
- 各天体のサイン / 度数 / ハウス
- 主要アスペクト
- チャート内での位置づけ

**ポイント**
- 天体辞書ではなく「このチャート内での役割」

---

### LAY-05 SYSTEM LAYERS
**AIが書く**
- `system_layers.core`
- `system_layers.personal`
- `system_layers.collective`
- `system_layers.flow`

**渡すデータ**
- レイヤーごとの天体群
- サイン / ハウス
- レイヤー間の接続情報

---

### DEP-06 DEEP AXIS
**AIが書く**
- `deep_axis.nodes`
- `deep_axis.chiron`
- `deep_axis.lilith`
- `deep_axis.pattern`

**渡すデータ**
- South / North Node のサイン・度数・ハウス
- Chiron / Lilith のサイン・度数・ハウス
- 深層テーマの統合材料

---

### ASP-07 ASPECT NETWORK
**AIが書く**
- `aspect_map`
- `aspect_dynamics`

**渡すデータ**
- 主要アスペクト一覧
- orb
- 関わる天体のサイン / ハウス
- 全体の接続構造

---

### PAT-08 COSMIC PATTERN
**AIが書く**
- `pattern_name`
- `chart_pattern`
- `life_direction`
- `closing_summary`

**渡すデータ**
- コア軸
- 支配エレメント / モード / ハウス
- キーアスペクト
- Deep axis 統合結果
- 全体重心

---

## 最重要ルール
**同じ情報を別ページで同じ角度で書かない。**

例：
- 「火が強い」
  - SYS：特性の一言
  - MAP：数値と構造
  - PAT：全体の核
