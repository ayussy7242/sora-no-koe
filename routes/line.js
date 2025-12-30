"use strict";

/**
 * routes/line.js
 *
 * 🌌 LINE Webhook 最終統合点
 *
 * 責務：
 * - rawBody / signature 検証
 * - LINE event を正規化
 * - intent 判定
 * - user 解決
 * - natal / story に委譲
 *
 * ❌ ロジックを持たない
 * ❌ 計算しない
 * ❌ 状態を作らない
 */

const express = require("express");
const crypto = require("crypto");
const rawBody = require("../middleware/rawBody");

// modules
const { createLineIntent } = require("../line/line.intent");
const { createLineUser } = require("../line/line.user");
const { createLineNatal } = require("../line/line.natal");
const { createLineStory } = require("../line/line.story");

function createLineRouter(deps = {}) {
    const router = express.Router();

    const {
        db,
        admin,
        env,
        renderers,
    } = deps;

    if (!db) throw new Error("db required");
    if (!admin) throw new Error("admin required");
    if (!env) throw new Error("env required");
    if (!renderers?.renderLine) throw new Error("renderers.renderLine required");

    // --------------------
    // env
    // --------------------
    const LINE_CHANNEL_SECRET = env.LINE_CHANNEL_SECRET;
    const LINE_CHANNEL_ACCESS_TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN;
    const LINE_WEBHOOK_STRICT = String(env.LINE_WEBHOOK_STRICT || "0") === "1";
    const MAX_LINE_TEXT = Number(env.MAX_LINE_TEXT || 4800);

    // --------------------
    // modules init
    // --------------------
    const intent = createLineIntent();
    const user = createLineUser({ db, admin, config: env });
    const natal = createLineNatal({ db, admin, env });
    const story = createLineStory({ db, env, renderers });

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
        const res = await fetch(`https://api.line.me${path}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`LINE API error ${res.status}`);
    }

    async function reply(replyToken, text) {
        if (!replyToken) return;
        if (!text) return;

        const safeText =
            text.length > MAX_LINE_TEXT
                ? text.slice(0, MAX_LINE_TEXT)
                : text;

        await lineApi("/v2/bot/message/reply", {
            replyToken,
            messages: [{ type: "text", text: safeText }],
        });
    }

    async function getLineProfile(lineUserId) {
        const res = await fetch(
            `https://api.line.me/v2/bot/profile/${lineUserId}`,
            {
                headers: {
                    Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
                },
            }
        );
        if (!res.ok) return null;
        return await res.json();
    }

    // --------------------
    // webhook
    // --------------------
    router.post("/webhook", rawBody(), async (req, res) => {
        const rawBuf = getRawBodyBuffer(req);
        const sig = req.header("x-line-signature");

        const ver = verifySignature({
            rawBodyBuf: rawBuf,
            signature: sig,
        });

        if (!ver.ok) {
            if (LINE_WEBHOOK_STRICT) {
                return res.status(401).json({ ok: false });
            }
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
            const replyToken = event.replyToken;
            const lineUserId = event?.source?.userId;

            // follow
            if (event.type === "follow" && lineUserId) {
                const profile = await getLineProfile(lineUserId);
                const appUserId = await user.getOrCreateAppUserId({
                    lineUserId,
                    lineProfile: profile,
                    eventType: "follow",
                });

                if (profile?.displayName) {
                    await user.syncUserDisplayName(appUserId, profile.displayName);
                }

                await reply(
                    replyToken,
                    story.renderWelcome(profile)
                );
                continue;
            }

            // message
            if (event.type === "message" && event.message?.type === "text") {
                const rawText = event.message.text;
                const intentKey = intent.detect(rawText);

                const profile = lineUserId
                    ? await getLineProfile(lineUserId)
                    : null;

                const appUserId = lineUserId
                    ? await user.getOrCreateAppUserId({
                          lineUserId,
                          lineProfile: profile,
                          eventType: "message",
                      })
                    : null;

                if (profile?.displayName && appUserId) {
                    await user.syncUserDisplayName(appUserId, profile.displayName);
                }

                // natal flow
                const natalHandled = await natal.handle({
                    intent: intentKey,
                    rawText,
                    appUserId,
                    reply: (text) => reply(replyToken, text),
                });
                if (natalHandled) continue;

                // story flow
                const storyText = await story.handle({
                    intent: intentKey,
                    appUserId,
                });

                if (storyText) {
                    await reply(replyToken, storyText);
                } else {
                    await reply(replyToken, story.renderFallback());
                }
            }
        }

        return res.status(200).json({ ok: true });
    });

    return router;
}

module.exports = { createLineRouter };
