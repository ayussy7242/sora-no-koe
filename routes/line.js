"use strict";

/**
 * routes/line.js — Unified STABLE (Optimized)
 *
 * ✅ ルール
 * - コマンド判定は line/intent.js が唯一
 * - ルータは「判断しない」：各モジュールへ委譲する
 * - ユーティリティ（help/start/reset/cancel/ping/test）は intent の前で処理
 * - natal 収集ステート（birth_date→birth_time→birth_place）は natal.handleCollect() が担当
 */

const express = require("express");
const crypto = require("crypto");
const rawBody = require("../middleware/rawBody");

// --- flexible import helper (named export / default export 両対応) ---
function pickFactory(mod, name) {
  if (!mod) return null;
  if (typeof mod[name] === "function") return mod[name];
  if (typeof mod === "function") return mod;
  if (mod.default && typeof mod.default === "function") return mod.default;
  return null;
}

// modules
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
  if (!env) throw new Error("env required");

  // --------------------
  // env
  // --------------------
  const LINE_ENABLED = String(env.LINE_ENABLED ?? "1") === "1";
  const LINE_CHANNEL_SECRET = env.LINE_CHANNEL_SECRET || null;
  const LINE_CHANNEL_ACCESS_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN || null;
  const LINE_WEBHOOK_STRICT = String(env.LINE_WEBHOOK_STRICT || "0") === "1";
  const MAX_LINE_TEXT = Number(env.MAX_LINE_TEXT || 4800);

  // --------------------
  // helpers (raw/signature)
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
    const b = Buffer.from(String(signature));

    if (a.length !== b.length) return { ok: false, reason: "length mismatch" };
    const ok = crypto.timingSafeEqual(a, b);
    return { ok, reason: ok ? "ok" : "mismatch" };
  }

  // --------------------
  // LINE API
  // --------------------
  async function lineApi(path, { method = "POST", body = null } = {}) {
    if (typeof fetch !== "function") {
      throw new Error("fetch is not available (Node18+ required)");
    }
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");
    }

    const res = await fetch(`https://api.line.me${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`LINE API error ${res.status} ${t}`);
    }

    // reply API は body 無いこともある
    const txt = await res.text().catch(() => "");
    try {
      return txt ? JSON.parse(txt) : null;
    } catch {
      return null;
    }
  }

  async function replyText(replyToken, text) {
    if (!replyToken) return;
    if (!text) return;

    const safeText =
      String(text).length > MAX_LINE_TEXT ? String(text).slice(0, MAX_LINE_TEXT) : String(text);

    await lineApi("/v2/bot/message/reply", {
      method: "POST",
      body: {
        replyToken,
        messages: [{ type: "text", text: safeText }],
      },
    });
  }

  async function getLineProfile(lineUserId) {
    if (!lineUserId) return null;
    if (!LINE_CHANNEL_ACCESS_TOKEN) return null;
    if (typeof fetch !== "function") return null;

    const res = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
      headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
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
      has_secret: !!LINE_CHANNEL_SECRET,
      has_token: !!LINE_CHANNEL_ACCESS_TOKEN,
    });
  });

  // --------------------
  // debug intent
  // --------------------
  router.get("/debug/intent", (req, res) => {
    const text = String(req.query.text || "");
    return res.json({
      ok: true,
      text,
      normalized: intent.normalizeForCommand(text),
      intent: intent.intentFromCommand(text),
    });
  });

  // --------------------
// debug natal_list (LINE無効でも叩ける)
// GET /line/debug/natal_list?app_user_id=...&token=...
// --------------------
router.get("/debug/natal_list", async (req, res) => {
  try {
    const token = String(req.query.token || "");
    const appUserId = String(req.query.app_user_id || "");

    if (!env.DEBUG_TOKEN) {
      return res.status(500).json({ ok: false, error: "DEBUG_TOKEN is not set", path: "/line/debug/natal_list" });
    }
    if (!token || token !== String(env.DEBUG_TOKEN)) {
      return res.status(401).json({ ok: false, error: "unauthorized", path: "/line/debug/natal_list" });
    }
    if (!appUserId) {
      return res.status(400).json({ ok: false, error: "app_user_id required", path: "/line/debug/natal_list" });
    }

    // LINE無効でも deps が揃ってればここで作れる
    if (!db) throw new Error("db required");
    if (!admin) throw new Error("admin required");
    if (!renderers?.renderNatalListFromCache) throw new Error("renderers.renderNatalListFromCache required");
    if (!createLineNatal) throw new Error("[line] createLineNatal export not found (line/natal.js)");

    const natal = createLineNatal({ db, admin, geocoder, renderers, config: env });
    const out = await natal.handleNatalList({ appUserId });

    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/line/debug/natal_list" });
  }
});


  // --------------------
  // webhook
  // --------------------
  router.post("/webhook", rawBody(), async (req, res) => {
    try {
      // LINE無効なら即OK
      if (!LINE_ENABLED) {
        return res.status(200).json({ ok: true, skipped: true, reason: "LINE disabled" });
      }

      // 必須envチェック
      if (!LINE_CHANNEL_SECRET || !LINE_CHANNEL_ACCESS_TOKEN) {
        if (LINE_WEBHOOK_STRICT) return res.status(401).json({ ok: false, reason: "missing env" });
        return res.status(200).json({ ok: true, skipped: true, reason: "missing env" });
      }

      // 必須depsチェック（LINEが有効なときのみ）
      if (!db) throw new Error("db required");
      if (!admin) throw new Error("admin required");
      if (!renderers?.renderLine) throw new Error("renderers.renderLine required");
      if (!renderers?.renderNatalListFromCache) {
        throw new Error("renderers.renderNatalListFromCache required");
      }
      if (!createLineUser) throw new Error("[line] createLineUser export not found (line/user.js)");
      if (!createLineNatal) throw new Error("[line] createLineNatal export not found (line/natal.js)");
      if (!createLineStory) throw new Error("[line] createLineStory export not found (line/story.js)");
      if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser required");

      const user = createLineUser({ db, admin, config: env });
      const natal = createLineNatal({ db, admin, geocoder, renderers, config: env });
      const story = createLineStory({ storyService, renderers, config: env });

      // signature verify
      const rawBuf = getRawBodyBuffer(req);
      const sig = req.header("x-line-signature");
      const ver = verifySignature({ rawBodyBuf: rawBuf, signature: sig });

      if (!ver.ok) {
        if (LINE_WEBHOOK_STRICT) return res.status(401).json({ ok: false, reason: ver.reason });
        return res.status(200).json({ ok: true });
      }

      // parse body
      let body = null;
      try {
        body = rawBuf?.length ? JSON.parse(rawBuf.toString("utf8")) : req.body;
      } catch {
        return res.status(200).json({ ok: true });
      }

      const events = Array.isArray(body?.events) ? body.events : [];
      if (!events.length) return res.status(200).json({ ok: true });

      // 同一replyToken多重返信防止
      const replied = new Set();
      const safeReply = async (replyToken, text) => {
        if (!replyToken) return;
        if (replied.has(replyToken)) return;
        replied.add(replyToken);
        try {
          await replyText(replyToken, text);
        } catch (e) {
          console.log("[line:reply] failed:", e?.message || String(e));
        }
      };

      for (const event of events) {
        try {
          const replyToken = event?.replyToken || null;
          const lineUserId = event?.source?.userId || null;

          if (event?.type === "unfollow") continue;

          // follow
          if (event?.type === "follow" && lineUserId) {
            const profile = await getLineProfile(lineUserId);
            const appUserId = await user.getOrCreateAppUserId({
              lineUserId,
              lineProfile: profile,
              eventType: "follow",
            });
            if (profile?.displayName) await user.syncUserDisplayName(appUserId, profile.displayName);
            if (profile) await user.syncLineProfile({ lineUserId, lineProfile: profile, eventType: "follow" });

            await safeReply(replyToken, story.renderWelcome(profile));
            continue;
          }

          // message(text)
          if (event?.type === "message" && event?.message?.type === "text") {
            const rawText = safeEventText(event);
            const cmd = intent.normalizeForCommand(rawText);

            const profile = lineUserId ? await getLineProfile(lineUserId) : null;
            const appUserId = lineUserId
              ? await user.getOrCreateAppUserId({
                  lineUserId,
                  lineProfile: profile,
                  eventType: "message",
                })
              : null;

            // profile sync（軽量）
            if (profile && lineUserId) {
              await user.syncLineProfile({ lineUserId, lineProfile: profile, eventType: "message" });
            }
            if (profile?.displayName && appUserId) {
              await user.syncUserDisplayName(appUserId, profile.displayName);
            }

            // ----------------------------
            // 0) utilities layer (intent より先)
            // ----------------------------
            const util = await story.handleUtilities({
              cmd,
              appUserId,
              natal,
            });
            if (util?.text) {
              await safeReply(replyToken, util.text);
              continue;
            }

            // ----------------------------
            // 1) natal collecting (stage進行) — intentより優先
            // ----------------------------
            const collected = await natal.handleCollect({
              appUserId,
              rawText,
              cmd,
            });
            if (collected?.text) {
              await safeReply(replyToken, collected.text);
              continue;
            }

            // ----------------------------
            // 2) command intent
            // ----------------------------
            const intentKey = intent.intentFromCommand(rawText);

            // natal list
            if (intentKey === intent.INTENT.NATAL) {
              const r = await natal.handleNatalList({ appUserId });
              await safeReply(replyToken, r?.text || story.renderFallback());
              continue;
            }

            // public sky
            if (intentKey === intent.INTENT.PUBLIC_SKY) {
              const r = await story.buildPublicSky();
              await safeReply(replyToken, r?.text || story.renderFallback());
              continue;
            }

            // personal today
            if (intentKey === intent.INTENT.PERSONAL_TODAY) {
              if (!appUserId) {
                const r = await story.buildPublicWithGuide();
                await safeReply(replyToken, r?.text || story.renderFallback());
                continue;
              }
              const r = await story.buildPersonalToday({ appUserId });
              await safeReply(replyToken, r?.text || story.renderFallback());
              continue;
            }

            // fallback
            await safeReply(replyToken, story.renderFallback());
          }
        } catch (e) {
          console.log("[line] event error:", e?.message || String(e));
        }
      }

      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("[line:webhook] fatal:", e?.message || String(e));
      // LINEは 200 を返すのが安定
      return res.status(200).json({ ok: true });
    }
  });

  return router;
}

module.exports = { createLineRouter };
