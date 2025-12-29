# 🌌 sora-no-koe（ソラのこえ）

Astrology resonance API for **sora-no-koe** project  
(Node.js / Cloud Run / Functions Framework)

> 星の配置（構造）を「答えにしない」まま置くシステム。  
> LINEは「個人と空がどこで触れているか」だけを届ける。

- 占いしない  
- 当てない  
- 行動指示しない  
- 救わない  

**星は構造。解釈と選択の主権は、人へ。**

---

## 0. できること（現状）

### ✅ 稼働中
- LINE Webhook（raw body 署名検証）
- 登録フロー  
  生年月日 → 出生時刻 → 出生地 → 同意 → ready
- Firestore 保存（multi DB 対応）
- story.json 中心設計（唯一の真実）

### ✅ API
- `GET /healthz`
- `GET /meta`
- `GET /transit`
- `GET /stories/build`
- `GET /posts/x`
- `GET /line/daily`
- `GET /push`
- `POST /jobs/worker`
- `GET /debug/resetRegistration`

---

## 1. アーキテクチャ概要

- **Cloud Run**
  - Node.js
  - Functions Framework
- **Express**
  - index.js は HTTP / DI / Bootstrapping のみ
- **Firestore**
  - databaseId: `sora-no-koe-db`
- **LINE Messaging API**
  - Webhook は raw body で署名検証（最重要）

### 設計思想
- `stories` に  
  **user × date_local の story.json（器）** を保存
- render（LINE / X / IG）は story を読むだけ
- 将来 AI を入れても story を汚さない

---

## 2. 必須環境変数（Cloud Run）

| key | required | note |
|---|---:|---|
| LINE_CHANNEL_SECRET | ✅ | Webhook署名検証 |
| LINE_CHANNEL_ACCESS_TOKEN | ✅ | Reply / Push |
| FIRESTORE_DATABASE_ID | optional | default: sora-no-koe-db |
| LINE_WEBHOOK_STRICT | optional | 1 = 署名NGで401 |
| OWNER_LINE_USER_ID | optional | /push テスト用 |
| GOOGLE_MAPS_API_KEY | optional | 出生地→緯度経度 |
| DEBUG_TOKEN | optional | debug API 保護 |

---

## 3. Firestore コレクション

### `line_users/{lineUserId}`

- status  
  - pending_birth_date  
  - pending_birth_time  
  - pending_birth_place  
  - pending_consent  
  - ready  

- profile  
  - birth_date (YYYY-MM-DD)  
  - birth_time (HH:MM or "unknown")  
  - birth_place  
  - lat / lon（任意）  
  - timezone (default: Asia/Tokyo)

---

### `users/{app_user_id}`
- display_name  
- timezone  
- timestamps  

---

### `natal_cache/{app_user_id}`
- ネイタル計算結果（暫定）
- computed_at  
- engine  
- updated_at  

---

### `jobs_natal_calc/{jobId}`
- type: natal_calc  
- status: queued / running / done / failed  
- attempts  
- last_error  

---

### `stories/{userId-dateLocal}`
- user_id  
- date_local  
- story（JSON本体）  
- timestamps  

---

## 4. エンドポイント詳細

### `GET /healthz`
ヘルスチェック（依存状態を返す）

### `GET /meta`
現在のサービス状態・依存有無を返す  
（ローカル / Cloud Run 両対応）

### `POST /line/webhook`
LINE Webhook  
**必ず raw body で受けること**

### `GET /transit?date_local=YYYY-MM-DD`
近似トランジット計算

### `GET /stories/build`
指定 user × date_local の story を生成・保存

### `GET /posts/x`
story から X 投稿文を生成

### `GET /line/daily`
story から LINE 日次文を生成

### `GET /push`
OWNER_LINE_USER_ID に Push（テスト用）

### `POST /jobs/worker`
queued な natal_calc を 1 件処理

### `GET /debug/resetRegistration`
登録フローを最初に戻す  
DEBUG_TOKEN 必須

---

## 5. ローカル起動（開発）

### 依存インストール
```bash
npm install

開発モード（推奨）
npm run dev


nodemon により自動再起動

ファイル保存で即反映

動作確認
curl http://localhost:8080/healthz
curl http://localhost:8080/meta
curl "http://localhost:8080/transit?date_local=2025-12-27"

## 6. デプロイ（Cloud Run）

### コンテナは PORT=8080 を listen する

Functions Framework を使用

エントリーポイント
functions.http("app", app);

## 7. 運用メモ（超重要）

### LINE Webhook

「200 を返す」が正義

JSON 破損・署名 NG の場合でも
再送ループ回避のため基本は 200 を返す設計

厳密に弾きたい場合のみ
LINE_WEBHOOK_STRICT=1 を設定

## 8. 次の TODO（直近）

story.json schema_v1 を確定

renderLine / renderX / renderIG を story 中心で整理

/line/daily を as_of 対応に変更

now 起点での生成・保存対応

## 9. ライセンス / 注意

このプロジェクトは「占い」ではない。

予測・断定・指示を避け、
構造だけを置く。

解釈と選択の主権は、常に人にある。
