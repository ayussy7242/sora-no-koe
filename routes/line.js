// routes/line.js — Unified STABLE OPTIMIZED (v2026.01 FINAL+FIX)
"use strict";

/**
 * ✅ Goals
 * - 返信が「空」で握りつぶされない（空はログに残してスキップ）
 * - intent判定は normalize 済み(cmd) を必ず使う（line/intent.js が唯一）
 * - follow/message 両方で profile/app_user を安全に同期
 * - strict / non-strict の挙動を明確化（署名不一致でも200返すモード維持）
 *
 * ✅ Rules
 * - コマンド判定は line/intent.js が唯一（このルータは意味判定しない）
 * - ルータは「判断しない」：各モジュールへ委譲する（ただし配線・順序はここで統一）
 * - utilities は intent の前で処理
 * - natal 収集ステートは natal.handleCollect() が担当（line_users.state 正本）
 *
 * ✅ SORA Commands
 * - "そら" / "そら全部" は public story を build → renderers で描画して返す
 * - personal と混ぜない（思想と構造を分ける）
 */

const express = require("express");
const crypto = require("crypto");
const rawBody = require("../middleware/rawBody");

// modules
const intent = require("../line/intent");
const userMod = require("../line/user");
const natalMod = require("../line/natal");
const storyMod = require("../line/story");

// -------------------- flexible import helper --------------------
function pickFactory(mod, name) {
  if (!mod) return null;
  if (typeof mod[name] === "function") return mod[name];
  if (typeof mod === "function") return mod;
  if (mod.default && typeof mod.default === "function") return mod.default;
  return null;
}

const createLineUser = pickFactory(userMod, "createLineUser");
const createLineNatal = pickFactory(natalMod, "createLineNatal");
const createLineStory = pickFactory(storyMod, "createLineStory");

// -------------------- utils --------------------
function isNonEmptyText(x) {
  const s = x == null ? "" : String(x);
  return s.trim().length > 0;
}

function toSafeText(x, maxLen = 4800) {
  const s = x == null ? "" : String(x);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function getReqId(req) {
  return (
    req?.headers?.["x-request-id"] ||
    req?.headers?.["x-cloud-trace-context"] ||
    req?.headers?.["x-amzn-trace-id"] ||
    null
  );
}

function envFlag(v, defaultOn = true) {
  if (v === undefined || v === null || v === "") return defaultOn;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on", "enable", "enabled"].includes(s);
}

function normalizeCmdLoose(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, "");
}

function pickSoraMode(text) {
  const t = normalizeCmdLoose(text);
  if (t === "そらぜんぶ" || t === "そら全部" || t === "soraall" || t === "sora_all") return "sora_all";
  if (t === "そら" || t === "sora") return "sora_top";
  return null;
}

// deps補完（inject優先）
function resolveDeps(req, initialDeps) {
  const injected = req?.app?.locals?.deps || {};
  const base = initialDeps || {};
  const merged = { ...base, ...injected };
  merged.env = { ...(base.env || {}), ...(injected.env || {}) };
  return merged;
}

