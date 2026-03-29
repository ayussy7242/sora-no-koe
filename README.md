# 🌌 sora-no-koe（ソラのこえ）

Astrology resonance API for **sora-no-koe** (Node.js / Cloud Run / Functions Framework)

> 星の配置（構造）を「答えにしない」まま置くシステム。
> LINEは「個人と空がどこで触れているか」だけを届ける。

原則
- 占いしない
- 当てない
- 行動指示しない
- 救わない

**星は構造。解釈と選択の主権は、人へ。**

---

## 0. できること（現状）

稼働中
- LINE Webhook（raw body 署名検証）
- 登録フロー（生年月日 → 出生時刻 → 出生地 → 同意 → ready）
 - Firestore 保存（multi DB 対応）
 - story は「生成時刻の空」がSSOT（リアルタイム）
- BLOG 日次下書き生成（WordPress）
- IG / X / Threads / LINE 向け出力
- Blueprint（PDF）生成とGCS保存

---

## 1. レイヤー役割（責務）

- `src/domain`：宇宙/占星データの意味・計算ルール（アスペクト、月相、天体計算）
- `src/usecases`：何を作るかの業務フロー（story / blueprint / channels / cron）
- `src/integrations`：外部サービス接続（LINE / Firebase / GCS / IG など）
- `src/presenters`：チャンネル向け整形（LINE / X / IG / Threads）
- `src/engine`：描画・生成レイヤー（画像・SVG・PDFなど）
- `src/routes`：HTTP 入口（薄いルーティング層）

`engine/renderers` で描画責務を統一。

---

## 1.5 SSOT（実運用）

**SSOT は「各実行時刻の `storyService.buildStoryForUser()` の結果」**。

原則:
- LINE / X / IG / BLOG は **実行時刻の空**から story を生成する
- `stories` は **snapshot / cache / delivery record**（保存する場合のみ）
- snapshot 保存失敗は **warning 扱い**（本体フローは止めない）
- 朝投稿と夜投稿は **異なる truth** を取り得る

保存する場合の例:
- `stories/public-YYYY-MM-DDT07-30`
- `stories/public-YYYY-MM-DDT21-40`

---

## 2. ディレクトリ構成（重要部分）

```
src/
  domain/
    astro/
    moon/
  usecases/
    story/
    cron/
    channels/
      ig/
      line/
      x/
      blog/
    pdf/
      blueprint/
        compute/
        render/
        generation/
        jobs/
      relation/
  integrations/
    line/
      api.js
      blueprint.js
      intent.js
      messaging.js
      state.js
      user.js
  presenters/
    ig/
    line/
    threads/
    x/
  engine/
    renderers/
      ig/
        slides/
        story/
      x/
      blog/
    pdf/
  routes/
```

補足
- `presenters/ig.js` / `presenters/x.js` / `presenters/threads.js` は互換ラッパとして残している
- `engine/renderers/ig/story/render_backgrounds.js` は IG story 背景描画のSSOT

## 2.5 ドキュメント

- `docs/testing.md`：テストチェックリスト（旧 `TEST.md`）
- `docs/ops_check_log.md`：本番前の簡易確認ログテンプレ

---

## 3. Production URL（Cloud Run）

https://sora-no-koe-v2-256321662770.asia-northeast1.run.app

---

## 4. Build / Deploy（Dockerfile）

Cloud Run では **Buildpacks ではなく Dockerfile でビルド**します。  
Swiss Ephemeris（swisseph）のネイティブアドオンが **ビルド環境と実行環境のABI不整合で落ちる**ため、
同一コンテナ内でビルド・実行する方式に固定しています。

Cloud Build で Docker ビルド＋デプロイ：
```bash
gcloud builds submit --config cloudbuild.yaml
```

---

## 5. ローカル起動（開発）

依存インストール
```bash
npm install
```

開発モード
```bash
npm run dev
```

動作確認
```bash
curl http://localhost:8080/health
curl http://localhost:8080/meta
```

---

## 6. 環境変数（最低限）

ローカルは `config/.env` に置く。

必須になりやすいもの
- `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT`
- `FIRESTORE_DATABASE_ID`（既定: `sora-no-koe-db`）
- `GCS_BUCKET_BLUEPRINTS`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `OPENAI_API_KEY`（生成テスト時のみ）

Firestore 認証
- ローカルは ADC を推奨（`gcloud auth application-default login`）

---

## 7. エンドポイント一覧（最新版）

Health
- `GET /health`
- `GET /health/live`
- `GET /line/health`
- `GET /cron/health`
- `GET /meta`
- `GET /`（meta簡易）

Stories（統一ルート）
- `GET /stories`

Transit
- `GET /transit`

LINE
- `POST /line/webhook`

