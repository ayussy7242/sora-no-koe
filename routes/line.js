"use strict";

/**
 * routes/line.js — Unified STABLE (v2025.12+ FINAL)
 *
 * ✅ Goals
 * - 返信が「空」で握りつぶされない（無反応バグ潰し）
 * - intent判定は normalize 済み(cmd) を必ず使う
 * - follow/message 両方で profile/app_user を安全に同期
 * - strict / non-strict の挙動を明確化（署名不一致でも200返すモード維持）
 * - 将来拡張：handler単体export / debugルート / utilレイヤ / モジュール差し替え耐性
 *
 * ✅ Rules (あなたの思想を維持)
 * - コマンド判定は line/intent.js が唯一
 * - ルータは「判断しない」：各モジュールへ委譲する
 * - ユーティリティ（help/start/reset/cancel/ping/test）は intent の前で処理
 * - natal 収集ステート（birth_date→birth_time→birth_place）は natal.handleCollect() が担当
 */

const express = require("express");
const crypto = require("crypto");
const rawBody = require("../middleware/rawBody");

// --------------------
// flexible import helper (named export / default export 両対応)
// --------------------
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

// --------------------
// small utils
// --------------------
function isNonEmptyText(x) {
    const s = x == null ? "" : String(x);
    return s.trim().length > 0;
}

function toSafeText(x, maxLen = 4800) {
    const s = x == null ? "" : String(x);
    const t = s.length > maxLen ? s.slice(0, maxLen) : s;
    return t;
}

function getReqId(req) {
    return (
        req?.headers?.["x-request-id"] ||
        req?.headers?.["x-cloud-trace-context"] ||
        req?.headers?.["x-amzn-trace-id"] ||
        null
    );
}

