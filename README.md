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
- story.json 中心設計（唯一の真実）
- BLOG 日次下書き生成（WordPress）

---

## 1. Production URL（Cloud Run）

https://sora-no-koe-v2-256321662770.asia-northeast1.run.app

---

## 1.1 Build / Deploy（Dockerfile）

Cloud Run では **Buildpacks ではなく Dockerfile でビルド**します。  
Swiss Ephemeris（swisseph）のネイティブアドオンが **ビルド環境と実行環境のABI不整合で落ちる**ため、
同一コンテナ内でビルド・実行する方式に固定しています。

Cloud Build で Docker ビルド＋デプロイ：
```bash
gcloud builds submit --config cloudbuild.yaml
```

---

## 2. ローカル起動（開発）

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

## 3. エンドポイント一覧（最新版）

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

## 4. /stories の使い方（統一API）

主なクエリ
- `app_user_id` 例: `public` / `u_xxx`
- `mode` 例: `public` / `auto`
- `date_local` 例: `2026-02-12`
- `as_of` ISO 例: `2026-02-12T03:00:00.000Z`
- `datetime_local` 例: `2026-02-12T18:10:00`（JST扱い）
- `format` 例: `json` / `text` / `line` / `x` / `ig` / `threads`
- `channel` 例: `line` / `sora_line` / `line_sora_all` / `sora_ura` / `anshin` / `natal` / `x` / `threads`
- `outputs` 例: `true` / `false`（default true）
- `orb` 例: `6`
- `precision` 例: `0.01`
- `save` 例: `true` / `false`
- `final` 例: `true` / `false`（保存時のみ意味あり）
- `force` 例: `true` / `false`（保存時のみ意味あり）

チャンネル別（代表例）
```bash
# personal main
curl -s "http://localhost:8080/stories?app_user_id=u_me_xxx&mode=auto&format=text&channel=line&outputs=true"

# public sora
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_line&outputs=true"

# sora all
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=line_sora_all&outputs=true"

# sora ura (menu)
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=sora_ura&outputs=true"

# anshin
curl -s "http://localhost:8080/stories?app_user_id=u_me_xxx&mode=auto&format=text&channel=anshin&outputs=true"

# natal list
curl -s "http://localhost:8080/stories?app_user_id=u_me_xxx&mode=auto&format=text&channel=natal&outputs=true"

# X / Threads
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=x&outputs=true"
curl -s "http://localhost:8080/stories?app_user_id=public&mode=public&format=text&channel=threads&outputs=true"
```

メモ
- `format=text` は `text/plain` で返す
- `outputs=true` のときは内部スロットも返る
- `sora系` と `SNS系` は自動で `public` 固定になる

---

## 5. /transit の使い方

```bash
curl -s "http://localhost:8080/transit?date_local=2026-02-12"
curl -s "http://localhost:8080/transit?as_of=2026-02-12T03:00:00.000Z&precision=0.01"
```

---

## 6. /cron の使い方（要CRON_TOKEN）

共通
- Header: `x-cron-token: $CRON_TOKEN`

daily8（legacy/デバッグ）
```bash
curl -s -X POST "http://localhost:8080/cron/daily8?date_local=2026-02-12&dryRun=1" \
  -H "x-cron-token: $CRON_TOKEN"
```

rebuild8 / send8（本番運用の2段構え）
```bash
curl -s -X POST "http://localhost:8080/cron/rebuild8?date_local=2026-02-12" \
  -H "x-cron-token: $CRON_TOKEN"

curl -s -X POST "http://localhost:8080/cron/send8?date_local=2026-02-12" \
  -H "x-cron-token: $CRON_TOKEN"
```

blog daily
```bash
curl -s -X POST "http://localhost:8080/cron/blog/daily?date_local=2026-02-12&dryRun=1" \
  -H "x-cron-token: $CRON_TOKEN"
```

worker
```bash
curl -s -X POST "http://localhost:8080/cron/worker" \
  -H "x-cron-token: $CRON_TOKEN"
```

---

## 7. /jobs の使い方（natal calc）

```bash
curl -s -X POST "http://localhost:8080/jobs/worker" \
  -H "x-cron-token: $CRON_TOKEN"
```

DEBUG のときだけ
```bash
DEBUG=1 curl -s "http://localhost:8080/jobs/worker"
```

---

## 8. LINE Webhook

- `POST /line/webhook`
- raw body 署名検証（最重要）
- `LINE_WEBHOOK_STRICT=1` のとき署名NGで401

---

## 9. Firestore コレクション

- `line_users/{lineUserId}` 登録フロー状態
- `users/{app_user_id}` ユーザー基本情報
- `natal_cache/{app_user_id}` ネイタル計算結果
- `jobs_natal_calc/{jobId}` ネイタル計算ジョブ
- `stories/{userId-dateLocal}` 日次 story

---

## 10. 環境変数（主要）

Core
- `PROJECT`
- `SCHEMA_VERSION`
- `DEFAULT_TZ`（default: Asia/Tokyo）
- `PORT`（default: 8080）

Firestore
- `FIRESTORE_DATABASE_ID`

Swiss Ephemeris
- `SWISSEPH_EPH_PATH`（ephe ディレクトリの絶対 or 相対パス）
- `SWISSEPH_PATH`（legacy）

LINE
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_WEBHOOK_STRICT`
- `OWNER_LINE_USER_ID`
- `OWNER_APP_USER_ID`

Cron / Jobs
- `CRON_TOKEN`
- `DEBUG`

Blog (WordPress)
- `WP_BASE_URL`
- `WP_USER`
- `WP_APP_PASSWORD`
- `WP_CATEGORY_DAILY`

OpenAI
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

Geo
- `GOOGLE_MAPS_API_KEY`

---

## 11. SSOT / ドキュメント

- `docs/sora_ai_prompts.md`（SSOT: 読み物）
- `engine/prompts/sora_ai_prompts.js`（SSOT: 実コード）
- `TEST.md`（テストチェックリスト完全版）

---

## 12. テスト

自動チェック（叩き台）
```bash
CRON_TOKEN=YOUR_TOKEN node scripts/check_outputs.js
```

---

## 13. 運用メモ

このプロジェクトは「占い」ではない。
予測・断定・指示を避け、構造だけを置く。
解釈と選択の主権は、常に人にある。

---

## 14. Third-Party Libraries

This project uses Swiss Ephemeris for astronomical calculations.

Swiss Ephemeris  
Official website: https://www.astro.com/swisseph/  
Source code: https://github.com/aloistr/swisseph  

Swiss Ephemeris is developed by Astrodienst AG, Switzerland.  
License terms apply. See the official website for details.
