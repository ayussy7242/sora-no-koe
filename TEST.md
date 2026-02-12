# 🥇 テストチェックリスト完全版（2026-02 SSOT）

目的
- 出力の安定
- 占い化/因果の混入を防ぐ
- 溶解の成功率を上げる
- 運用前の不安を消す

---

## 0) テストの前提（全チャネル共通）

ルール
- `outputs=true` で叩く（内部JSON/スロットが見えること）
- 失敗判定は「気分」ではなくルールで×（後述の検出観点）
- 1回だけでなく、日付・as_of を変えて最低3パターン

パターン例
- 今日
- 未来日（例：+30日）
- 過去日（例：-30日）

---

## 1) エンドポイント動作テスト（Smoke）

目的
- 最低限「落ちてない」を最速で確認

コマンド
```bash
curl -s http://localhost:8080/health
curl -s http://localhost:8080/line/health

curl -s https://sora-no-koe-v2-256321662770.asia-northeast1.run.app/health
curl -s https://sora-no-koe-v2-256321662770.asia-northeast1.run.app/line/health
```

見るもの
- ステータスが `ok`
- 応答が体感で遅すぎない
- エラー文字列が混ざらない

---

## 2) チャンネル別 出力テスト（Route）

### 2-1) public（公開）

A) sora（LINE公開）
```bash
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_line&outputs=true"
```
判定
- タイトル/ヘッダが想定通り
- 上位共鳴が5本出る（仕様が5なら）
- orb表示が崩れない（記号/全角半角）

B) sora_all（全部）
```bash
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=line_sora_all&outputs=true"
```
判定
- セクション分離が崩れない
- 長文化しても「結論閉じ」が出ない

C) sora_ura（メニュー）
```bash
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_ura&outputs=true"

curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_ura_silent&outputs=true"

curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_ura_rare&outputs=true"

curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_ura_harmony&outputs=true"
```
判定
- 層の意味が混ざらない
- silent に rare が混入しない
- harmony が tension 寄りになりすぎない（語彙で判定）

---

### 2-2) personal（auto）

D) personal main
```bash
curl -s "http://localhost:8080/stories?app_user_id=u_me_yxhONE59qsE8hdpcdsGZ&mode=auto&format=text&channel=line&outputs=true"
```
判定
- “あなた固有” が出る（断定/指示はしない）
- ネイタル語彙が本文で過剰露出しない

E) anshin
```bash
curl -s "http://localhost:8080/stories?app_user_id=u_me_yxhONE59qsE8hdpcdsGZ&mode=auto&format=text&channel=anshin&outputs=true"
```
判定
- “重なってない/影響なし” が安心として成立
- 予測・断定っぽい語が混ざらない

F) 沈黙（personal 呼び出し先注意）
```bash
curl -s "http://localhost:8080/stories?app_user_id=u_me_yxhONE59qsE8hdpcdsGZ&mode=auto&format=text&channel=sora_ura_silent&outputs=true"
```
判定
- personal であることが確認できる
- public と混ざらない

---

### 2-3) X / Threads

X（public）
```bash
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=x&outputs=true"
```

Threads（public）
```bash
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=threads&outputs=true"
```

判定
- 文字数が破綻しない（Xは特に）
- 記号が iPhone で崩れない（VS16無しルール維持）
- 構造はあるが因果と結論で閉じない

---

### 2-4) BLOG

```bash
curl -s -X POST "http://localhost:8080/cron/blog/daily?date_local=2026-02-12&dryRun=1" \
  -H "x-cron-token: $CRON_TOKEN"
```

判定
- HTMLとして崩れてない（タグ欠落/二重H2など）
- H2構造固定が維持されている
- 見出しだけ星名OKのルールが守られている

---

## 3) 失敗検出（機械的に×にする観点）

### 3-1) 溶解失敗（×）

×判定例
- KeyWord がそのまま羅列される
- テンプレトークンが残る
- `[tpl=...]` や `{{ }}` が混入
- `INPUT:` / `OUTPUT:` が混入
- 説明文のコピペ感が強い

結論閉じ疑い
- 「つまり」「結論として」「要するに」
- 「〜ということです」「〜になります」

### 3-2) 因果説明の混入（×）

×になりやすい言い回し
- 「〜の影響で」「〜なので」「〜の結果」
- 「〜が起きる」「〜になる」
- 「〜をもたらす」

### 3-3) 星名本文露出（×/△）

検出
- 本文に「太陽/月/水星…」「牡羊座/獅子座…」が頻出
- 1段落に2回以上出るなら×寄り
- 記号のみ（☉☽等）はOK

### 3-4) 結論閉じ（×）

×フレーズ例
- 「今日は〜の日です」
- 「〜が大事です」
- 「〜しましょう / すると良い」
- 「これが答え」系

---

## 4) エッジケーステスト（データ起因）

優先度S
- 未来日付（スケジューラ/キャッシュ/日付生成ズレ）
- タイムゾーン違い（date_local / as_of の境界事故）
- 高緯度出生地（houses計算が不安定）

優先度A
- ノードなし出生データ（入力欠損/null）
- 出生時刻不明（12:00仮置き等）

---

## 5) ログ＆観測ポイント（デバッグ最短導線）

outputs=true で見るポイント
- 使用 prompt 種類（common/sora/personal/blog など）
- keywords が INPUT に渡っているか（B方式）
- banned が効きすぎて文章が痩せていないか
- どの辞書が主に使われたか（出るなら）

---

## 6) 合格基準（Go/No-Go）

Go（運用OK）
- 溶解失敗が 3試行で 0〜1回
- 因果混入が 0回
- 星名本文露出が「見出しのみ」に収まる
- 結論閉じが 0回
- X/Threads の文字数が破綻しない
- BLOG のHTMLが崩れない

No-Go（修正戻し）
- テンプレトークン残留が1回でも出た
- 「影響で」「〜になる」が複数回出た
- 星名が本文で連呼される

---

## 7) いまのチェックリストに足すだけ版

各 curl の直下にこれを貼る
- 溶解失敗（KeyWord羅列 / トークン残り）
- 因果混入（影響で / なので / 起きる）
- 星名本文露出（見出し以外に頻出）
- 結論閉じ（つまり/要するに/今日は〜の日）
- 記号崩れ（VS16/文字化け/iPhone）
- 文字数破綻（X/Threads）
- HTML崩れ（BLOG）

---

## 8) 自動チェック（叩き台）

簡易チェック（機械的に検出）
```bash
CRON_TOKEN=YOUR_TOKEN node scripts/check_outputs.js
```

出力先
- デフォルト: `/tmp/sora_checks`
- 変更する場合:
```bash
CHECK_OUT_DIR=/tmp/sora_checks node scripts/check_outputs.js
```