function requireDeps(d) {
  if (!d?.db) throw new Error("db required");
  if (!d?.admin) throw new Error("admin required");
  if (!d?.storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser required");

  const r = d?.renderers || {};
  if (!r.renderLine) throw new Error("renderers.renderLine required");
  if (!r.renderSoraLine) throw new Error("renderers.renderSoraLine required");
  if (!r.renderSoraAllLine) throw new Error("renderers.renderSoraAllLine required");
  if (!r.renderNatalListFromcache) throw new Error("renderers.renderNatalListFromcache required");

  if (!createLineUser) throw new Error("[line] createLineUser export not found (line/user.js)");
  if (!createLineNatal) throw new Error("[line] createLineNatal export not found (line/natal.js)");
  if (!createLineStory) throw new Error("[line] createLineStory export not found (line/story.js)");
}

function buildModules(d, env) {
  // env は config として渡す（line/* が env を唯一正本として見る想定）
  const user = createLineUser({ db: d.db, admin: d.admin, config: env });
  const natal = createLineNatal({ db: d.db, admin: d.admin, geocoder: d.geocoder, renderers: d.renderers, config: env });
  const story = createLineStory({ db: d.db, storyService: d.storyService, renderers: d.renderers, natal, config: env });
  return { user, natal, story };
}

/**
 * ✅ 統一: コマンド処理パイプライン
 * - webhook / debug の両方が同じ順序で流れる
 * - 返すのは { text } を想定（各モジュールに委譲）
 */
async function processCommand({ rawText, cmd, appUserId, lineUserId, modules, renderers }) {
  const { natal, story } = modules;

  // 0) SORA (public固定)
  const soraMode = pickSoraMode(cmd);
  if (soraMode) {
    const { story: storyJson } = await story.buildSky();
    const text = storyJson
      ? (soraMode === "sora_all" ? renderers.renderSoraAllLine(storyJson) : renderers.renderSoraLine(storyJson))
      : "（そらのデータがまだなかった🙏）";
    return { text, stage: "sora", mode: soraMode };
  }

  // 1) utilities（intentより先）
  const util = await story.handleUtilities({ cmd, appUserId, lineUserId });
  if (util?.text != null) return { text: util.text, stage: "utilities" };

  // 2) natal collect（登録中ならここで吸う）
  if (lineUserId) {
    const collected = await natal.handleCollect({ lineUserId, appUserId, rawText });
    if (collected?.text != null) return { text: collected.text, stage: "collect" };
  }

  // 3) intent（唯一の判定）
  const intentKey = intent.intentFromcommand(cmd);

  if (intentKey === intent.INTENT.NATAL) {
    const r = await natal.handleNatalList({ appUserId });
    return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "natal_list" };
  }

  if (intentKey === intent.INTENT.PUBLIC_SKY) {
    const r = await story.buildSky();
    return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "public_sky" };
  }

  if (intentKey === intent.INTENT.PERSONAL_TODAY) {
    // ✅ ここが最重要：public は guide 付きに統一（debug/webhook 一致）
    if (!appUserId || appUserId === "public") {
      const r = await story.buildSkyWithGuide();
      return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "personal_today_no_user" };
    }
    const r = await story.buildToday({ appUserId });
    return { text: r?.text || story.renderFallback() || "（返す文が空だった🙏）", stage: "personal_today" };
  }

  return { text: story.renderFallback() || "コマンドがわからなかった🌌", stage: "fallback" };
}