Cron
- `POST /cron/daily8`
- `POST /cron/rebuild8`
- `POST /cron/send8`
- `POST /cron/blog/daily`
- `POST /cron/worker`

Jobs
- `POST /jobs/worker`
- `GET /jobs/worker`（`DEBUG=1` のときだけ）

Debug
- `GET /debug/ping?token=...`
- `GET /debug/env?token=...`
- `GET /debug/user?token=...&app_user_id=...`
- `POST /debug/resetRegistration?token=...&line_user_id=...`
- `POST /debug/wipeUser?token=...&app_user_id=...`

---

## 8. /stories の使い方（統一API）

主なクエリ
- `app_user_id` 例: `public` / `u_xxx`
- `mode` 例: `public` / `auto`
- `date_local` 例: `2026-02-12`
- `as_of` ISO 例: `2026-02-12T03:00:00.000Z`
- `datetime_local` 例: `2026-02-12T18:10:00`（JST扱い）
- `format` 例: `json` / `text` / `line` / `x` / `ig` / `threads`
- `channel` 例: `line` / `line_sora` / `line_distribution` / `line_natal` / `x` / `threads` / `ig`
- `outputs` 例: `true` / `false`（default true）
- `orb` 例: `6`
- `precision` 例: `0.01`
- `save` 例: `true` / `false`
- `final` 例: `true` / `false`（保存時のみ意味あり）
- `force` 例: `true` / `false`（保存時のみ意味あり）

代表例
```bash
# personal main
curl -s "http://localhost:8080/stories?app_user_id=u_me_xxx&mode=auto&format=text&channel=line&outputs=true"

# public sora
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=line_sora&outputs=true"

# natal list
curl -s "http://localhost:8080/stories?app_user_id=u_me_xxx&mode=auto&format=text&channel=line_natal&outputs=true"

# X / Threads
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=x&outputs=true"
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=threads&outputs=true"
```

メモ
- `format=text` は `text/plain` で返す
- `outputs=true` のときは内部スロットも返る
- `sora系` と `SNS系` は自動で `public` 固定

---

## 9. ローカルの軽い確認（scripts）

Stories / X / LINE
```bash
node scripts/test/test-render.js --date 2026-03-20 --story tmp/stories/2026-03-20.json --save tmp/previews/out_story.txt
node scripts/test/test-line-commands.js --date 2026-03-20 --story tmp/stories/2026-03-20.json
```

IG caption
```bash
node scripts/preview/ig_caption_preview.js --story tmp/stories/2026-03-20.json --out tmp/previews/ig_caption_2026-03-20.txt
```

IG carousel（重い）
```bash
node scripts/preview/ig_carousel_preview.js --story tmp/stories/2026-03-20.json --date 2026-03-20
```

X morning wheel
```bash
node scripts/preview/x_morning_wheel_preview.js --story tmp/stories/2026-03-20.json --date 2026-03-20
```

Blueprint mock
```bash
node - <<'NODE'
const { renderBlueprintLightPdf } = require('./src/usecases/pdf/blueprint/render/pdf_render');
const mockPayload = {
  manifest: { version: 'test', created_at: new Date().toISOString() },
  displayName: 'Test User',
  birthText: '出生: 1990-07-24 12:18',
  rowsMain: [],
  rowsAngles: [],
  rowsExtra: [],
  summary: 'テストサマリー',
  element: { fire: 3, earth: 2, air: 3, water: 2 },
  modality: { cardinal: 3, fixed: 4, mutable: 3 },
  blueprintText: 'テストBlueprint',
  bgImages: { main: null },
  story: {}
};
(async () => {
  const buffer = await renderBlueprintLightPdf(mockPayload);
  console.log('PDF generated:', !!buffer, 'size:', buffer?.length);
})();
NODE
```

---

## 10. 外部依存ありの実フロー確認（参考）

Firestore
- `stories` は `sora-no-koe-db` に存在

GCS（Blueprint）
- `GCS_BUCKET_BLUEPRINTS` を使って JSON / PDF を確認

LINE 実送信
- `OWNER_LINE_USER_ID` 宛に push して動作確認

OpenAI
- `OPENAI_API_KEY` を設定して生成スクリプト実行

---

## 11. Notes

- IG carousel は重いので長めのタイムアウト推奨
- macOS の `XType` 警告はフォントアクセスの環境警告で、生成自体は成功する
- `presenters/*.js` は互換ラッパ扱い（将来 `presenters/<channel>/index.js` へ統合予定）

---

## 12. Docs 構想（任意）

README は入口として残し、詳細な設計メモは `docs/` にまとめる運用が相性良い。
必要なら以下のように分割すると読みやすい。

- `docs/architecture.md`
- `docs/blueprint.md`
- `docs/channels.md`
- `docs/operations.md`
