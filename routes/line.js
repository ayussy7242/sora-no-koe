"use strict";

/**
 * routes/line.js — Unified STABLE (v2025.12+ FINAL)
 *
 * ✅ Goals
 * - 返信が「空」で握りつぶされない（無反応バグ潰し）
 * - intent判定は normalize 済み(cmd) を必ず使う
 * - follow/message 両方で profile/app_user を安全に同期
 * - strict / non-strict の挙動を明確化（署名不一致でも200返すモード維持）
 *
 * ✅ Rules
 * - コマンド判定は line/intent.js が唯一
 * - ルータは「判断しない」：各モジュールへ委譲する
 * - utilities は intent の前で処理
 * - natal 収集ステートは natal.handleCollect() が担当
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

// ✅ deps補完ヘルパ（修正版・マージ型）
function resolveDeps(req, initialDeps) {
    const injected = req?.app?.locals?.deps || {};
    const base = initialDeps || {};

    // injected を優先して上書き（db/admin/renderers を確実に拾う）
    const merged = { ...base, ...injected };

    // env だけはオブジェクトをマージ（欠け防止）
    merged.env = { ...(base.env || {}), ...(injected.env || {}) };

    return merged;
}

// --------------------
// factory
// --------------------
function createLineRouter(deps = {}) {
    console.log("[line] router loaded (routes/line.js)");

    const router = express.Router();

    // --------------------
    // health
    // --------------------
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
    // debug routes list
    // --------------------
    router.get("/debug/routes", (req, res) => {
        const d = resolveDeps(req, deps);
        const env = d.env || {};
        const DEBUG_TOKEN = env.DEBUG_TOKEN || null;

        if (!DEBUG_TOKEN) return res.status(500).json({ ok: false, error: "DEBUG_TOKEN is not set" });
        const token = String(req.query.token || "");
        if (!token || token !== String(DEBUG_TOKEN)) return res.status(401).json({ ok: false, error: "unauthorized" });

        return res.json({
            ok: true,
            routes: [
                "GET /line/health",
                "POST /line/webhook",
                "GET /line/debug/intent?text=...",
                "GET /line/debug/routes?token=...",
            ],
        });
    });

    // --------------------
    // core webhook handler
    // --------------------
    async function handleWebhook(req, res) {
        const requestId = getReqId(req);

        try {
            // ✅ ここで deps を毎回解決（これで db required が消える）
            const d = resolveDeps(req, deps);
            const { db, admin, env, renderers, geocoder, storyService } = d;

            if (!env) throw new Error("env required");

            const LINE_ENABLED = envFlag(env.LINE_ENABLED, true);
            const LINE_CHANNEL_SECRET = env.LINE_CHANNEL_SECRET || null;
            const LINE_CHANNEL_ACCESS_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN || null;
            const LINE_WEBHOOK_STRICT = envFlag(env.LINE_WEBHOOK_STRICT, false);
            const MAX_LINE_TEXT = Number(env.MAX_LINE_TEXT || 4800);
            const DEBUG_LOG_EVENTS = String(env.LINE_DEBUG_LOG_EVENTS || "0") === "1";

            // LINE無効なら即OK
            if (!LINE_ENABLED) return res.status(200).json({ ok: true, skipped: true, reason: "LINE disabled" });

            // env不足
            if (!LINE_CHANNEL_SECRET || !LINE_CHANNEL_ACCESS_TOKEN) {
                if (LINE_WEBHOOK_STRICT) return res.status(401).json({ ok: false, reason: "missing env" });
                return res.status(200).json({ ok: true, skipped: true, reason: "missing env" });
            }

            // deps validators（LINE有効時）
            if (!db) throw new Error("db required");
            if (!admin) throw new Error("admin required");
            if (!renderers?.renderLine) throw new Error("renderers.renderLine required");
            if (!renderers?.renderNatalListFromCache) throw new Error("renderers.renderNatalListFromCache required");
            if (!createLineUser) throw new Error("[line] createLineUser export not found (line/user.js)");
            if (!createLineNatal) throw new Error("[line] createLineNatal export not found (line/natal.js)");
            if (!createLineStory) throw new Error("[line] createLineStory export not found (line/story.js)");
            if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser required");

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

            async function lineApi(path, { method = "POST", body = null } = {}) {
                if (typeof fetch !== "function") throw new Error("fetch is not available (Node18+ required)");

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

            // modules instance
            const user = createLineUser({ db, admin, config: env });
            const natal = createLineNatal({ db, admin, geocoder, renderers, config: env });
            const story = createLineStory({ storyService, renderers, config: env });

            // signature verify
            const rawBuf = getRawBodyBuffer(req);
            const sig = req.header("x-line-signature");

            // raw が取れてる時だけ厳密検証
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
                    if (LINE_WEBHOOK_STRICT) {
                        return res.status(401).json({ ok: false, reason: ver.reason, request_id: requestId });
                    }
                    // non-strict は 200 で握る（再送ループ防止）
                    return res.status(200).json({ ok: true });
                }
            } else {
                // raw が取れない（Functions Framework等で先に body パース済みの可能性）
                console.log("[line:webhook] raw body missing (soft)", {
                    request_id: requestId,
                    has_body: req.body != null,
                    has_sig: !!sig,
                });

                // strict の時だけ弾く
                if (LINE_WEBHOOK_STRICT) {
                    return res.status(401).json({ ok: false, reason: "raw body missing", request_id: requestId });
                }
                // non-strict は続行（req.body を使って処理する）
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

                    if (event?.type === "unfollow") {
                        if (lineUserId && user?.markInactiveLineUser) {
                            await user.markInactiveLineUser(lineUserId);
                            console.log("[line] marked inactive (unfollow)", { request_id: requestId, line_user_id: lineUserId });
                        }
                        continue; // unfollow は返信できない
                    }

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

                        // ✅ ここに【追加】（既存コードは消さない）
                        if (lineUserId && user?.getLineUserStatus && user?.reactivateLineUser) {
                            const st = await user.getLineUserStatus(lineUserId);
                            if (st && st !== "active") {
                                await user.reactivateLineUser(lineUserId, appUserId);

                                await safeReply(replyToken, story.renderWelcome(profile), {
                                    stage: "reactivated_welcome",
                                    cmd,
                                    app_user_id: appUserId,
                                    prev_status: st,
                                });
                                continue; // ← これ重要（二重返信防止）
                            }
                        }

                        if (profile && lineUserId) {
                            await user.syncLineProfile({ lineUserId, lineProfile: profile, eventType: "message" });
                        }
                        if (profile?.displayName && appUserId) {
                            await user.syncUserDisplayName(appUserId, profile.displayName);
                        }

                        const util = await story.handleUtilities({ cmd, appUserId, natal });
                        if (util?.text != null) {
                            await safeReply(replyToken, util.text, { stage: "utilities", cmd, app_user_id: appUserId });
                            continue;
                        }

                        const collected = await natal.handleCollect({ appUserId, rawText, cmd });
                        if (collected?.text != null) {
                            await safeReply(replyToken, collected.text, { stage: "collect", cmd, app_user_id: appUserId });
                            continue;
                        }

                        const intentKey = intent.intentFromCommand(cmd);

                        if (intentKey === intent.INTENT.NATAL) {
                            const r = await natal.handleNatalList({ appUserId });
                            await safeReply(replyToken, r?.text || story.renderFallback() || "（返す文が空だった🙏）", {
                                stage: "natal_list",
                                cmd,
                                app_user_id: appUserId,
                            });
                            continue;
                        }

                        if (intentKey === intent.INTENT.PUBLIC_SKY) {
                            const r = await story.buildPublicSky();
                            await safeReply(replyToken, r?.text || story.renderFallback() || "（返す文が空だった🙏）", {
                                stage: "public_sky",
                                cmd,
                                app_user_id: appUserId,
                            });
                            continue;
                        }

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
            return res.status(200).json({ ok: true });
        }
    }

    // webhook route
    router.post("/webhook", rawBody(), handleWebhook);

    return router;
}

module.exports = { createLineRouter };