// -------------------- router factory --------------------
function createLineRouter(deps = {}) {
  console.log("[line] router loaded (routes/line.js)");
  const router = express.Router();

  // -------------------- health --------------------
  router.get("/health", (req, res) => {
    const d = resolveDeps(req, deps);
    const env = d.env || {};
    return res.json({
      ok: true,
      line_enabled: envFlag(env.LINE_ENABLED, true),
      strict: envFlag(env.LINE_WEBHOOK_STRICT, false),
      has_secret: !!env.LINE_CHANNEL_SECRET,
      has_token: !!env.LINE_CHANNEL_ACCESS_TOKEN,
      has_debug_token: !!env.DEBUG_TOKEN,
      has_db: !!d.db,
      has_admin: !!d.admin,
      has_renderers: !!d.renderers,
      has_storyService: !!d.storyService,
      has_geocoder: !!d.geocoder,
    });
  });

  // -------------------- debug: intent --------------------
  router.get("/debug/intent", (req, res) => {
    const text = String(req.query.text || "");
    const normalized = intent.normalizeForCommand(text);
    return res.json({
      ok: true,
      text,
      normalized,
      intent: intent.intentFromcommand(normalized),
    });
  });

  function requireDebugToken(req, d) {
    const env = d.env || {};
    const DEBUG_TOKEN = env.DEBUG_TOKEN || null;
    if (!DEBUG_TOKEN) return { ok: false, status: 500, error: "DEBUG_TOKEN is not set" };
    const token = String(req.query.token || "");
    if (!token || token !== String(DEBUG_TOKEN)) return { ok: false, status: 401, error: "unauthorized" };
    return { ok: true };
  }

  // -------------------- debug: routes --------------------
  router.get("/debug/routes", (req, res) => {
    const d = resolveDeps(req, deps);
    const auth = requireDebugToken(req, d);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    return res.json({
      ok: true,
      routes: [
        "GET /line/health",
        "POST /line/webhook",
        "GET /line/debug/intent?text=...",
        "GET /line/debug/routes?token=...",
        "GET /line/debug/story?token=...&text=...&app_user_id=...",
      ],
    });
  });

  // -------------------- debug: story --------------------
  // GET /line/debug/story?token=...&text=きょう&app_user_id=public
  router.get("/debug/story", async (req, res) => {
    const d = resolveDeps(req, deps);
    const auth = requireDebugToken(req, d);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    try {
      const env = d.env || {};
      requireDeps(d);

      const { renderers } = d;
      const modules = buildModules(d, env);

      const text = String(req.query.text || "");
      const cmd = intent.normalizeForCommand(text);
      const appUserId = String(req.query.app_user_id || "public");

      const result = await processCommand({
        rawText: text,
        cmd,
        appUserId,
        lineUserId: null, // debugではLINEユーザー扱いしない（collectも動かさない）
        modules,
        renderers,
      });

      return res.json({
        ok: true,
        text,
        normalized: cmd,
        intent: intent.intentFromcommand(cmd),
        app_user_id: appUserId,
        stage: result?.stage || null,
        result: result?.text ?? "",
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // -------------------- webhook handler --------------------
  async function handleWebhook(req, res) {
    const requestId = getReqId(req);

    try {
      const d = resolveDeps(req, deps);
      const env = d.env || {};

      const LINE_ENABLED = envFlag(env.LINE_ENABLED, true);
      const LINE_CHANNEL_SECRET = env.LINE_CHANNEL_SECRET || null;
      const LINE_CHANNEL_ACCESS_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN || null;
      const LINE_WEBHOOK_STRICT = envFlag(env.LINE_WEBHOOK_STRICT, false);
      const MAX_LINE_TEXT = Number(env.MAX_LINE_TEXT || 4800);
      const DEBUG_LOG_EVENTS = String(env.LINE_DEBUG_LOG_EVENTS || "0") === "1";

      if (!LINE_ENABLED) return res.status(200).json({ ok: true, skipped: true, reason: "LINE disabled" });

      if (!LINE_CHANNEL_SECRET || !LINE_CHANNEL_ACCESS_TOKEN) {
        if (LINE_WEBHOOK_STRICT) return res.status(401).json({ ok: false, reason: "missing env" });
        return res.status(200).json({ ok: true, skipped: true, reason: "missing env" });
      }

      requireDeps(d);

      function getRawBodyBuffer(req0) {
        if (Buffer.isBuffer(req0.rawBody)) return req0.rawBody;
        if (typeof req0.rawBody === "string") return Buffer.from(req0.rawBody, "utf8");
        return null;
      }

      function verifySignature({ rawBodyBuf, signature }) {
        if (!LINE_CHANNEL_SECRET) return { ok: false, reason: "secret missing" };
        if (!signature) return { ok: false, reason: "signature missing" };
        if (!rawBodyBuf) return { ok: false, reason: "raw body missing" };

        const computed = crypto.createHmac("sha256", LINE_CHANNEL_SECRET).update(rawBodyBuf).digest("base64");

        const a = Buffer.from(computed);
        const b = Buffer.from(String(signature));

        if (a.length !== b.length) return { ok: false, reason: "length mismatch" };
        const ok = crypto.timingSafeEqual(a, b);
        return { ok, reason: ok ? "ok" : "mismatch" };
      }

      async function lineApi(path, { method = "POST", body = null } = {}) {
        if (typeof fetch !== "function") throw new Error("fetch is not available (Node18+ required)");

        const r = await fetch(`https://api.line.me${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(`LINE API error ${r.status} ${t}`);
        }

        const txt = await r.text().catch(() => "");
        try {
          return txt ? JSON.parse(txt) : null;
        } catch {
          return null;
        }
      }

      async function replyText(replyToken, text) {
        if (!replyToken) return;
        const safe = toSafeText(text, MAX_LINE_TEXT);
        if (!isNonEmptyText(safe)) return;

        await lineApi("/v2/bot/message/reply", {
          method: "POST",
          body: { replyToken, messages: [{ type: "text", text: safe }] },
        });
      }

      async function getLineProfile(lineUserId) {
        if (!lineUserId) return null;
        const r = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(lineUserId)}`, {
          headers: { Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
        });
        if (!r.ok) return null;
        return await r.json();
      }

      function safeEventText(event) {
        if (event?.message?.type !== "text") return "";
        return String(event.message.text || "");
      }

      // modules instance（注入揃える）
      const modules = buildModules(d, env);
      const { user, story } = modules;

      // signature verify
      const rawBuf = getRawBodyBuffer(req);
      const sig = req.header("x-line-signature");

      if (rawBuf) {
        const ver = verifySignature({ rawBodyBuf: rawBuf, signature: sig });
        if (!ver.ok) {
          console.log("[line:webhook] signature NG", {
            request_id: requestId,
            reason: ver.reason,
            has_raw: !!rawBuf,
            raw_len: rawBuf?.length || 0,
            has_sig: !!sig,
          });
          if (LINE_WEBHOOK_STRICT) return res.status(401).json({ ok: false, reason: ver.reason, request_id: requestId });
          return res.status(200).json({ ok: true });
        }
      } else {
        console.log("[line:webhook] raw body missing (soft)", {
          request_id: requestId,
          has_body: req.body != null,
          has_sig: !!sig,
        });
        if (LINE_WEBHOOK_STRICT) return res.status(401).json({ ok: false, reason: "raw body missing", request_id: requestId });
      }

      // parse body
      let body = null;
      try {
        body = rawBuf?.length ? JSON.parse(rawBuf.toString("utf8")) : req.body;
      } catch (e) {
        console.log("[line:webhook] body parse failed", { request_id: requestId, err: e?.message || String(e) });
        return res.status(200).json({ ok: true });
      }

      const events = Array.isArray(body?.events) ? body.events : [];

      console.log("[line:webhook] received", {
        request_id: requestId,
        events_len: events.length,
        types: events.map((e) => e?.type),
      });

      if (!events.length) return res.status(200).json({ ok: true });

      // reply guard (1 reply per replyToken)
      const replied = new Set();
      const safeReply = async (replyToken, text, meta = {}) => {
        if (!replyToken) return;
        const safe = toSafeText(text, MAX_LINE_TEXT);
        if (!isNonEmptyText(safe)) {
          console.log("[line:reply] skipped(empty)", { request_id: requestId, ...meta });
          return;
        }
        if (replied.has(replyToken)) return;
        replied.add(replyToken);

        try {
          await replyText(replyToken, safe);
          if (DEBUG_LOG_EVENTS) console.log("[line:reply] sent", { request_id: requestId, ...meta });
        } catch (e) {
          console.log("[line:reply] failed:", e?.message || String(e), { request_id: requestId, ...meta });
        }
      };

      for (const event of events) {
        try {
          const replyToken = event?.replyToken || null;
          const lineUserId = event?.source?.userId || null;

          console.log("[line:event] in", {
            request_id: requestId,
            type: event?.type,
            has_replyToken: !!replyToken,
            msg_type: event?.message?.type || null,
            text: event?.message?.text || null,
            line_user_id: lineUserId || null,
          });

          // unfollow
          if (event?.type === "unfollow") {
            if (lineUserId && user?.markInactiveLineUser) {
              await user.markInactiveLineUser(lineUserId);
              console.log("[line] marked inactive (unfollow)", { request_id: requestId, line_user_id: lineUserId });
            }
            continue;
          }

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

            await safeReply(replyToken, story.renderWelcome(profile), {
              stage: "follow",
              app_user_id: appUserId,
            });
            continue;
          }

          // message:text
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

            // reactivate（is_active=falseなら復帰）
            if (lineUserId && user?.getLineUserActive && user?.reactivateLineUser) {
              const active = await user.getLineUserActive(lineUserId);
              if (active === false) {
                await user.reactivateLineUser(lineUserId, appUserId);
                await safeReply(replyToken, story.renderWelcome(profile), {
                  stage: "reactivated_welcome",
                  cmd,
                  app_user_id: appUserId,
                });
                continue;
              }
            }

            // sync profile/display name（毎回安全に）
            if (profile && lineUserId) await user.syncLineProfile({ lineUserId, lineProfile: profile, eventType: "message" });
            if (profile?.displayName && appUserId) await user.syncUserDisplayName(appUserId, profile.displayName);

            // ✅ 統一パイプライン
            const result = await processCommand({
              rawText,
              cmd,
              appUserId,
              lineUserId,
              modules,
              renderers: d.renderers,
            });

            await safeReply(replyToken, result?.text || story.renderFallback() || "（返す文が空だった🙏）", {
              stage: result?.stage || "unknown",
              cmd,
              app_user_id: appUserId,
            });

            continue;
          }
        } catch (e) {
          console.log("[line] event error:", e?.message || String(e), { request_id: requestId });
        }
      }

      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("[line:webhook] fatal:", e?.message || String(e), { request_id: requestId });
      return res.status(200).json({ ok: true });
    }
  }

  router.post("/webhook", rawBody(), handleWebhook);
  return router;
}

module.exports = { createLineRouter };
