"use strict";

const express = require("express");
const crypto = require("crypto");
const rawBody = require("../middleware/rawBody");

/**
 * 🌌 routes/line.js — Unified STABLE (v2025.12)
 * - raw-body署名検証（/line/webhook専用）
 * - line_users(docId=line_user_id) → users(app_user_id) をトランザクションで確定
 * - follow/messageでプロフィール同期（可能な範囲で）
 * - 「今日」or 日付で storyService を呼び、renderers.renderLine を返信
 */

function createLineRouter(deps = {}) {
  const router = express.Router();

  const env = deps.env || {};
  const db = deps.db;
  const admin = deps.admin; // FieldValue.serverTimestamp()
  const storyService = deps.storyService;
  const renderers = deps.renderers;

  const LINE_CHANNEL_SECRET = env.LINE_CHANNEL_SECRET;
  const LINE_CHANNEL_ACCESS_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN;

  const LINE_WEBHOOK_STRICT = String(env.LINE_WEBHOOK_STRICT || "0") === "1";
  const DEFAULT_TZ = env.DEFAULT_TZ || "Asia/Tokyo";
  const PROJECT = env.PROJECT || "sora-no-koe";
  const SCHEMA_VERSION = env.SCHEMA_VERSION || "1.0.0";

  const MAX_LINE_TEXT = Number(env.MAX_LINE_TEXT || 4800); // LINE text message limit
  const ORB_MAX_DEG = Number(env.ORB_MAX_DEG || 6);
  const PRECISION_DEG = Number(env.PRECISION_DEG || 0.01);

  if (!db) throw new Error("deps.db is required for line router");
  if (!admin) throw new Error("deps.admin is required for line router");
  if (!storyService?.buildStoryForUser) throw new Error("deps.storyService.buildStoryForUser is missing");
  if (!renderers?.renderLine) throw new Error("deps.renderers.renderLine is missing");

  // --------------------
  // texts (copy) — latest stable
  // --------------------
  const TEXT_WELCOME =
    "追加ありがとう🌌\n\n" +
    "ここは「占い」じゃなくて、\n" +
    "今日の星の配置を“そのまま置く”場所。\n\n" +
    "まずは「今日」って送ってみて。\n" +
    "（ネイタルがあると「あなたの回路」版、無いと「空の構造」版が返るよ）\n\n" +
    "解釈は、あなたのもの。\n" +
    "星は語る。決めるのは、人。\n\n" +
    "困ったら「使い方」って送ってね。";

  const TEXT_HELP =
    "使い方🌌\n\n" +
    "1) 今日のソラのこえ\n" +
    "・「今日」\n\n" +
    "2) 日付で見る\n" +
    "・「2025-12-27」\n" +
    "・「日付 2025/12/27」\n\n" +
    "返ってくる内容\n" +
    "・主な配置（最大3本）\n" +
    "・今日の月の位置\n" +
    "・今日の余韻（1行）\n\n" +
    "※ 未来を断定しない／良い悪いを決めない設計。\n" +
    "星は“配置”を置くだけ。\n" +
    "※ 個人向けはLINE内だけで紐づく設計（他SNSと勝手に結合しない）。";

  const TEXT_FALLBACK =
    "「今日」って送ると、今日の星の配置を置くよ🌌\n" +
    "（例：今日 / 2025-12-27 / 日付 2025/12/27）";

  // --------------------
  // helpers: date / normalize
  // --------------------
  function toDateLocalJST(date = new Date()) {
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
  }

  function asOfIsoFromDateLocalJST(dateLocal) {
    // JST 正午固定 (JST 12:00 = UTC 03:00)
    return `${dateLocal}T03:00:00.000Z`;
  }

  function normalizeText(s) {
    return String(s || "").trim().replace(/\s+/g, " ");
  }

  // コマンド判定用：記号/絵文字/余計な装飾を落として強くする
  function normalizeForCommand(s) {
    const t = normalizeText(s);
    // よく来る装飾をガッと除去（増やしてOK）
    return t
      .replace(/[🌌✨⭐️💫🩷🩵💙♾️🛜👽🔥☀️🌙]+/g, "")
      .replace(/[！!？?。．,.、】【「」『』（）()\[\]{}<>]/g, "")
      .trim();
  }

  // 2025/12/7, 2025.12.07, 2025-12-07, 2025-12-7 を許容し YYYY-MM-DD に正規化
  function parseDateLocalFromText(text) {
    const t = String(text || "");
    const m = t.match(/(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{4}-\d{1,2}-\d{1,2})/);
    if (!m) return null;

    const cand = String(m[1]).trim().replace(/[\/\.]/g, "-");
    const mm = cand.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!mm) return null;

    const y = mm[1];
    const mo = String(mm[2]).padStart(2, "0");
    const d = String(mm[3]).padStart(2, "0");
    const dateLocal = `${y}-${mo}-${d}`;

    // 厳密チェック（存在しない日付を弾く）
    const dt = new Date(`${dateLocal}T00:00:00.000Z`);
    if (Number.isNaN(dt.getTime())) return null;
    if (dt.toISOString().slice(0, 10) !== dateLocal) return null;

    return dateLocal;
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
  // Firestore helpers (schema)
  // --------------------
  function lineUserDocId(lineUserId) {
    return lineUserId; // docId = line_user_id
  }

  function newAppUserId() {
    return `u_me_${crypto.randomBytes(10).toString("hex")}`;
  }

  function serverNow() {
    return admin.firestore.FieldValue.serverTimestamp();
  }

  /**
   * line_users(line_user_id) を「唯一の入口」として app_user_id を確定し、
   * users も必ず存在させる（トランザクション）
   */
  async function getOrCreateAppUserIdByLine(lineUserId, lineProfile, { eventType = "message" } = {}) {
    const lineRef = db.collection("line_users").doc(lineUserDocId(lineUserId));
    const now = serverNow();

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(lineRef);
      const existing = snap.exists ? snap.data() : null;

      const already = existing?.app_user_id || null;
      const appUserId = already || newAppUserId();
      const userRef = db.collection("users").doc(appUserId);

      // users: existence guarantee
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

      // line_users: single source of truth
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
    const now = serverNow();

    await ref.set(
      {
        updated_at: now,
        profile: {
          display_name: displayName ?? null,
          timezone: DEFAULT_TZ,
        },
      },
      { merge: true }
    );
  }

  async function logLineEvent(event) {
    try {
      // docIdが長くなりすぎないようにハッシュで固定（idempotent-ish）
      const raw = JSON.stringify({
        type: event?.type ?? null,
        ts: event?.timestamp ?? null,
        uid: event?.source?.userId ?? null,
        mid: event?.message?.id ?? null,
        replyToken: event?.replyToken ?? null,
      });

      const id = crypto.createHash("sha1").update(raw).digest("hex"); // 40 chars
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
        return res.status(200).json({ ok: true }); // 握りつぶし（LINE再送対策）
      }

      let body = {};
      try {
        body = rawBuf?.length ? JSON.parse(rawBuf.toString("utf8") || "{}") : (req.body || {});
      } catch (_) {
        console.log("[line:webhook] invalid json");
        return res.status(200).json({ ok: true });
      }

      const events = Array.isArray(body?.events) ? body.events : [];
      if (!events.length) return res.status(200).json({ ok: true });

      // 同一 webhook 内の二重 replyToken 返信を防ぐ
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

        // unfollow: no reply
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

          await safeReply(replyToken, [{ type: "text", text: TEXT_WELCOME }]);
          continue;
        }

        // message(text)
        if (event?.type === "message" && event?.message?.type === "text" && replyToken) {
          const rawText = normalizeText(event.message.text);
          const cmdText = normalizeForCommand(rawText);

          // profile sync（できたら）
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

          // commands
          if (/^(ping)$/i.test(cmdText)) {
            await safeReply(replyToken, [{ type: "text", text: "pong" }]);
            continue;
          }

          if (/^(help|使い方|へるぷ)$/i.test(cmdText)) {
            await safeReply(replyToken, [{ type: "text", text: TEXT_HELP }]);
            continue;
          }

          const dateLocal = parseDateLocalFromText(rawText);

          // 「今日」判定：揺れに強く
          const wantsToday =
            /^(今日|きょう|本日|ソラ|そら|sora)$/i.test(cmdText) ||
            /^(今日のソラ|今日のそら|今日の空)$/i.test(cmdText);

          const wants = wantsToday || !!dateLocal;

          if (wants) {
            const dl = dateLocal || toDateLocalJST();
            const asOfISO = asOfIsoFromDateLocalJST(dl);

            // 基本は必ず appUserId ができる設計（念のため fallback）
            const effectiveUserId = appUserId || "public";

            const story = await storyService.buildStoryForUser({
              appUserId: effectiveUserId,
              dateLocal: dl,
              asOfISO,
              orbMaxDeg: ORB_MAX_DEG,
              precisionDeg: PRECISION_DEG,
            });

            const msg = renderers.renderLine(story) || "";
            const safeText = msg.length > MAX_LINE_TEXT ? msg.slice(0, MAX_LINE_TEXT) : msg;

            await safeReply(replyToken, [{ type: "text", text: safeText || TEXT_FALLBACK }]);
            continue;
          }

          await safeReply(replyToken, [{ type: "text", text: TEXT_FALLBACK }]);
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
