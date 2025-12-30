"use strict";

const express = require("express");
const crypto = require("crypto");
const rawBody = require("../middleware/rawBody");
const { createGeocoder } = require("../engine/geocode");

/**
 * 🌌 routes/line.js — Unified STABLE (v2025.12+ OPTIMIZED)
 *
 * ✅ raw-body署名検証（/line/webhook専用）
 * ✅ line_users(docId=line_user_id) → users(app_user_id) をトランザクションで確定
 * ✅ follow/messageでプロフィール同期（可能な範囲で）
 * ✅ 「今日」or 日付で storyService を呼び、renderers.renderLine を返信
 * ✅ 「はじめる」導線：ネイタル収集ステート（生年月日→出生時刻→出生地→geo）
 * ✅ geo: engine/geocode.js に完全統合（キャッシュ対応 / direct "lat,lon" もOK）
 *
 * 最適化:
 * ✅ 文言トンマナ統一（WELCOME基準）
 * ✅ 出生地 geocode 成功率を上げる（整形・再クエリ・候補絞り導線）
 * ✅ geo が確定しない限り finalize しない（体験の矛盾を消す）
 */

function createLineRouter(deps = {}) {
    const router = express.Router();

    const env = deps.env || {};
    const db = deps.db;
    const admin = deps.admin;
    const storyService = deps.storyService;
    const renderers = deps.renderers;

    const LINE_CHANNEL_SECRET = env.LINE_CHANNEL_SECRET;
    const LINE_CHANNEL_ACCESS_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN;

    const LINE_WEBHOOK_STRICT = String(env.LINE_WEBHOOK_STRICT || "0") === "1";
    const DEFAULT_TZ = env.DEFAULT_TZ || "Asia/Tokyo";
    const PROJECT = env.PROJECT || "sora-no-koe";
    const SCHEMA_VERSION = env.SCHEMA_VERSION || "1.0.0";

    const MAX_LINE_TEXT = Number(env.MAX_LINE_TEXT || 4800);
    const ORB_MAX_DEG = Number(env.ORB_MAX_DEG || 6);
    const PRECISION_DEG = Number(env.PRECISION_DEG || 0.01);

    if (!db) throw new Error("deps.db is required for line router");
    if (!admin) throw new Error("deps.admin is required for line router");
    if (!storyService?.buildStoryForUser) throw new Error("deps.storyService.buildStoryForUser is missing");
    if (!renderers?.renderLine) throw new Error("deps.renderers.renderLine is missing");

    // --------------------
    // geocoder (Unified)
    // --------------------
    const geocoder =
        deps.geocoder ||
        createGeocoder({
            apiKey: env.GOOGLE_MAPS_API_KEY || null,
            db,
            project: PROJECT,
            cacheCollection: env.GEO_CACHE_COLLECTION || "geo_cache",
            defaultLanguage: env.GEO_DEFAULT_LANGUAGE || "ja",
            defaultRegion: env.GEO_DEFAULT_REGION || "jp",
            cacheTtlDays: Number(env.GEO_CACHE_TTL_DAYS || 180),
            strict: false,
        });

    // --------------------
    // Tone & Copy (WELCOME基準で統一)
    // --------------------
    const BOT_NAME = env.LINE_ACCOUNT_NAME || env.BOT_NAME || "ソラのこえ。｜今日の星を置く🌌";

    const TEXT = {
        WELCOME:
            "{Nickname}さん\n" +
            `はじめまして！${BOT_NAME}です。\n` +
            "友だち追加ありがとう🛸✨\n\n" +
            "📡 ようこそ、ソラのこえ。へ。\n" +
            "ここは「占い」じゃなくて、\n" +
            "今日の星の配置を“そのまま置く”場所。\n\n" +
            "解釈は、あなたのもの。\n" +
            "「今日の地球も、宇宙にゆれてる。」\n\n" +
            "ソラに聞いてみて。\n" +
            "いまのあなたに、そっと届く\n" +
            "星の配置・光のてがかりを置きます🌌\n\n" +
            "下のどれか、送ってみてね👇\n\n" +
            "「はじめる」\n" +
            "→ 個人版（あなたの回路）を登録\n" +
            "※ 登録した人には、毎朝8時に\n" +
            "　あなた向けの星の配置が届くよ📮\n\n" +
            "「今日」\n" +
            "→ 今日の星の配置（空の構造）\n\n" +
            "「使い方」\n" +
            "→ ヘルプ・説明\n\n" +
            "もしよければ、\n" +
            "あなたの「星の手がかり」も教えてね🕊️\n" +
            "（わからないところは「不明」でOK）\n\n" +
            "まずは「はじめる」って送ってみて🌱",

        HELP:
            "使い方🌌\n\n" +
            "■ 今日のソラのこえ\n" +
            "・「今日」\n\n" +
            "■ 日付で見る\n" +
            "・「2025-12-27」\n" +
            "・「日付 2025/12/27」\n\n" +
            "■ 個人版（あなたの回路）を登録\n" +
            "・「はじめる」\n\n" +
            "登録で聞くもの（不明OK）\n" +
            "1) 生年月日（例：1990-07-24）\n" +
            "2) 出生時刻（例：12:18）\n" +
            "3) 出生地（例：札幌 / Yokohama）\n\n" +
            "💫 毎朝8時のお届け📮（ネイタル登録済みの人だけ）\n" +
            "・今日の星の配置\n" +
            "・強く触れているポイント（Top3）\n" +
            "・ひとこと\n\n" +
            "※ 未来を断定しない／良い悪いを決めない設計。\n" +
            "星は“配置”を置くだけ。\n" +
            "※ 個人向けはLINE内だけで紐づく設計（他SNSと勝手に結合しない）。",

        FALLBACK:
            "「今日」って送ると、今日の星の配置を置くよ🌌\n" +
            "（例：今日 / 2025-12-27 / 日付 2025/12/27）\n" +
            "個人版は「はじめる」",

        START_NATAL:
            "個人版（あなたの回路）を登録するよ🌌\n\n" +
            "まずは【生年月日】を送ってね。\n" +
            "例：1990-07-24\n\n" +
            "わからなければ「不明」でもOK。\n" +
            "やめるなら「やめる」",

        ASK_BIRTH_TIME:
            "次に【出生時刻】を送ってね。\n" +
            "例：12:18（24h）\n\n" +
            "わからなければ「不明」でもOK。",

        ASK_BIRTH_PLACE:
            "最後に【出生地】を送ってね。\n" +
            "例：札幌 / 横浜 / Shimizu, Hokkaido\n\n" +
            "（場所は、緯度経度に変換して計算に使うよ）\n" +
            "わからなければ「不明」でもOK。",

        NATAL_DONE:
            "登録できた🌌\n\n" +
            "これで「今日」を送ると、\n" +
            "空の配置＋あなたの回路で返るよ。\n\n" +
            "💫 毎朝8時のお届け（ネイタル登録済み）も対象になったよ📮",

        // ★ここが超重要：geoが確定しない時に「できた/できてない」矛盾を消す
        BIRTH_PLACE_CONFIRM:
            "受け取ったよ🌌\n" +
            "出生地を“地図の座標”に整えてるところ。\n\n" +
            "よりスムーズにするために、\n" +
            "もう少しだけ短く / 分けて送ってみて🕊️\n" +
            "例：\n" +
            "・遠野市\n" +
            "・遠野 岩手\n" +
            "・Tono, Iwate\n\n" +
            "※ どうしても不明なら「不明」で進められるよ。",

        NATAL_PARTIAL_SKIP:
            "受け取ったよ🌌\n\n" +
            "いまの情報でも、あなた向けの返しは動く。\n" +
            "まず「今日」を送ってみて。\n\n" +
            "あとで整えたくなったら「はじめる」で上書きできるよ🕊️",

        CANCELLED:
            "OK、登録は中断したよ🌌\n" +
            "またやるなら「はじめる」\n" +
            "今日だけ見るなら「今日」",

        RESET_DONE:
            "ネイタル登録をリセットしたよ🌌\n" +
            "もう一回やるなら「はじめる」",

        ERR_BIRTHDATE:
            "生年月日が読み取れなかった🙏\n" +
            "例：1990-07-24\n" +
            "わからなければ「不明」でもOK。",

        ERR_BIRTHTIME:
            "出生時刻が読み取れなかった🙏\n" +
            "例：12:18\n" +
            "わからなければ「不明」でもOK。",

        // デバッグ用（テスト打つのはたぶんあゆっさいだけ、でも一般ユーザーが打っても気持ちいい返し）
        TEST_ACK:
            "OK🌌 受け取ったよ。\n" +
            "「今日」で空の配置 / 「はじめる」で個人版の登録だよ🕊️",
    };

    function fillTemplate(text, vars = {}) {
        return String(text || "").replace(/\{(\w+)\}/g, (_, k) => {
            const v = vars[k];
            return v === undefined || v === null || v === "" ? "" : String(v);
        });
    }

    function renderWelcomeText(profile) {
        const nickname = profile?.displayName || profile?.display_name || "あなた";
        return fillTemplate(TEXT.WELCOME, { Nickname: nickname }).trim();
    }

    // --------------------
    // helpers: date / normalize
    // --------------------
    function toDateLocalJST(date = new Date()) {
        const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        return jst.toISOString().slice(0, 10);
    }

    function asOfIsoFromDateLocalJST(dateLocal) {
        return `${dateLocal}T03:00:00.000Z`; // JST 12:00
    }

    function normalizeText(s) {
        return String(s || "").trim().replace(/\s+/g, " ");
    }

    function normalizeForCommand(s) {
        const t = normalizeText(s);
        return t
            .replace(/[🌌✨⭐️💫🩷🩵💙♾️🛜👽🔥☀️🌙🛸📡📮🕊️]+/g, "")
            .replace(/[！!？?。．,.、】【「」『』（）()\[\]{}<>]/g, "")
            .trim();
    }

    function isUnknown(text) {
        const t = normalizeForCommand(text);
        return /^(不明|unknown|dontknow|わからない|分からない|知らない)$/i.test(t);
    }

    // --------------------
    // helpers: parse natal inputs
    // --------------------
    function parseYYYYMMDD(text) {
        const t = String(text || "").trim();
        const m = t.match(/(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{4}-\d{1,2}-\d{1,2})/);
        if (!m) return null;

        const cand = String(m[1]).trim().replace(/[\/\.]/g, "-");
        const mm = cand.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (!mm) return null;

        const y = mm[1];
        const mo = String(mm[2]).padStart(2, "0");
        const d = String(mm[3]).padStart(2, "0");
        const dateLocal = `${y}-${mo}-${d}`;

        const dt = new Date(`${dateLocal}T00:00:00.000Z`);
        if (Number.isNaN(dt.getTime())) return null;
        if (dt.toISOString().slice(0, 10) !== dateLocal) return null;
        return dateLocal;
    }

    function parseHHMM(text) {
        const t = String(text || "").trim();
        const m = t.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
        if (!m) return null;
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        if (hh < 0 || hh > 23) return null;
        if (mm < 0 || mm > 59) return null;
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }

    function parseDateLocalFromText(text) {
        return parseYYYYMMDD(text);
    }

    // --------------------
    // helpers: raw body / signature
    // --------------------
    function getRawBodyBuffer(req) {
        const rb = req.rawBody ?? req.bodyRaw ?? null;
        if (Buffer.isBuffer(rb)) return rb;
        if (typeof rb === "string") return Buffer.from(rb, "utf8");
        return null;
    }

    function verifyLineSignature({ rawBodyBuf, channelSecret, signatureHeader }) {
        if (!channelSecret) return { ok: false, reason: "LINE_CHANNEL_SECRET missing" };
        if (!signatureHeader) return { ok: false, reason: "x-line-signature missing" };
        if (!rawBodyBuf || !Buffer.isBuffer(rawBodyBuf)) return { ok: false, reason: "raw body missing" };

        const computed = crypto.createHmac("sha256", channelSecret).update(rawBodyBuf).digest("base64");
        const a = Buffer.from(computed);
        const b = Buffer.from(String(signatureHeader));
        if (a.length !== b.length) return { ok: false, reason: "signature length mismatch" };

        const ok = crypto.timingSafeEqual(a, b);
        return { ok, reason: ok ? "ok" : "signature mismatch" };
    }

    // --------------------
    // LINE API
    // --------------------
    async function lineApi(path, { method = "GET", body = null } = {}) {
        if (!LINE_CHANNEL_ACCESS_TOKEN) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is missing");
        if (typeof fetch !== "function") throw new Error("global fetch is not available (Node 18+ required)");

        const url = `https://api.line.me${path}`;
        const headers = { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` };
        if (body) headers["Content-Type"] = "application/json";

        const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
        const text = await res.text();

        let json = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch (_) { }

        if (!res.ok) {
            const msg = json?.message || json?.details?.[0]?.message || text || `LINE API error ${res.status}`;
            throw new Error(msg);
        }
        return json;
    }

    async function lineReply(replyToken, messages) {
        return lineApi("/v2/bot/message/reply", { method: "POST", body: { replyToken, messages } });
    }

    async function lineGetProfile(lineUserId) {
        return lineApi(`/v2/bot/profile/${encodeURIComponent(lineUserId)}`, { method: "GET" });
    }

    // --------------------
    // Firestore helpers
    // --------------------
    function lineUserDocId(lineUserId) {
        return lineUserId;
    }

    function newAppUserId() {
        return `u_me_${crypto.randomBytes(10).toString("hex")}`;
    }

    function serverNow() {
        return admin.firestore.FieldValue.serverTimestamp();
    }

    async function getUserDoc(appUserId) {
        if (!appUserId) return null;
        const snap = await db.collection("users").doc(appUserId).get();
        return snap.exists ? snap.data() : null;
    }

    async function getOrCreateAppUserIdByLine(lineUserId, lineProfile, { eventType = "message" } = {}) {
        const lineRef = db.collection("line_users").doc(lineUserDocId(lineUserId));
        const now = serverNow();

        return db.runTransaction(async (tx) => {
            const snap = await tx.get(lineRef);
            const existing = snap.exists ? snap.data() : null;

            const already = existing?.app_user_id || null;
            const appUserId = already || newAppUserId();
            const userRef = db.collection("users").doc(appUserId);

            tx.set(
                userRef,
                {
                    status: "active",
                    profile: {
                        display_name: lineProfile?.displayName ?? existing?.line_profile?.display_name ?? null,
                        timezone: DEFAULT_TZ,
                    },
                    channels: {
                        line: { line_user_id: lineUserId, linked_at: now },
                        email: null,
                    },
                    created_at: existing?.created_at ?? now,
                    updated_at: now,
                },
                { merge: true }
            );

            tx.set(
                lineRef,
                {
                    line_user_id: lineUserId,
                    app_user_id: appUserId,
                    created_at: existing?.created_at ?? now,
                    updated_at: now,
                    line_profile: {
                        display_name: lineProfile?.displayName ?? existing?.line_profile?.display_name ?? null,
                        language: lineProfile?.language ?? existing?.line_profile?.language ?? "ja",
                        picture_url: lineProfile?.pictureUrl ?? existing?.line_profile?.picture_url ?? null,
                        line_user_id: lineUserId,
                    },
                    meta: {
                        schema_version: SCHEMA_VERSION,
                        last_event_type: eventType,
                        last_seen_at: now,
                        project: PROJECT,
                    },
                    consent: {
                        profile: true,
                        personal_data: existing?.consent?.personal_data ?? false,
                        public_share: existing?.consent?.public_share ?? false,
                        version: existing?.consent?.version ?? 1,
                        agreed_at: existing?.consent?.agreed_at ?? null,
                    },
                    status: existing?.status ?? "new",
                },
                { merge: true }
            );

            return appUserId;
        });
    }

    async function upsertLineUserProfile(lineUserId, lineProfile, { eventType = "message" } = {}) {
        const ref = db.collection("line_users").doc(lineUserDocId(lineUserId));
        const now = serverNow();

        await ref.set(
            {
                updated_at: now,
                line_profile: {
                    display_name: lineProfile?.displayName ?? null,
                    language: lineProfile?.language ?? "ja",
                    picture_url: lineProfile?.pictureUrl ?? null,
                    line_user_id: lineUserId,
                },
                meta: {
                    schema_version: SCHEMA_VERSION,
                    last_event_type: eventType,
                    last_seen_at: now,
                    project: PROJECT,
                },
                consent: { profile: true },
            },
            { merge: true }
        );
    }

    async function upsertUsersDisplayName(appUserId, displayName) {
        if (!appUserId) return;
        const ref = db.collection("users").doc(appUserId);
        await ref.set(
            {
                updated_at: serverNow(),
                profile: { display_name: displayName ?? null, timezone: DEFAULT_TZ },
            },
            { merge: true }
        );
    }

    // --------------------
    // natal state machine
    // --------------------
    const NATAL_STAGE = {
        idle: "idle",
        birth_date: "birth_date",
        birth_time: "birth_time",
        birth_place: "birth_place",
        done: "done",
    };

    function getNatalStage(userDoc) {
        return userDoc?.natal?.collect?.stage || NATAL_STAGE.idle;
    }

    async function setNatalStage(appUserId, stage) {
        const ref = db.collection("users").doc(appUserId);
        await ref.set(
            {
                updated_at: serverNow(),
                natal: {
                    collect: { stage, updated_at: serverNow(), version: 1 },
                },
            },
            { merge: true }
        );
    }

    async function resetNatal(appUserId) {
        const ref = db.collection("users").doc(appUserId);
        await ref.set(
            {
                updated_at: serverNow(),
                natal: {
                    enabled: false,
                    collect: { stage: NATAL_STAGE.idle, updated_at: serverNow(), version: 1 },
                    birth: {
                        date_local: null,
                        time_hm: null,
                        place_text: null,
                        lat: null,
                        lon: null,
                        place_formatted: null,
                        place_id: null,
                        timezone: DEFAULT_TZ,
                    },
                },
            },
            { merge: true }
        );
    }

    async function saveNatalBirthDate(appUserId, dateLocalOrNull) {
        const ref = db.collection("users").doc(appUserId);
        await ref.set(
            {
                updated_at: serverNow(),
                natal: { birth: { date_local: dateLocalOrNull, timezone: DEFAULT_TZ } },
            },
            { merge: true }
        );
    }

    async function saveNatalBirthTime(appUserId, timeHmOrNull) {
        const ref = db.collection("users").doc(appUserId);
        await ref.set(
            {
                updated_at: serverNow(),
                natal: { birth: { time_hm: timeHmOrNull, timezone: DEFAULT_TZ } },
            },
            { merge: true }
        );
    }

    async function saveNatalBirthPlace(appUserId, { placeText, geo }) {
        const ref = db.collection("users").doc(appUserId);
        await ref.set(
            {
                updated_at: serverNow(),
                natal: {
                    birth: {
                        place_text: placeText ?? null,
                        lat: geo?.ok ? geo.lat : null,
                        lon: geo?.ok ? geo.lon : null,
                        place_formatted: geo?.ok ? geo.formatted : null,
                        place_id: geo?.ok ? geo.place_id : null,
                        timezone: DEFAULT_TZ,
                    },
                },
            },
            { merge: true }
        );
    }

    async function finalizeNatal(appUserId) {
        const ref = db.collection("users").doc(appUserId);
        await ref.set(
            {
                updated_at: serverNow(),
                natal: {
                    enabled: true,
                    completed_at: serverNow(),
                    collect: { stage: NATAL_STAGE.done, updated_at: serverNow(), version: 1 },
                    delivery: { daily_8: true },
                },
            },
            { merge: true }
        );
    }

    // --------------------
    // logs
    // --------------------
    async function logLineEvent(event) {
        try {
            const raw = JSON.stringify({
                type: event?.type ?? null,
                ts: event?.timestamp ?? null,
                uid: event?.source?.userId ?? null,
                mid: event?.message?.id ?? null,
                replyToken: event?.replyToken ?? null,
            });

            const id = crypto.createHash("sha1").update(raw).digest("hex");
            await db.collection("line_events").doc(id).set(
                {
                    type: event?.type ?? null,
                    timestamp: event?.timestamp ?? null,
                    source: event?.source ?? null,
                    message: event?.message ?? null,
                    postback: event?.postback ?? null,
                    created_at: serverNow(),
                },
                { merge: true }
            );
        } catch (_) { }
    }

    // --------------------
    // Place normalization & geocode retry (成功率UP)
    // --------------------
    function normalizePlaceInput(placeText) {
        let s = normalizeText(placeText);

        // 余計な記号を落とす（地名に効く）
        s = s.replace(/[()（）【】［］\[\]{}<>]/g, " ").replace(/\s+/g, " ").trim();

        // 「県」「市」などは残す（日本は残した方がヒットすることが多い）
        // ただし「岩手県遠野市」みたいな連結は、分割パターンも用意する
        return s;
    }

    function buildPlaceQueries(placeText) {
        const s = normalizePlaceInput(placeText);

        // direct lat,lon は geocoder 側で対応してる想定だが、ここでも軽く救う
        // (例) "39.327,141.533"
        const m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
        if (m) return [s];

        // 日本向け：都道府県を含む/含まない/スペース区切り/カンマ区切り
        const variants = new Set();
        variants.add(s);

        // 「岩手県遠野市」→「遠野市 岩手」「遠野 岩手」「遠野市」
        const prefMatch = s.match(/^(北海道|東京都|大阪府|京都府|.{2,3}県)(.+)$/);
        if (prefMatch) {
            const pref = prefMatch[1];
            const rest = (prefMatch[2] || "").trim();
            if (rest) {
                variants.add(`${rest} ${pref}`);
                variants.add(`${rest.replace(/市|町|村|郡/g, "").trim()} ${pref}`);
                variants.add(rest);
            }
            variants.add(`${pref} ${rest}`.trim());
        }

        // 句読点/読点/全角スペースを分割
        if (s.includes("　")) variants.add(s.replace(/　/g, " "));
        if (s.includes("、")) variants.add(s.replace(/、/g, " "));
        if (s.includes("・")) variants.add(s.replace(/・/g, " "));
        if (s.includes(",")) variants.add(s.replace(/,/g, " "));

        // 最後の保険：日本を足す（国外の同名地を避ける）
        variants.add(`${s} Japan`);
        variants.add(`${s} 日本`);

        // 長いの優先（情報量が多いほど強い）→ ただし極端な重複は除外済み
        return Array.from(variants).filter(Boolean).sort((a, b) => b.length - a.length).slice(0, 6);
    }

    async function geocodeBestEffort(placeText) {
        const queries = buildPlaceQueries(placeText);

        for (const q of queries) {
            try {
                const geo = await geocoder.geocodePlace(q, { language: "ja", region: "jp" });
                if (geo?.ok) return geo;
            } catch (_) {
                // 次の候補へ
            }
        }

        // ここまでで ok にできなかった場合も “終わり” にしない
        // geocoder 実装によっては candidates を返すケースがあるので、最後に生の結果を取る
        try {
            const raw = await geocoder.geocodePlace(normalizePlaceInput(placeText), { language: "ja", region: "jp" });
            return raw || { ok: false, candidates: [] };
        } catch (e) {
            return { ok: false, status: "ERROR", reason: e?.message || String(e), candidates: [] };
        }
    }

    // --------------------
    // main webhook
    // --------------------
    router.post("/webhook", rawBody(), async (req, res) => {
        try {
            const sig = req.header("x-line-signature");
            const rawBuf = getRawBodyBuffer(req);

            const ver = verifyLineSignature({
                rawBodyBuf: rawBuf,
                channelSecret: LINE_CHANNEL_SECRET,
                signatureHeader: sig,
            });

            if (!ver.ok) {
                console.log("[line:webhook] signature invalid:", ver.reason);
                if (LINE_WEBHOOK_STRICT) return res.status(401).json({ ok: false, error: "invalid signature" });
                return res.status(200).json({ ok: true });
            }

            let body = {};
            try {
                body = rawBuf?.length ? JSON.parse(rawBuf.toString("utf8") || "{}") : req.body || {};
            } catch (_) {
                console.log("[line:webhook] invalid json");
                return res.status(200).json({ ok: true });
            }

            const events = Array.isArray(body?.events) ? body.events : [];
            if (!events.length) return res.status(200).json({ ok: true });

            const replied = new Set();

            for (const event of events) {
                await logLineEvent(event);

                const lineUserId = event?.source?.userId || null;
                const replyToken = event?.replyToken || null;

                const safeReply = async (token, messages) => {
                    if (!token) return;
                    if (replied.has(token)) return;
                    replied.add(token);
                    try {
                        await lineReply(token, messages);
                    } catch (e) {
                        console.log("[line:reply] failed:", e?.message || e);
                    }
                };

                if (event?.type === "unfollow") continue;

                if (event?.type === "follow" && lineUserId && replyToken) {
                    let profile = null;
                    try {
                        profile = await lineGetProfile(lineUserId);
                    } catch (_) { }

                    const appUserId = await getOrCreateAppUserIdByLine(lineUserId, profile, { eventType: "follow" });
                    if (profile?.displayName) await upsertUsersDisplayName(appUserId, profile.displayName);
                    if (profile) await upsertLineUserProfile(lineUserId, profile, { eventType: "follow" });

                    await safeReply(replyToken, [{ type: "text", text: renderWelcomeText(profile) }]);
                    continue;
                }

                if (event?.type === "message" && event?.message?.type === "text" && replyToken) {
                    const rawText = normalizeText(event.message.text);
                    const cmdText = normalizeForCommand(rawText);

                    let profile = null;
                    if (lineUserId) {
                        try {
                            profile = await lineGetProfile(lineUserId);
                        } catch (_) { }
                    }

                    const appUserId = lineUserId
                        ? await getOrCreateAppUserIdByLine(lineUserId, profile, { eventType: "message" })
                        : null;

                    if (profile) {
                        await upsertLineUserProfile(lineUserId, profile, { eventType: "message" });
                        if (appUserId && profile.displayName) await upsertUsersDisplayName(appUserId, profile.displayName);
                    }

                    const effectiveUserId = appUserId || "public";

                    // debug / ping
                    if (/^(ping)$/i.test(cmdText)) {
                        await safeReply(replyToken, [{ type: "text", text: "pong" }]);
                        continue;
                    }
                    if (/^(test|テスト)$/i.test(cmdText)) {
                        await safeReply(replyToken, [{ type: "text", text: TEXT.TEST_ACK }]);
                        continue;
                    }

                    // help
                    if (/^(help|使い方|へるぷ)$/i.test(cmdText)) {
                        await safeReply(replyToken, [{ type: "text", text: TEXT.HELP }]);
                        continue;
                    }

                    // cancel / reset / start
                    if (/^(やめる|中止|cancel|stop)$/i.test(cmdText)) {
                        if (appUserId) await setNatalStage(appUserId, NATAL_STAGE.idle);
                        await safeReply(replyToken, [{ type: "text", text: TEXT.CANCELLED }]);
                        continue;
                    }

                    if (/^(リセット|reset)$/i.test(cmdText)) {
                        if (appUserId) await resetNatal(appUserId);
                        await safeReply(replyToken, [{ type: "text", text: TEXT.RESET_DONE }]);
                        continue;
                    }

                    if (/^(はじめる|始める|start|begin)$/i.test(cmdText)) {
                        if (appUserId) await setNatalStage(appUserId, NATAL_STAGE.birth_date);
                        await safeReply(replyToken, [{ type: "text", text: TEXT.START_NATAL }]);
                        continue;
                    }

                    // ---- natal collecting ----
                    if (appUserId) {
                        const userDoc = await getUserDoc(appUserId);
                        const stage = getNatalStage(userDoc);

                        if (stage !== NATAL_STAGE.idle && stage !== NATAL_STAGE.done) {
                            if (stage === NATAL_STAGE.birth_date) {
                                if (isUnknown(rawText)) {
                                    await saveNatalBirthDate(appUserId, null);
                                    await setNatalStage(appUserId, NATAL_STAGE.birth_time);
                                    await safeReply(replyToken, [{ type: "text", text: TEXT.ASK_BIRTH_TIME }]);
                                    continue;
                                }

                                const d = parseYYYYMMDD(rawText);
                                if (!d) {
                                    await safeReply(replyToken, [{ type: "text", text: TEXT.ERR_BIRTHDATE }]);
                                    continue;
                                }

                                await saveNatalBirthDate(appUserId, d);
                                await setNatalStage(appUserId, NATAL_STAGE.birth_time);
                                await safeReply(replyToken, [{ type: "text", text: TEXT.ASK_BIRTH_TIME }]);
                                continue;
                            }

                            if (stage === NATAL_STAGE.birth_time) {
                                if (isUnknown(rawText)) {
                                    await saveNatalBirthTime(appUserId, null);
                                    await setNatalStage(appUserId, NATAL_STAGE.birth_place);
                                    await safeReply(replyToken, [{ type: "text", text: TEXT.ASK_BIRTH_PLACE }]);
                                    continue;
                                }

                                const hm = parseHHMM(rawText);
                                if (!hm) {
                                    await safeReply(replyToken, [{ type: "text", text: TEXT.ERR_BIRTHTIME }]);
                                    continue;
                                }

                                await saveNatalBirthTime(appUserId, hm);
                                await setNatalStage(appUserId, NATAL_STAGE.birth_place);
                                await safeReply(replyToken, [{ type: "text", text: TEXT.ASK_BIRTH_PLACE }]);
                                continue;
                            }

                            if (stage === NATAL_STAGE.birth_place) {
                                if (isUnknown(rawText)) {
                                    await saveNatalBirthPlace(appUserId, { placeText: null, geo: null });
                                    await finalizeNatal(appUserId);
                                    await safeReply(replyToken, [{ type: "text", text: TEXT.NATAL_PARTIAL_SKIP }]);
                                    continue;
                                }

                                const placeText = rawText;

                                // ✅ success率UP geocode（整形→再クエリ）
                                const geo = await geocodeBestEffort(placeText);

                                // 保存は必ずする（入力の履歴として）
                                await saveNatalBirthPlace(appUserId, { placeText, geo });


                                if (geo?.ok) {
                                    await safeReply(replyToken, [{ type: "text", text: TEXT_NATAL_DONE }]);
                                } else {
                                    let reasonText = "";

                                    switch (geo?.status) {
                                        case "ZERO_RESULTS":
                                            reasonText =
                                                "場所が特定できなかったみたい🕊️\n" +
                                                "・市区町村だけ（例：遠野市）\n" +
                                                "・英語表記（例：Tono, Iwate）\n" +
                                                "・座標（例：39.33, 141.53）\n\n" +
                                                "どれかで再送するか、「不明」で進めるよ。";
                                            break;

                                        case "REQUEST_DENIED":
                                            reasonText =
                                                "これはサーバー側の設定の問題っぽい🙏\n" +
                                                "こちらで整えるから、少し待っててね。\n\n" +
                                                "いまは「不明」で進んでもOKだよ。";
                                            break;

                                        case "OVER_QUERY_LIMIT":
                                            reasonText =
                                                "いま少し混み合ってるみたい🌌\n" +
                                                "時間をおいてもう一度送るか、「不明」で進めるよ。";
                                            break;

                                        default:
                                            reasonText =
                                                "場所の解釈がうまく合わなかったみたい🕊️\n" +
                                                "表記を少し変えるか、「不明」で進めるよ。";
                                    }

                                    await safeReply(replyToken, [
                                        {
                                            type: "text",
                                            text:
                                                "受け取ったよ🌌\n" +
                                                "出生地を“地図の座標”に整えようとしてるところ。\n\n" +
                                                reasonText,
                                        },
                                    ]);
                                }

                                continue;
                            }
                        }
                    }

                    // ---- normal story flow ----
                    const dateLocal = parseDateLocalFromText(rawText);

                    const wantsToday =
                        /^(今日|きょう|本日|ソラ|そら|sora)$/i.test(cmdText) ||
                        /^(今日のソラ|今日のそら|今日の空)$/i.test(cmdText);

                    const wants = wantsToday || !!dateLocal;

                    if (wants) {
                        const dl = dateLocal || toDateLocalJST();
                        const asOfISO = asOfIsoFromDateLocalJST(dl);

                        const story = await storyService.buildStoryForUser({
                            appUserId: effectiveUserId,
                            dateLocal: dl,
                            asOfISO,
                            orbMaxDeg: ORB_MAX_DEG,
                            precisionDeg: PRECISION_DEG,
                        });

                        const msg = renderers.renderLine(story) || "";
                        const safeText = msg.length > MAX_LINE_TEXT ? msg.slice(0, MAX_LINE_TEXT) : msg;

                        await safeReply(replyToken, [{ type: "text", text: safeText || TEXT.FALLBACK }]);
                        continue;
                    }

                    await safeReply(replyToken, [{ type: "text", text: TEXT.FALLBACK }]);
                    continue;
                }

                // postback等：今は返信しない（安全運用）
            }

            return res.status(200).json({ ok: true });
        } catch (e) {
            console.error("[line:webhook] fatal:", e?.message || e);
            return res.status(200).json({ ok: true });
        }
    });

    return router;
}

module.exports = { createLineRouter };
