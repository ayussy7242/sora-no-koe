"use strict";

const appEnv = require("../config/env");
const express = require("express");
const crypto = require("crypto");
const rawBody = require("../middleware/rawBody");
const { createGeocoder } = require("../engine/geocode");

/**
 * 🌌 routes/line.js — Unified STABLE (v2025.12.31 FIX)
 *
 * ✅ コマンドは3つだけ（FIX）
 * - 今日 / きょう     → intent=personal_today  （personal.touch_points_top3）
 * - そら               → intent=public_sky      （public.sky_top）
 * - わたしのほし       → intent=natal_list      （natal_cacheから ASC/MC/天体一覧）
 *
 * ✅ 「そら」は必ず public-only（個人情報が混ざらない）
 * ✅ 「今日」は app_user_id がある時だけ personal、無ければ public を返して導線
 *
 * - /line/webhook 専用 raw-body 署名検証
 * - line_users(docId=line_user_id) → users(app_user_id) をトランザクションで確定
 * - follow/message でプロフィール同期
 * - 「はじめる」導線：ネイタル収集ステート（生年月日→出生時刻→出生地→geo）
 * - geo: engine/geocode.js（cache / lat,lon OK）
 */

function createLineRouter(deps = {}) {
  const router = express.Router();

  // ✅ env は最初に確定（最重要）
  const env = deps.env || appEnv;

  // deps
  const db = deps.db;
  const admin = deps.admin;
  const storyService = deps.storyService;
  const renderers = deps.renderers;

  if (!db) throw new Error("deps.db is required for line router");
  if (!admin) throw new Error("deps.admin is required for line router");
  if (!storyService?.buildStoryForUser) throw new Error("deps.storyService.buildStoryForUser is missing");
  if (!renderers?.renderLine) throw new Error("deps.renderers.renderLine is missing");
  if (!renderers?.renderNatalListFromCache)
    throw new Error("deps.renderers.renderNatalListFromCache is missing");

  // constants
  const LINE_CHANNEL_SECRET = env.LINE_CHANNEL_SECRET;
  const LINE_CHANNEL_ACCESS_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN;

  const LINE_WEBHOOK_STRICT = String(env.LINE_WEBHOOK_STRICT || "0") === "1";
  const DEFAULT_TZ = env.DEFAULT_TZ || "Asia/Tokyo";
  const PROJECT = env.PROJECT || "sora-no-koe";
  const SCHEMA_VERSION = env.SCHEMA_VERSION || "1.0.0";

  const MAX_LINE_TEXT = Number(env.MAX_LINE_TEXT || 4800);
  const ORB_MAX_DEG = Number(env.ORB_MAX_DEG || 6);
  const PRECISION_DEG = Number(env.PRECISION_DEG || 0.01);

  const GEO_LANG = env.GEO_DEFAULT_LANGUAGE || "ja";
  const GEO_REGION = env.GEO_DEFAULT_REGION || "jp";

  // --------------------
  // geocoder (Unified)
  // --------------------
  const geocoder =
    deps.geocoder ||
    createGeocoder({
      apiKey: env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || null,
      db,
      project: PROJECT,
      cacheCollection: env.GEO_CACHE_COLLECTION || "geo_cache",
      defaultLanguage: GEO_LANG,
      defaultRegion: GEO_REGION,
      cacheTtlDays: Number(env.GEO_CACHE_TTL_DAYS || 180),
      strict: false,
    });

  // --------------------
  // Tone & Copy
  // --------------------
  const BOT_NAME = env.LINE_ACCOUNT_NAME || env.BOT_NAME || "ソラのこえ。｜今日の星を置く🌌";

  const TEXT = {
    WELCOME:
      "{Nickname}さん\n" +
      `はじめまして！${BOT_NAME}です。\n` +
      "友だち追加ありがとう🛸✨\n\n" +
      "ここは「占い」じゃなくて、\n" +
      "今日の星の配置を“そのまま置く”場所。\n" +
      "解釈は、あなたのもの。\n\n" +
      "まずは下のどれか送ってみて👇\n\n" +
      "「はじめる」→ 個人版（あなたの回路）を登録\n" +
      "「今日」→ あなた基準の今日（※登録済みならpersonal）\n" +
      "「そら」→ 空の構造だけ（public）\n" +
      "「わたしのほし」→ あなたのネイタル一覧（ASC/MC含む）\n" +
      "「使い方」→ ヘルプ\n\n" +
      "（わからないところは「不明」でOK）",

    HELP:
      "使い方🌌（FIX版）\n\n" +
      "■ コマンドは3つだけ\n" +
      "・「今日」/「きょう」：あなた基準の今日（登録済みなら personal）\n" +
      "・「そら」：空の構造だけ（public）\n" +
      "・「わたしのほし」：あなたのネイタル一覧（ASC/MC含む）\n\n" +
      "■ 個人版（あなたの回路）登録\n" +
      "・「はじめる」\n\n" +
      "登録で聞くもの（不明OK）\n" +
      "1) 生年月日（例：1990-07-24 / 19900724）\n" +
      "2) 出生時刻（例：12:18）\n" +
      "3) 出生地（例：札幌 / Yokohama / Tono, Iwate）\n\n" +
      "※ 未来を断定しない／良い悪いを決めない。\n" +
      "星は“配置”を置くだけ。\n" +
      "※ 個人向けはLINE内だけで紐づく（他SNSと勝手に結合しない）。",

    FALLBACK:
      "コマンドはこの3つだけだよ🌌\n" +
      "「今日」/「きょう」\n" +
      "「そら」\n" +
      "「わたしのほし」\n\n" +
      "個人版の登録は「はじめる」",

    START_NATAL:
      "個人版（あなたの回路）を登録するよ🌌\n\n" +
      "まずは【生年月日】を送ってね。\n" +
      "例：1990-07-24（または 19900724）\n\n" +
      "わからなければ「不明」でもOK。\n" +
      "やめるなら「やめる」",

    ASK_BIRTH_TIME:
      "次に【出生時刻】を送ってね。\n" +
      "例：12:18（24h）\n\n" +
      "わからなければ「不明」でもOK。",

    ASK_BIRTH_PLACE:
      "最後に【出生地】を送ってね。\n" +
      "例：札幌 / 横浜 / Shimizu, Hokkaido / Tono, Iwate\n\n" +
      "（場所は、緯度経度に変換して計算に使うよ）\n" +
      "わからなければ「不明」でもOK。",

    NATAL_DONE:
      "登録できた🌌\n\n" +
      "これで「今日」を送ると、\n" +
      "空の配置＋あなたの回路で返るよ。\n\n" +
      "💫 毎朝8時のお届け（ネイタル登録済み）も対象になったよ📮",

    NATAL_PARTIAL_SKIP:
      "受け取ったよ🌌\n\n" +
      "いまの情報でも、あなた向けの返しは動く。\n" +
      "まず「今日」を送ってみて。\n\n" +
      "あとで整えたくなったら「はじめる」で上書きできるよ🕊️",

    CANCELLED:
      "OK、登録は中断したよ🌌\n" +
      "またやるなら「はじめる」\n" +
      "今日だけ見るなら「そら」/「今日」",

    RESET_DONE:
      "ネイタル登録をリセットしたよ🌌\n" +
      "もう一回やるなら「はじめる」",

    ERR_BIRTHDATE:
      "生年月日が読み取れなかった🙏\n" +
      "例：1990-07-24（または 19900724）\n" +
      "わからなければ「不明」でもOK。",

    ERR_BIRTHTIME:
      "出生時刻が読み取れなかった🙏\n" +
      "例：12:18\n" +
      "わからなければ「不明」でもOK。",

    TEST_ACK:
      "OK🌌 受け取ったよ。\n" +
      "「今日」/「そら」/「わたしのほし」\n" +
      "登録は「はじめる」🕊️",
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
    // JST 12:00 をUTCで固定（3:00Z）
    return `${dateLocal}T03:00:00.000Z`;
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
  // FIX: 3 commands only
  // --------------------
  function intentFromCommand(cmdText) {
    const t = normalizeForCommand(cmdText);
    if (t === "今日" || t === "きょう") return "personal_today";
    if (t === "そら") return "public_sky";
    if (t === "わたしのほし") return "natal_list";
    return null;
  }

  // --------------------
  // parse natal inputs
  // --------------------
  function parseYYYYMMDD(text) {
    const t = String(text || "").trim();

    // 1) 1990-07-24 / 1990/07/24 / 1990.07.24
    const m1 = t.match(/(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/);
    if (m1) {
      const cand = String(m1[1]).trim().replace(/[\/\.]/g, "-");
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

    // 2) 19900724
    const m2 = t.match(/(\d{8})/);
    if (m2) {
      const s = m2[1];
      const y = s.slice(0, 4);
      const mo = s.slice(4, 6);
      const d = s.slice(6, 8);
      const dateLocal = `${y}-${mo}-${d}`;
      const dt = new Date(`${dateLocal}T00:00:00.000Z`);
      if (Number.isNaN(dt.getTime())) return null;
      if (dt.toISOString().slice(0, 10) !== dateLocal) return null;
      return dateLocal;
    }

    return null;
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

  // --------------------
  // raw body / signature
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
    } catch (_) {}

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
        natal: { collect: { stage, updated_at: serverNow(), version: 1 } },
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
      { updated_at: serverNow(), natal: { birth: { date_local: dateLocalOrNull, timezone: DEFAULT_TZ } } },
      { merge: true }
    );
  }

  async function saveNatalBirthTime(appUserId, timeHmOrNull) {
    const ref = db.collection("users").doc(appUserId);
    await ref.set(
      { updated_at: serverNow(), natal: { birth: { time_hm: timeHmOrNull, timezone: DEFAULT_TZ } } },
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
    } catch (_) {}
  }

  // --------------------
  // Place normalization & geocode retry
  // --------------------
  function normalizePlaceInput(placeText) {
    let s = normalizeText(placeText);
    s = s.replace(/[()（）【】［］\[\]{}<>]/g, " ").replace(/\s+/g, " ").trim();
    return s;
  }

  function buildPlaceQueries(placeText) {
    const s = normalizePlaceInput(placeText);

    // direct lat,lon
    const m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) return [s];

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

    if (s.includes("　")) variants.add(s.replace(/　/g, " "));
    if (s.includes("、")) variants.add(s.replace(/、/g, " "));
    if (s.includes("・")) variants.add(s.replace(/・/g, " "));
    if (s.includes(",")) variants.add(s.replace(/,/g, " "));

    // 最後の保険
    variants.add(`${s} Japan`);
    variants.add(`${s} 日本`);

    return Array.from(variants)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .slice(0, 6);
  }

  async function geocodeBestEffort(placeText) {
    const queries = buildPlaceQueries(placeText);

    for (const q of queries) {
      try {
        const geo = await geocoder.geocodePlace(q, { language: GEO_LANG, region: GEO_REGION });
        if (geo?.ok) return geo;
      } catch (_) {}
    }

    try {
      const raw = await geocoder.geocodePlace(normalizePlaceInput(placeText), { language: GEO_LANG, region: GEO_REGION });
      return raw || { ok: false, candidates: [] };
    } catch (e) {
      return { ok: false, status: "ERROR", reason: e?.message || String(e), candidates: [] };
    }
  }

  // --------------------
  // debug (optional)
  // --------------------
  router.get("/debug/geocode", async (req, res) => {
    try {
      const token = String(req.query.token || "");
      const q = String(req.query.q || "").trim();

      if (!env.DEBUG_TOKEN) return res.status(500).json({ ok: false, error: "DEBUG_TOKEN missing" });
      if (token !== String(env.DEBUG_TOKEN)) return res.status(403).json({ ok: false, error: "forbidden" });
      if (!q) return res.status(400).json({ ok: false, error: "q is required" });

      const mapsKey = env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
      const hasKey = !!mapsKey;
      const keySig = hasKey ? String(mapsKey).slice(0, 6) + "..." : null;

      const geo = await geocoder.geocodePlace(q, { language: GEO_LANG, region: GEO_REGION });

      console.log("[debug] geocode", {
        q,
        ok: !!geo?.ok,
        status: geo?.status,
        reason: geo?.reason,
        error_message: geo?.error_message,
      });

      return res.json({ ok: true, q, hasKey, keySig, geo });
    } catch (e) {
      console.error("[debug] geocode fatal", e?.message || e);
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // --------------------
  // main webhook
  // --------------------
  router.post("/webhook", rawBody(), async (req, res) => {
    try {
      console.log("[line:webhook] hit", {
        strict: LINE_WEBHOOK_STRICT,
        hasSecret: !!LINE_CHANNEL_SECRET,
        hasToken: !!LINE_CHANNEL_ACCESS_TOKEN,
        hasMapsKey: !!env.GOOGLE_MAPS_API_KEY,
        geoCache: env.GEO_CACHE_COLLECTION || "geo_cache",
        region: GEO_REGION,
        lang: GEO_LANG,
      });

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

        // follow
        if (event?.type === "follow" && lineUserId && replyToken) {
          let profile = null;
          try {
            profile = await lineGetProfile(lineUserId);
          } catch (_) {}

          const appUserId = await getOrCreateAppUserIdByLine(lineUserId, profile, { eventType: "follow" });
          if (profile?.displayName) await upsertUsersDisplayName(appUserId, profile.displayName);
          if (profile) await upsertLineUserProfile(lineUserId, profile, { eventType: "follow" });

          await safeReply(replyToken, [{ type: "text", text: renderWelcomeText(profile) }]);
          continue;
        }

        // text message
        if (event?.type === "message" && event?.message?.type === "text" && replyToken) {
          const rawText = normalizeText(event.message.text);
          const cmdText = normalizeForCommand(rawText);
          const intent = intentFromCommand(cmdText);

          let profile = null;
          if (lineUserId) {
            try {
              profile = await lineGetProfile(lineUserId);
            } catch (_) {}
          }

          const appUserId = lineUserId
            ? await getOrCreateAppUserIdByLine(lineUserId, profile, { eventType: "message" })
            : null;

          if (profile) {
            await upsertLineUserProfile(lineUserId, profile, { eventType: "message" });
            if (appUserId && profile.displayName) await upsertUsersDisplayName(appUserId, profile.displayName);
          }

          // debug
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

          // --------------------
          // "わたしのほし" (natal list)
          // --------------------
          if (intent === "natal_list") {
            if (!appUserId) {
              await safeReply(replyToken, [
                { type: "text", text: "個人版はLINEの中で紐づく設計だよ🌌\nまず「はじめる」で登録してね🕊️" },
              ]);
              continue;
            }

            const snap = await db.collection("natal_cache").doc(appUserId).get();
            if (!snap.exists) {
              await safeReply(replyToken, [{ type: "text", text: "まだネイタルが準備中みたい🌌\n「はじめる」で登録してみてね🕊️" }]);
              continue;
            }

            const d = snap.data() || {};
            if (d.needs_compute) {
              await safeReply(replyToken, [{ type: "text", text: "ネイタル計算中みたい🌌\n少し後にもう一度「わたしのほし」って送ってね🕊️" }]);
              continue;
            }

            const text = renderers.renderNatalListFromCache(d) || "";
            const safeText = text.length > MAX_LINE_TEXT ? text.slice(0, MAX_LINE_TEXT) : text;

            await safeReply(replyToken, [{ type: "text", text: safeText || TEXT.FALLBACK }]);
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
                const geo = await geocodeBestEffort(placeText);

                console.log("[line] geocode", {
                  placeText,
                  ok: !!geo?.ok,
                  source: geo?.source,
                  status: geo?.status,
                  formatted: geo?.formatted,
                  reason: geo?.reason,
                  error_message: geo?.error_message,
                  candidates_len: Array.isArray(geo?.candidates) ? geo.candidates.length : null,
                });

                await saveNatalBirthPlace(appUserId, { placeText, geo });

                if (geo?.ok) {
                  await finalizeNatal(appUserId);
                  await safeReply(replyToken, [{ type: "text", text: TEXT.NATAL_DONE }]);
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
                        "これはサーバー側の設定（Maps API）っぽい🙏\n" +
                        "開発者が直すやつ。\n\n" +
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
                      text: "受け取ったよ🌌\n出生地を“地図の座標”に整えようとしてるところ。\n\n" + reasonText,
                    },
                  ]);
                }

                continue;
              }
            }
          }

          // --------------------
          // main: story commands
          // --------------------
          if (intent === "public_sky") {
            const dl = toDateLocalJST();
            const asOfISO = asOfIsoFromDateLocalJST(dl);

            // ✅ public-only を強制（natal_cache を絶対拾わない）
            const story = await storyService.buildStoryForUser({
              appUserId: "public",
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

          if (intent === "personal_today") {
            const dl = toDateLocalJST();
            const asOfISO = asOfIsoFromDateLocalJST(dl);

            if (!appUserId) {
              // LINE紐づき無いなら public を返して導線
              const story = await storyService.buildStoryForUser({
                appUserId: "public",
                dateLocal: dl,
                asOfISO,
                orbMaxDeg: ORB_MAX_DEG,
                precisionDeg: PRECISION_DEG,
              });
              const msg = renderers.renderLine(story) || "";
              const safeText = msg.length > MAX_LINE_TEXT ? msg.slice(0, MAX_LINE_TEXT) : msg;

              await safeReply(replyToken, [
                {
                  type: "text",
                  text:
                    (safeText || "") +
                    "\n\n（あなた基準の“今日”は、LINE登録があると personal で返る🌌 まず「はじめる」）",
                },
              ]);
              continue;
            }

            const story = await storyService.buildStoryForUser({
              appUserId,
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

          // unknown command
          await safeReply(replyToken, [{ type: "text", text: TEXT.FALLBACK }]);
          continue;
        }

        // other event types: no reply
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
