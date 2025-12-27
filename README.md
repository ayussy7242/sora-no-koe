# sora-no-koe
Astrology resonance API for sora-no-koe project (Cloud Run)

# 🌌 sora-no-koe（ソラのこえ）
星の配置（構造）を “答えにしない” まま置くシステム。  
LINEは「個人と空がどこで触れているか」だけを届ける。

- 占いしない / 当てない / 行動指示しない / 救わない
- 星は構造。解釈と選択の主権は、人へ。

---

## 0. できること（現状）
### ✅ 動作している
- LINE Webhook（署名検証：raw body）
- 登録フロー（生年月日 → 出生時刻 → 出生地 → 同意）
- Firestore 保存
  - `line_users`（status管理）
  - `users`
  - `natal_cache`
  - `jobs_natal_calc`
  - `stories`
- API
  - `GET /transit`
  - `GET /stories/build`
  - `GET /posts/x`
  - `GET /line/daily`
  - `GET /push`
  - `POST /jobs/worker`
  - `GET /debug/resetRegistration`

---

## 1. アーキテクチャ概要
- **Cloud Run**（Node.js / Functions Framework）
- **Firestore**（multi DB 対応：`databaseId = sora-no-koe-db`）
- **LINE Messaging API**
  - Webhookは `raw body` で署名検証（超重要）
- **設計**
  - `stories` に日付×ユーザーの “story.json（器）” を保存
  - `renderLine / renderX / renderIG` は story から生成（今後拡張）

---

## 2. 必須環境変数（Cloud Run）
| key | required | note |
|---|---:|---|
| `LINE_CHANNEL_SECRET` | ✅ | Webhook署名検証 |
| `LINE_CHANNEL_ACCESS_TOKEN` | ✅ | Reply / Push |
| `FIRESTORE_DATABASE_ID` | optional | default: `sora-no-koe-db` |
| `LINE_WEBHOOK_STRICT` | optional | `1`なら署名NG時401 / `0`なら200返してLINE再送ループ回避 |
| `OWNER_LINE_USER_ID` | optional | `/push` の宛先（テスト用） |
| `GOOGLE_MAPS_API_KEY` | optional | 出生地を緯度経度に変換する場合 |
| `DEBUG_TOKEN` | optional | `/debug/resetRegistration` 保護用 |

---

## 3. Firestore コレクション

### `line_users/{lineUserId}`
- `line_user_id`
- `app_user_id`
- `status`
  - `pending_birth_date` → `pending_birth_time` → `pending_birth_place` → `pending_consent` → `ready`
- `profile`
  - `birth_date` (YYYY-MM-DD)
  - `birth_time` (HH:MM or "unknown")
  - `birth_place`
  - `lat`, `lon`（任意：Mapsで引けたら）
  - `timezone`（default: Asia/Tokyo）
- `consent.profile`（true/false）
- `created_at`, `updated_at`

### `users/{app_user_id}`
- `display_name`
- `timezone`
- timestamps

### `natal_cache/{app_user_id}`
- ネイタル計算結果（現状はダミー上書き）
- `computed_at`, `engine`, `updated_at`

### `jobs_natal_calc/{jobId}`
- `type: natal_calc`
- `status: queued/running/done/failed`
- `app_user_id`, `line_user_id`
- `attempts`, `last_error`
- timestamps

### `stories/{userId-dateLocal}`
- `user_id`
- `date_local`
- `story`（JSON本体）
- timestamps

---

## 4. エンドポイント

### `GET /health`
ヘルスチェック。

### `POST /line/webhook`
LINEからのWebhook受信。  
⚠️ bodyParserは `raw({ type:"*/*" })` で受けること。

### `GET /transit?date_local=YYYY-MM-DD`
近似でトランジットを返す（現状の簡易計算）。

### `GET /stories/build?user_id=...&date_local=YYYY-MM-DD`
指定ユーザー×日付の `story` を作って `stories` に保存。

### `GET /posts/x?user_id=...&date_local=YYYY-MM-DD`
storiesからX投稿文を生成。

### `GET /line/daily?user_id=...&date_local=YYYY-MM-DD`
storiesからLINE日次文を生成（現状：X文と同じ生成を流用）

### `GET /push?text=...`
OWNERへPush（テスト用）

### `POST /jobs/worker`
`jobs_natal_calc` の queued を1件処理（現状は natal_cache にダミー保存）

### `GET /debug/resetRegistration?token=...&line_user_id=...`
登録フローを最初に戻す（DEBUG_TOKEN必須）


## 5. ローカル起動
依存インストール
### `npm install`

起動
### `ORT=8080 node index.js`

動作確認
### `curl http://localhost:8080/health`
### `curl "http://localhost:8080/transit?date_local=2025-12-27"`

## 6. デプロイ（Cloud Run）

概念メモ：

コンテナは PORT=8080 を listen すること

Functions Framework 使用時は
functions.http("app", app) がエントリーポイント

## 7. 運用メモ（超重要）
LINE Webhook
    「200 を返す」が正義
    署名NG・JSON破損でも、運用では 200 を返して再送ループを防ぐ

    厳密に弾きたい場合のみ
    LINE_WEBHOOK_STRICT=1 を設定

設計思想
    story.json（器）を中心にする
    stories に保存される JSON が「唯一の真実」
    render（LINE / X / IG）は story を読むだけ
    今後 AI 生成を入れても story を汚さない（別 field で保持）

## 8. TODO（次の3手）
    story.json（器）を確定（schema_v1）
    renderLine / renderX / renderIG を story 中心で整理
    /line/daily を now 対応
    （date_local ではなく as_of で生成・保存できるように）

## 9. ライセンス / 注意
    このプロジェクトは「占い」ではない。
    予測・断定・指示を避け、構造だけを置く。
    
    🔑 重要ポイント（覚えておくと一生楽）
    ChatGPT上で ``` を使う = UI汚染リスク
    README用途なら
    4スペースインデントが最強
    GitHub / VS Code / npm README すべて対応