// --------------------
// factory
// --------------------
function createLineRouter(deps = {}) {
    const router = express.Router();

    const { db, admin, env, renderers, geocoder, storyService } = deps;
    if (!env) throw new Error("env required");

    // --------------------
    // env
    // --------------------
    function envFlag(v, defaultOn = true) {
        if (v === undefined || v === null || v === "") return defaultOn;
        const s = String(v).trim().toLowerCase();
        return ["1", "true", "yes", "y", "on", "enable", "enabled"].includes(s);
    }

    // --------------------
    // env
    // --------------------
    const LINE_ENABLED = envFlag(env.LINE_ENABLED, true);
    const LINE_CHANNEL_SECRET = env.LINE_CHANNEL_SECRET || null;
    const LINE_CHANNEL_ACCESS_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN || null;
    const LINE_WEBHOOK_STRICT = envFlag(env.LINE_WEBHOOK_STRICT, false);
    const MAX_LINE_TEXT = Number(env.MAX_LINE_TEXT || 4800);

    const DEBUG_TOKEN = env.DEBUG_TOKEN || null;
    const DEBUG_LOG_EVENTS = String(env.LINE_DEBUG_LOG_EVENTS || "0") === "1"; // optional

    // --------------------
    // deps validators
    // --------------------
    function requireDepsForWebhook() {
        // LINEが有効なときのみ必須
        if (!db) throw new Error("db required");
        if (!admin) throw new Error("admin required");
        if (!renderers?.renderLine) throw new Error("renderers.renderLine required");
        if (!renderers?.renderNatalListFromCache) throw new Error("renderers.renderNatalListFromCache required");
        if (!createLineUser) throw new Error("[line] createLineUser export not found (line/user.js)");
        if (!createLineNatal) throw new Error("[line] createLineNatal export not found (line/natal.js)");
        if (!createLineStory) throw new Error("[line] createLineStory export not found (line/story.js)");
        if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser required");
    }

    function requireDebugAuth(req, path) {
        if (!DEBUG_TOKEN) return { ok: false, status: 500, error: "DEBUG_TOKEN is not set", path };
        const token = String(req.query.token || "");
        if (!token || token !== String(DEBUG_TOKEN)) return { ok: false, status: 401, error: "unauthorized", path };
        return { ok: true };
    }

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
        if (typeof fetch !== "function") throw new Error("fetch is not available (Node18+ required)");
        if (!LINE_CHANNEL_ACCESS_TOKEN) throw new Error("LINE_CHANNEL_ACCESS_TOKEN missing");

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

        const safe = toSafeText(text, MAX_LINE_TEXT);
        if (!isNonEmptyText(safe)) return;

        await lineApi("/v2/bot/message/reply", {
            method: "POST",
            body: {
                replyToken,
                messages: [{ type: "text", text: safe }],
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
            has_debug_token: !!DEBUG_TOKEN,
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
            intent: intent.intentFromCommand(intent.normalizeForCommand(text)),
        });
    });

    // --------------------
    // debug routes list (for sanity)
    // GET /line/debug/routes?token=...
    // --------------------
    router.get("/debug/routes", (req, res) => {
        const auth = requireDebugAuth(req, "/line/debug/routes");
        if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error, path: auth.path });

        // Expressはルート一覧を公式に提供しないので「このファイルが持つ主要パス」を返す
        return res.json({
            ok: true,
            routes: [
                "GET /line/health",
                "POST /line/webhook",
                "GET /line/debug/intent?text=...",
                "GET /line/debug/natal_list?app_user_id=...&token=...",
                "GET /line/debug/routes?token=...",
            ],
        });
    });

    // --------------------
    // debug natal_list (LINE無効でも叩ける)
    // GET /line/debug/natal_list?app_user_id=...&token=...
    // --------------------
    router.get("/debug/natal_list", async (req, res) => {
        try {
            const auth = requireDebugAuth(req, "/line/debug/natal_list");
            if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error, path: auth.path });

            const appUserId = String(req.query.app_user_id || "");
            if (!appUserId) return res.status(400).json({ ok: false, error: "app_user_id required", path: "/line/debug/natal_list" });

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
    // core webhook handler (extracted for reuse)
    // --------------------
    async function handleWebhook(req, res) {
        const requestId = getReqId(req);

        try {
            // LINE無効なら即OK（Cloud Run health 兼）
            if (!LINE_ENABLED) return res.status(200).json({ ok: true, skipped: true, reason: "LINE disabled" });

            // 必須envチェック
            if (!LINE_CHANNEL_SECRET || !LINE_CHANNEL_ACCESS_TOKEN) {
                if (LINE_WEBHOOK_STRICT) return res.status(401).json({ ok: false, reason: "missing env" });
                return res.status(200).json({ ok: true, skipped: true, reason: "missing env" });
            }

            // 必須depsチェック（LINE有効時のみ）
            requireDepsForWebhook();

            const user = createLineUser({ db, admin, config: env });
            const natal = createLineNatal({ db, admin, geocoder, renderers, config: env });
            const story = createLineStory({ storyService, renderers, config: env });

            // signature verify
            const rawBuf = getRawBodyBuffer(req);
            const sig = req.header("x-line-signature");
            const ver = verifySignature({ rawBodyBuf: rawBuf, signature: sig });

            if (!ver.ok) {
                console.log("[line:webhook] signature NG", {
                    request_id: requestId,
                    reason: ver.reason,
                    has_raw: !!rawBuf,
                    raw_len: rawBuf?.length || 0,
                    has_sig: !!sig,
                });
                // strictなら拒否、non-strictなら200（LINE再送暴発抑制）
                if (LINE_WEBHOOK_STRICT) return res.status(401).json({ ok: false, reason: ver.reason, request_id: requestId });
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

            // 同一replyToken多重返信防止 + 返信空文字の握りつぶし可視化
            const replied = new Set();
            const safeReply = async (replyToken, text, meta = {}) => {
                if (!replyToken) return;

                const safe = toSafeText(text, MAX_LINE_TEXT);
                if (!isNonEmptyText(safe)) {
                    // ここが “無反応の犯人” になりがちなので必ずログ
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

                    if (DEBUG_LOG_EVENTS) {
                        console.log("[line:event]", {
                            request_id: requestId,
                            type: event?.type,
                            has_replyToken: !!replyToken,
                            msg_type: event?.message?.type || null,
                            text: event?.message?.text || null,
                            line_user_id: lineUserId || null,
                        });
                    }

                    // unfollow は返信できないのでスキップ
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

                        await safeReply(replyToken, story.renderWelcome(profile), { stage: "follow", app_user_id: appUserId });
                        continue;
                    }

                    // message(text)
                    if (event?.type === "message" && event?.message?.type === "text") {
                        const rawText = safeEventText(event);
                        const cmd = intent.normalizeForCommand(rawText); // ← 正規化したcmdが以後の基準

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
                        const util = await story.handleUtilities({ cmd, appUserId, natal });
                        if (util?.text != null) {
                            await safeReply(replyToken, util.text, { stage: "utilities", cmd, app_user_id: appUserId });
                            continue;
                        }

                        // ----------------------------
                        // 1) natal collecting (stage進行) — intentより優先
                        // ----------------------------
                        const collected = await natal.handleCollect({ appUserId, rawText, cmd });
                        if (collected?.text != null) {
                            await safeReply(replyToken, collected.text, { stage: "collect", cmd, app_user_id: appUserId });
                            continue;
                        }

                        // ----------------------------
                        // 2) command intent (normalize済み cmd を必ず使う)
                        // ----------------------------
                        const intentKey = intent.intentFromCommand(cmd);

                        // natal list
                        if (intentKey === intent.INTENT.NATAL) {
                            const r = await natal.handleNatalList({ appUserId });
                            await safeReply(replyToken, r?.text || story.renderFallback() || "（返す文が空だった🙏）", {
                                stage: "natal_list",
                                cmd,
                                app_user_id: appUserId,
                            });
                            continue;
                        }

                        // public sky
                        if (intentKey === intent.INTENT.PUBLIC_SKY) {
                            const r = await story.buildPublicSky();
                            await safeReply(replyToken, r?.text || story.renderFallback() || "（返す文が空だった🙏）", {
                                stage: "public_sky",
                                cmd,
                                app_user_id: appUserId,
                            });
                            continue;
                        }

                        // personal today
                        if (intentKey === intent.INTENT.PERSONAL_TODAY) {
                            if (!appUserId) {
                                const r = await story.buildPublicWithGuide();
                                await safeReply(replyToken, r?.text || story.renderFallback() || "（返す文が空だった🙏）", {
                                    stage: "personal_today_no_user",
                                    cmd,
                                });
                                continue;
                            }

                            const r = await story.buildPersonalToday({ appUserId });
                            await safeReply(replyToken, r?.text || story.renderFallback() || "（返す文が空だった🙏）", {
                                stage: "personal_today",
                                cmd,
                                app_user_id: appUserId,
                            });
                            continue;
                        }

                        // fallback（必ず文字を返す保険）
                        await safeReply(
                            replyToken,
                            story.renderFallback() || "コマンドがわからなかったよ🌌 例：はじめる / 今日 / そら / わたしのほし",
                            { stage: "fallback", cmd, app_user_id: appUserId }
                        );
                    }
                } catch (e) {
                    console.log("[line] event error:", e?.message || String(e), { request_id: requestId });
                }
            }

            return res.status(200).json({ ok: true });
        } catch (e) {
            console.error("[line:webhook] fatal:", e?.message || String(e), { request_id: requestId });
            // LINEは 200 を返すのが安定
            return res.status(200).json({ ok: true });
        }
    }

    // --------------------
    // webhook route
    // --------------------
    router.post("/webhook", rawBody(), handleWebhook);

    return router;
}

// --------------------
// Backward-compatible exports (for older index wiring)
// --------------------
// If somewhere expects `handleLineWebhook(req,res,deps)` style,これで生き返る
async function handleLineWebhook(req, res, deps = {}) {
    const router = createLineRouter(deps);
    // create a mini express-like invocation: call the internal handler by reusing the router stack
    // NOTE: This is a minimal bridge. Prefer mounting router in index.js.
    const layer = router.stack.find((l) => l?.route?.path === "/webhook" && l?.route?.methods?.post);
    const handler = layer?.route?.stack?.[0]?.handle;
    if (typeof handler !== "function") return res.status(500).json({ ok: false, error: "line webhook handler not found" });
    return handler(req, res);
}

module.exports = { createLineRouter, handleLineWebhook };
