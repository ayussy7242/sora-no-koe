"use strict";

const express = require("express");
const crypto = require("crypto");

const rawBody = require("../middleware/rawBody");

function createLineRouter(deps = {}) {
  const router = express.Router();

  const env = deps.env || {};
  const db = deps.db;
  const admin = deps.admin; // ★ serverTimestamp使う
  const storyService = deps.storyService;
  const renderers = deps.renderers;

  const LINE_CHANNEL_SECRET = env.LINE_CHANNEL_SECRET;
  const LINE_CHANNEL_ACCESS_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN;

  const LINE_WEBHOOK_STRICT = String(env.LINE_WEBHOOK_STRICT || "0") === "1";
  const DEFAULT_TZ = env.DEFAULT_TZ || "Asia/Tokyo";
  const PROJECT = env.PROJECT || "sora-no-koe";
  const SCHEMA_VERSION = env.SCHEMA_VERSION || "1.0.0";

  if (!db) throw new Error("deps.db is required for line router");
  if (!admin) throw new Error("deps.admin is required for line router");
  if (!storyService?.buildStoryForUser) throw new Error("deps.storyService.buildStoryForUser is missing");
  if (!renderers?.renderLine) throw new Error("deps.renderers.renderLine is missing");

  // --------------------
  // helpers: date
  // --------------------
  function toDateLocalJST(date = new Date()) {
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
  }

  function asOfIsoFromDateLocalJST(dateLocal) {
    // JST 正午固定 (JST 12:00 = UTC 03:00)
    return `${dateLocal}T03:00:00.000Z`;
  }

  function isYYYYMMDD(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  }

  function isValidDateLocal(dateLocal) {
    if (!isYYYYMMDD(dateLocal)) return false;
    const d = new Date(`${dateLocal}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return false;
    return d.toISOString().slice(0, 10) === dateLocal;
  }

  function normalizeText(s) {
    return String(s || "").trim().replace(/\s+/g, " ");
  }

  // 2025/12/27 や 2025.12.27 も許容
  function normalizeDateCandidate(s) {
    const raw = String(s || "").trim();
    if (!raw) return null;
    return raw.replace(/[\/\.]/g, "-");
  }

  function parseDateLocalFromText(text) {
    const t = String(text || "");
    const m = t.match(/(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{4}-\d{2}-\d{2})/);
    if (!m) return null;

    const cand = normalizeDateCandidate(m[1]);
    if (!cand) return null;

    const mm = cand.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!mm) return null;

    const y = mm[1];
    const mo = String(mm[2]).padStart(2, "0");
    const d = String(mm[3]).padStart(2, "0");
    const dateLocal = `${y}-${mo}-${d}`;

    return isValidDateLocal(dateLocal) ? dateLocal : null;
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

    const url = `https://api.line.me${path}`;
    const headers = { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` };
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

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
    return lineApi("/v2/bot/message/reply", {
      method: "POST",
      body: { replyToken, messages },
    });
  }

  async function lineGetProfile(lineUserId) {
    return lineApi(`/v2/bot/profile/${encodeURIComponent(lineUserId)}`, { method: "GET" });
  }

  // --------------------
  // Firestore helpers (NEW SCHEMA)
  // --------------------
  function lineUserDocId(lineUserId) {
    return lineUserId; // docId is line_user_id
  }

  function newAppUserId() {
    // あゆっさいの既存方針：u_me_ でOK
    return `u_me_${crypto.randomBytes(10).toString("hex")}`;
  }

  async function getOrCreateAppUserIdByLine(lineUserId, lineProfile, { eventType = "message" } = {}) {
    const lineRef = db.collection("line_users").doc(lineUserDocId(lineUserId));
    const snap = await lineRef.get();

    // 既に紐付いてるならそれを正とする
    if (snap.exists) {
      const appUserId = snap.data()?.app_user_id || null;
      if (appUserId) return appUserId;
    }

    // 無ければ users 作って紐付ける
    const appUserId = newAppUserId();
    const userRef = db.collection("users").doc(appUserId);

    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.runTransaction(async (tx) => {
      tx.set(
        userRef,
        {
          status: "active",
          profile: {
            display_name: lineProfile?.displayName ?? null,
            timezone: DEFAULT_TZ,
          },
          channels: {
            line: {
              line_user_id: lineUserId,
              linked_at: now,
            },
            email: null,
          },
          created_at: now,
          updated_at: now,
        },
        { merge: true }
      );

      tx.set(
        lineRef,
        {
          line_user_id: lineUserId,
          app_user_id: appUserId,
          created_at: now,
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
          consent: {
            profile: true,          // LINE profile取得できた前提
            personal_data: false,   // 初期はfalse（同意フロー作るならここを段階更新）
            public_share: false,
            version: 1,
            agreed_at: null,
          },
          status: "new",
        },
        { merge: true }
      );
    });

    return appUserId;
  }

  async function upsertLineUserProfile(lineUserId, lineProfile, { eventType = "message" } = {}) {
    const ref = db.collection("line_users").doc(lineUserDocId(lineUserId));
    const now = admin.firestore.FieldValue.serverTimestamp();

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
        consent: {
          profile: true,
        },
      },
      { merge: true }
    );
  }

  async function upsertUsersDisplayName(appUserId, displayName) {
    if (!appUserId) return;
    const ref = db.collection("users").doc(appUserId);
    const now = admin.firestore.FieldValue.serverTimestamp();

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
      const uid = event?.source?.userId || "unknown";
      const ts = event?.timestamp || Date.now();
      const type = event?.type || "unknown";
      const rt = event?.replyToken || "no-reply";
      const id = `${uid}-${ts}-${type}-${rt}`.slice(0, 140);

      await db.collection("line_events").doc(id).set(
        {
          type: event?.type ?? null,
          timestamp: event?.timestamp ?? null,
          source: event?.source ?? null,
          message: event?.message ?? null,
          postback: event?.postback ?? null,
          created_at: new Date().toISOString(),
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
        return res.status(200).json({ ok: true }); // 握りつぶし
      }

      let body = {};
      try {
        body = rawBuf?.length ? JSON.parse(rawBuf.toString("utf8") || "{}") : (req.body || {});
      } catch (e) {
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
          await lineReply(token, messages);
        };

        // unfollow
        if (event?.type === "unfollow") continue;

        // follow
        if (event?.type === "follow" && lineUserId && replyToken) {
          let profile = null;
          try { profile = await lineGetProfile(lineUserId); } catch (_) {}

          const appUserId = await getOrCreateAppUserIdByLine(lineUserId, profile, { eventType: "follow" });
          if (profile?.displayName) await upsertUsersDisplayName(appUserId, profile.displayName);
          if (profile) await upsertLineUserProfile(lineUserId, profile, { eventType: "follow" });

          await safeReply(replyToken, [{
            type: "text",
            text:
              "追加ありがとう🌌\n\n「ソラのこえ。」は占いじゃなくて、\n今日の星の配置を“置く”だけ。\n\n試しに「今日」って送ってみて。",
          }]);
          continue;
        }

        // text message
        if (event?.type === "message" && event?.message?.type === "text" && replyToken) {
          const text = normalizeText(event.message.text);

          // profile sync（できたら同期）
          let profile = null;
          if (lineUserId) {
            try { profile = await lineGetProfile(lineUserId); } catch (_) {}
          }

          // app_user_id を確定（line_users.app_user_id が正）
          const appUserId = lineUserId
            ? await getOrCreateAppUserIdByLine(lineUserId, profile, { eventType: "message" })
            : null;

          if (profile) {
            await upsertLineUserProfile(lineUserId, profile, { eventType: "message" });
            if (appUserId && profile.displayName) await upsertUsersDisplayName(appUserId, profile.displayName);
          }

          // commands
          if (/^(ping)$/i.test(text)) {
            await safeReply(replyToken, [{ type: "text", text: "pong" }]);
            continue;
          }

          if (/^(help|使い方|へるぷ)$/i.test(text)) {
            await safeReply(replyToken, [{
              type: "text",
              text:
                "使い方🌌\n\n・「今日」→ 今日のソラのこえ。\n・「日付 2025-12-27」→ 指定日\n\n※ 解釈はあなたのもの。",
            }]);
            continue;
          }

          const dateLocal = parseDateLocalFromText(text);
          const wants =
            /^(今日|きょう|ソラ|そら|sora)$/i.test(text) ||
            !!dateLocal;

          if (wants) {
            const dl = dateLocal || toDateLocalJST();
            const asOfISO = asOfIsoFromDateLocalJST(dl);

            // appUserId 無いなら public 扱いに落とす（基本は発生しない想定）
            const effectiveUserId = appUserId || "public";

            const story = await storyService.buildStoryForUser({
              appUserId: effectiveUserId,
              dateLocal: dl,
              asOfISO,
              orbMaxDeg: 6,
              precisionDeg: 0.01,
            });

            const msg = renderers.renderLine(story);
            const safeText = msg.length > 4800 ? msg.slice(0, 4800) : msg;

            await safeReply(replyToken, [{ type: "text", text: safeText }]);
            continue;
          }

          await safeReply(replyToken, [{
            type: "text",
            text: "「今日」って送ると、今日の星の配置を置くよ🌌",
          }]);
          continue;
        }
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
