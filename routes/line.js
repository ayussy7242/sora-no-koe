"use strict";

const express = require("express");
const crypto = require("crypto");
const rawBody = require("../middleware/rawBody");

// --- flexible import helper (named export / default export 両対応) ---
function pickFactory(mod, name) {
  if (!mod) return null;
  if (typeof mod[name] === "function") return mod[name]; // named export
  if (typeof mod === "function") return mod; // module.exports = function
  if (mod.default && typeof mod.default === "function") return mod.default; // export default
  return null;
}

// line modules (intent は factory じゃなくて関数群を想定)
const intent = require("../line/intent");

const userMod = require("../line/user");
const natalMod = require("../line/natal");
const storyMod = require("../line/story");

const createLineUser = pickFactory(userMod, "createLineUser");
const createLineNatal = pickFactory(natalMod, "createLineNatal");
const createLineStory = pickFactory(storyMod, "createLineStory");

function createLineRouter(deps = {}) {
  const router = express.Router();

  const { db, admin, env, renderers, geocoder, storyService } = deps;

  if (!db) throw new Error("db required");
  if (!admin) throw new Error("admin required");
  if (!env) throw new Error("env required");
  if (!renderers?.renderLine) throw new Error("renderers.renderLine required");

  if (!createLineUser) throw new Error("[line] createLineUser export not found (line/user.js)");
  if (!createLineNatal) throw new Error("[line] createLineNatal export not found (line/natal.js)");
  if (!createLineStory) throw new Error("[line] createLineStory export not found (line/story.js)");

  // --------------------
  // env
  // --------------------
  const LINE_ENABLED = !!env.LINE_ENABLED;
  const LINE_CHANNEL_SECRET = env.LINE_CHANNEL_SECRET || null;
  const LINE_CHANNEL_ACCESS_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN || null;
  const LINE_WEBHOOK_STRICT = String(env.LINE_WEBHOOK_STRICT || "0") === "1";
  const MAX_LINE_TEXT = Number(env.MAX_LINE_TEXT || 4800);

  // --------------------
  // modules init
  // --------------------
  const user = createLineUser({ db, admin, env });
  const natal = createLineNatal({ db, admin, geocoder, renderers, config: env });
  const story = createLineStory({ storyService, renderers, config: env });

  // --------------------
  // helpers
  // --------------------
  function getRawBodyBuffer(req) {
    if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
    if (typeof req.rawBody === "string") return Buffer.from(req.rawBody, "utf8");
    return null;
  }

  function verifySignature({ rawBodyBuf, signature }) {
    if (!LINE_CHANNEL_SECRET) return { ok: false, reason: "secret missing" };
    if (!signature) return { ok: false, reason: "signature missing" };
    if (!rawBodyBuf) return { ok: false, reason: "raw body missing" };

    const computed = crypto
      .createHmac("sha256", LINE_CHANNEL_SECRET)
      .update(rawBodyBuf)
      .digest("base64");

    const a = Buffer.from(computed);
    const b = Buffer.from(signature);

    if (a.length !== b.length) return { ok: false, reason: "length mismatch" };
    const ok = crypto.timingSafeEqual(a, b);
    return { ok, reason: ok ? "ok" : "mismatch" };
  }

  async function lineApi(path, body) {
    if (!LINE_CHANNEL_ACCESS_TOKEN) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");

    const res = await fetch(`https://api.line.me${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`LINE API error ${res.status} ${t}`);
    }
  }

  async function reply(replyToken, text) {
    if (!replyToken) return;
    if (!text) return;

    const safeText = String(text).length > MAX_LINE_TEXT ? String(text).slice(0, MAX_LINE_TEXT) : String(text);

    await lineApi("/v2/bot/message/reply", {
      replyToken,
      messages: [{ type: "text", text: safeText }],
    });
  }

  async function getLineProfile(lineUserId) {
    if (!LINE_CHANNEL_ACCESS_TOKEN) return null;

    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  }

  function safeEventText(event) {
    if (event?.message?.type !== "text") return "";
    return String(event.message.text || "");
  }

  // --------------------
  // health
  // --------------------
  router.get("/health", (_req, res) => {
    return res.json({
      ok: true,
      line_enabled: LINE_ENABLED,
      strict: LINE_WEBHOOK_STRICT,
    });
  });

  // --------------------
  // webhook
  // --------------------
  router.post("/webhook", rawBody(), async (req, res) => {
    // LINE無効なら即OK返し（Cloud Runで他機能を動かしたい時用）
    if (!LINE_ENABLED || !LINE_CHANNEL_SECRET || !LINE_CHANNEL_ACCESS_TOKEN) {
      return res.status(200).json({ ok: true, skipped: true, reason: "LINE disabled or missing env" });
    }

    const rawBuf = getRawBodyBuffer(req);
    const sig = req.header("x-line-signature");

    const ver = verifySignature({ rawBodyBuf: rawBuf, signature: sig });

    if (!ver.ok) {
      if (LINE_WEBHOOK_STRICT) return res.status(401).json({ ok: false });
      return res.status(200).json({ ok: true });
    }

    let body;
    try {
      body = JSON.parse(rawBuf.toString("utf8"));
    } catch {
      return res.status(200).json({ ok: true });
    }

    const events = Array.isArray(body?.events) ? body.events : [];
    if (!events.length) return res.status(200).json({ ok: true });

    for (const event of events) {
      try {
        const replyToken = event.replyToken || null;
        const lineUserId = event?.source?.userId || null;

        // follow
        if (event.type === "follow" && lineUserId) {
          const profile = await getLineProfile(lineUserId);

          const out = await user.getOrCreateAppUserId({
            lineUserId,
            profile,
          });

          const appUserId = out?.appUserId || out; // 実装ゆれ吸収
          if (profile?.displayName && appUserId && user.syncUserDisplayName) {
            await user.syncUserDisplayName(appUserId, profile.displayName);
          }

          // welcome は story 側に寄せる（無いなら固定文）
          let welcome = null;
          if (story.renderWelcome) welcome = story.renderWelcome(profile);
          if (!welcome) {
            welcome =
              "ソラのこえ。｜今日の星を置く🌌\n" +
              "まずは「はじめる」って送ってね🕊️";
          }
          await reply(replyToken, welcome);
          continue;
        }

        // message(text)
        if (event.type === "message" && event.message?.type === "text") {
          const rawText = safeEventText(event);
          const intentKey = intent.intentFromCommand(rawText);

          const profile = lineUserId ? await getLineProfile(lineUserId) : null;

          const out = lineUserId
            ? await user.getOrCreateAppUserId({
                lineUserId,
                profile,
              })
            : null;

          const appUserId = out?.appUserId || out || null;

          if (profile?.displayName && appUserId && user.syncUserDisplayName) {
            await user.syncUserDisplayName(appUserId, profile.displayName);
          }

          // natal (登録/計算/表示) 優先
          if (intentKey === intent.INTENT?.NATAL || intentKey === "natal_list") {
            const r = await natal.handleNatalList({ appUserId });
            if (r?.text) {
              await reply(replyToken, r.text);
              continue;
            }
          }

          // story
          if (intentKey === intent.INTENT?.PUBLIC_SKY || intentKey === "public_sky") {
            const r = await story.buildPublicSky();
            await reply(replyToken, r?.text || "");
            continue;
          }

          if (intentKey === intent.INTENT?.PERSONAL_TODAY || intentKey === "personal_today") {
            if (!appUserId) {
              const r = await story.buildPublicWithGuide();
              await reply(replyToken, r?.text || "");
              continue;
            }
            const r = await story.buildPersonalToday({ appUserId });
            await reply(replyToken, r?.text || "");
            continue;
          }

          // fallback
          const fallback = story.renderFallback
            ? story.renderFallback()
            : "コマンドは「今日」「そら」「わたしのほし」🌌";
          await reply(replyToken, fallback);
        }
      } catch (e) {
        console.log("[line] event error:", e?.message || String(e));
      }
    }

    return res.status(200).json({ ok: true });
  });

  // debug intent
  router.get("/debug/intent", (req, res) => {
    const text = String(req.query.text || "");
    return res.json({
      ok: true,
      text,
      normalized: intent.normalizeForCommand ? intent.normalizeForCommand(text) : null,
      intent: intent.intentFromCommand ? intent.intentFromCommand(text) : null,
    });
  });

  return router;
}

module.exports = { createLineRouter };
