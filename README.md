🌌 sora-no-koe（ソラのこえ）

Astrology resonance API for sora-no-koe
(Node.js / Cloud Run / Functions Framework)

星の配置（構造）を、答えにしないまま置くシステム。
解釈と選択の主権は、常に人にある。

占わない

当てない

行動指示しない

救わない

星は構造。意味づけは、あなたのもの。

0. できること（現状・確定）
✅ 稼働中

LINE Webhook（raw body 署名検証）

登録フロー
生年月日 → 出生時刻 → 出生地 → 同意 → ready

Firestore 保存（user × date_local）

story.json 中心設計（唯一の正本）

LINE / X / IG 用テキスト生成

1. Production URL（Cloud Run）
https://sora-no-koe-v2-256321662770.asia-northeast1.run.app


デプロイ後も URL は不変

curl / LINE webhook / cron はすべてこの URL を使用

2. アーキテクチャ概要
技術スタック

Cloud Run

Node.js

Functions Framework

Express

index.js は DI / bootstrapping のみ

Firestore

databaseId: sora-no-koe-db

LINE Messaging API

Webhook は raw body で署名検証（最重要）

設計思想（超重要）

stories/{app_user_id}-{date_local} が 唯一の真実

story は「構造データ」

render（LINE / X / IG）は storyを読むだけ

将来 AI を入れても story を汚さない

3. 必須環境変数（Cloud Run）
key	required	note
LINE_CHANNEL_SECRET	✅	Webhook署名検証
LINE_CHANNEL_ACCESS_TOKEN	✅	Reply / Push
FIRESTORE_DATABASE_ID	optional	default: sora-no-koe-db
LINE_WEBHOOK_STRICT	optional	1 = 署名NGで401
OWNER_LINE_USER_ID	optional	/push テスト用
GOOGLE_MAPS_API_KEY	optional	出生地 → 緯度経度
DEBUG_TOKEN	optional	debug API 保護
4. Firestore コレクション
line_users/{lineUserId}

LINE 登録フロー管理

status

pending_birth_date

pending_birth_time

pending_birth_place

pending_consent

ready

profile

birth_date (YYYY-MM-DD)

birth_time (HH:MM or "unknown")

birth_place

lat / lon（任意）

timezone (default: Asia/Tokyo)

users/{app_user_id}

display_name

timezone

timestamps

natal_cache/{app_user_id}

ネイタル計算結果（キャッシュ）

computed_at

engine

jobs_natal_calc/{jobId}

type: natal_calc

status: queued / running / done / failed

attempts

last_error

stories/{app_user_id}-{date_local}

このドキュメントが中核

meta

date_local

as_of

generated_at_utc

finalized（true/false）

finalized_at_utc（確定時のみ）

public / personal

星の配置データ

guardrails

no_prediction / no_should / sovereignty_returned など

※ outputs（LINE/X/IGテキスト）は保存しない

5. エンドポイント一覧（現在の正）
GET /health

ヘルスチェック

GET /meta

サービス状態・依存関係を返す

POST /line/webhook

LINE Webhook
必ず raw body で受けること

🌌 GET /stories（中核API）

story を 生成・取得・保存する唯一のエンドポイント。

主なクエリ
param	note
app_user_id	default: public
date_local	YYYY-MM-DD（省略時は JST 今日）
mode	public / auto
save	true / false
final	true = 今日の確定版としてロック
force	true = ロック無視（救済用）
format	json / line / x / ig / text
channel	text時: line / x / ig
運用ルール（重要）

開発中：save=true → 何回でも更新OK

今日を確定：save=true&final=true

確定後に直したい：
save=true&final=true&force=true

確定後に save=true のみで呼ぶと 409 already_finalized を返す。

その他

GET /transit

GET /line/daily

GET /push

POST /jobs/worker

GET /debug/resetRegistration（DEBUG_TOKEN必須）

6. ローカル起動（開発）
npm install
npm run dev


nodemon により自動再起動。

curl http://localhost:8080/health
curl http://localhost:8080/meta
curl "http://localhost:8080/stories?app_user_id=public"

7. 運用メモ（超重要）
LINE Webhook

200を返すのが正義

再送ループ回避を最優先

厳密に弾く場合のみ
LINE_WEBHOOK_STRICT=1

8. 次の TODO（余裕あるときでOK）

story.json schema_v1 の凍結

renderLine / renderX / renderIG の文言完全統一

cron による「今日のpublic自動確定」

個人版（natal × transit）の公開導線整理

9. ライセンス / スタンス

このプロジェクトは「占い」ではない。

予測・断定・指示を避け、
構造だけを置く。

解釈と選択の主権は、
常に人にある。