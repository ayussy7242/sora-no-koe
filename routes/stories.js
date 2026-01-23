// routes/stories.js — Unified STABLE (v2026-01-23 now-default)
"use strict";

const express = require("express");

// -------------------- helpers --------------------
function isYYYYMMDD(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toDateLocalJST(date = new Date()) {
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
}

function pickAppUserId(req) {
    return req.query.app_user_id || req.header("x-app-user-id") || "public";
}

function boolish(v) {
    if (v === true) return true;
    if (v === false) return false;
    if (typeof v !== "string") return false;
    return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function toNumberSafe(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

// Date() で解釈できるかだけ
function isValidISO(s) {
    if (typeof s !== "string" || !s) return false;
    const d = new Date(s);
    return !Number.isNaN(d.getTime());
}

/**
 * datetime_local を “JST +09:00” として ISO化
 * - 受け付け例:
 *   1) 2026-01-23T18:10:00+09:00 (そのまま)
 *   2) 2026-01-23T18:10:00Z      (そのまま)
 *   3) 2026-01-23T18:10:00       (JSTとみなして +09:00 を付ける)
 *   4) 2026-01-23 18:10:00       (Tに直して +09:00)
 */
function normalizeDateTimeLocalJST(datetimeLocalRaw) {
    const s0 = String(datetimeLocalRaw || "").trim();
    if (!s0) return null;

    // スペース区切りをTに
    const s = s0.includes(" ") && !s0.includes("T") ? s0.replace(" ", "T") : s0;

    // 末尾にZ or ±HH:MM があるなら、それはそのまま
    if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
        return isValidISO(s) ? s : null;
    }

    // タイムゾーン無しなら JST とみなして +09:00 を付ける
    const withOffset = `${s}+09:00`;
    return isValidISO(withOffset) ? withOffset : null;
}

/**
 * “as_of をどう決めるか” を統一
 * 優先順位:
 * 1) ?as_of=... (完全指定)
 * 2) ?datetime_local=... (JSTとして解釈してISO化)
 * 3) default: NOW (new Date().toISOString())
 */
function resolveAsOfISO(req) {
    const asOfRaw = req.query.as_of;
    if (isValidISO(asOfRaw)) return String(asOfRaw);

    const dtLocal = normalizeDateTimeLocalJST(req.query.datetime_local);
    if (dtLocal) return dtLocal;

    // デフォルト NOW
    return new Date().toISOString();
}

/**
 * “date_local をどう決めるか”
 * - 明示指定があればそれ（YYYY-MM-DDのみ）
 * - 無ければ “今のJST日付”
 */
function resolveDateLocal(req) {
    const dateLocalRaw = req.query.date_local;
    if (isYYYYMMDD(dateLocalRaw)) return String(dateLocalRaw);
    return toDateLocalJST();
}

/**
 * routes の “mode” は storyService の mode と別物として扱う
 * - req.mode: now | public | auto | (default)
 * - storyService mode: public | auto のみ
 *
 * ※いま「全部 now がいい」なので default を now 扱いに寄せる。
 */
function resolveStoryMode(reqMode, appUserId) {
    const m = String(reqMode || "").trim().toLowerCase(); // ←ここはもうtrim入ってるのでOK

    // routes 側の now は “時刻の決め方” なので storyService には渡さない
    if (m === "auto") return "auto";
    if (m === "public") return "public";

    // default: publicユーザーは public、それ以外は auto（今まで通り）
    return String(appUserId) === "public" ? "public" : "auto";
}

// -------------------- router factory --------------------
function createStoriesRouter(deps = {}) {
    const router = express.Router();

    const db = deps.db;
    const storyService = deps.storyService;
    const renderers = deps.renderers;

    if (!db) throw new Error("deps.db is required for stories router");
    if (!storyService?.buildStoryForUser) throw new Error("deps.storyService.buildStoryForUser is missing");
    if (
        !renderers?.renderLine ||
        !renderers?.renderSoraLine ||
        !renderers?.renderSoraAllLine ||
        !renderers?.renderX ||
        !renderers?.renderIG ||
        !renderers?.renderThreads
    ) {
        throw new Error("deps.renderers (renderLine/renderSoraLine/renderSoraAllLine/renderX/renderIG) is missing");
    }

    router.get("/", async (req, res) => {
        try {
            // ① format/channel
            const format = String(req.query.format || "json").trim().toLowerCase();
            const reqChannel = String(req.query.channel || "").trim().toLowerCase();

            const channelAlias = {
                sora_line: "line_sora",
                sora: "line_sora",
                line_sora: "line_sora",

                sora_all_line: "line_sora_all",
                sora_all: "line_sora_all",
                line_sora_all: "line_sora_all",
            };

            const ch = channelAlias[reqChannel] || reqChannel;

            const isSocial =
                format === "x" || format === "ig" || format === "threads" ||
                ch === "x" || ch === "ig" || ch === "threads";

            const isSora = ch === "line_sora";
            const isSoraAll = ch === "line_sora_all";

            // ② appUserId/mode
            let appUserId = pickAppUserId(req);
            let mode = resolveStoryMode(req.query.mode, appUserId);

            // ③ save 先に初期化
            let save = boolish(req.query.save);

            // ④ public固定＆保存禁止ルール（SNS / sora系は public固定）
            // ※「NOW」でも public固定は維持（内容はas_ofでNOWになる）
            if (isSocial || isSora || isSoraAll) {
                appUserId = "public";
                mode = "public";
                save = false;
            }

            // saved/doc_id
            let saved = false;
            let doc_id = null;

            // ✅ NOW デフォルト：as_of は基本 “今”
            const dateLocal = resolveDateLocal(req);
            const asOfISO = resolveAsOfISO(req);

            const orbMaxDeg = clamp(toNumberSafe(req.query.orb, 6), 0.1, 12);
            const precisionDeg = clamp(toNumberSafe(req.query.precision, 0.01), 0.001, 1);

            // final/force（保存時のみ意味がある）
            const final = boolish(req.query.final);
            const force = boolish(req.query.force);

            // outputs をレスポンスに含めるか（default true）
            const includeOutputs = req.query.outputs === undefined ? true : boolish(req.query.outputs);

            // build story
            const story = await storyService.buildStoryForUser({
                appUserId,
                mode,       // public | auto
                dateLocal,  // 表示用
                asOfISO,    // ✅ ここが NOW
                orbMaxDeg,
                precisionDeg,
            });

            // router印（デバッグ用）
            story.meta = story.meta || {};
            story.meta.router_build = "routes/stories.js v2026-01-23 now-default";
            story.meta.router_asof_source =
                (req.query.as_of && isValidISO(req.query.as_of)) ? "as_of" :
                    (req.query.datetime_local ? "datetime_local" : "server_now");

            // outputs はレスポンス用テキストなので常に生成
            const outputs = {
                line: renderers.renderLine(story),
                sora: renderers.renderSoraLine(story),
                sora_all: renderers.renderSoraAllLine(story),
                x: renderers.renderX(story),
                ig: renderers.renderIG(story),
                threads: renderers.renderThreads(story), // ✅ add
            };

            if (includeOutputs) {
                story.outputs = outputs;
            } else if (story.outputs) {
                delete story.outputs;
            }

            // save（※現状 doc_id が日付固定なので “今”を保存すると上書きになる）
            // ここは運用方針次第：1日1回の確定保存が必要なら、save=true を “daily確定” にだけ使うのが綺麗。
            if (save) {
                doc_id = `${appUserId}-${dateLocal}`;
                const ref = db.collection("stories").doc(doc_id);

                const txResult = await db.runTransaction(async (tx) => {
                    const snap = await tx.get(ref);
                    const existing = snap.exists ? snap.data() : null;
                    const isFinalized = !!existing?.meta?.finalized;

                    // final=true で、final済み、forceなし → 何もしない（冪等）
                    if (final && isFinalized && !force) {
                        return { didWrite: false, alreadyFinal: true };
                    }

                    // final=false で、final済み、forceなし → 弾く（409）
                    if (!final && isFinalized && !force) {
                        const err = new Error("already_finalized");
                        err.statusCode = 409;
                        throw err;
                    }

                    const toSave = JSON.parse(JSON.stringify(story));
                    delete toSave.outputs;

                    toSave.meta = toSave.meta || {};

                    if (final) {
                        toSave.meta.finalized = true;
                        toSave.meta.finalized_at_utc = new Date().toISOString();
                        toSave.meta.finalized_by = "api";
                    } else if (isFinalized) {
                        toSave.meta.finalized = true;
                        toSave.meta.finalized_at_utc = existing?.meta?.finalized_at_utc;
                        toSave.meta.finalized_by = existing?.meta?.finalized_by;
                    }

                    tx.set(ref, toSave, { merge: true });
                    return { didWrite: true, alreadyFinal: isFinalized };
                });

                saved = !!txResult?.didWrite;
            }

            // respond
            if (format === "json") return res.json({ ok: true, saved, doc_id, story });
            if (format === "line") return res.json({ ok: true, saved, doc_id, text: outputs.line });
            if (format === "x") return res.json({ ok: true, saved, doc_id, text: outputs.x });
            if (format === "ig") return res.json({ ok: true, saved, doc_id, text: outputs.ig });
            if (format === "threads") return res.json({ ok: true, saved, doc_id, text: outputs.threads });
            if (format === "all") return res.json({ ok: true, saved, doc_id, story });

            // text/plain
            if (format === "text") {
                const text =
                    ch === "x" ? outputs.x :
                        ch === "ig" ? outputs.ig :
                            ch === "threads" ? outputs.threads :
                                ch === "line_sora_all" ? outputs.sora_all :
                                    ch === "line_sora" ? outputs.sora :
                                        outputs.line;

                res.setHeader("content-type", "text/plain; charset=utf-8");
                return res.status(200).send(text);
            }


            // fallback
            return res.json({ ok: true, saved, doc_id, story });
        } catch (e) {
            const code = e?.statusCode || 500;
            return res.status(code).json({
                ok: false,
                error: e?.message || String(e),
                path: "/stories",
            });
        }
    });

    return router;
}

module.exports = { createStoriesRouter };
