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

function asOfIsoFromDateLocalJST(dateLocal) {
    // JST 12:00 = UTC 03:00
    return `${dateLocal}T03:00:00.000Z`;
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

function isValidISO(s) {
    if (typeof s !== "string" || !s) return false;
    const d = new Date(s);
    return !Number.isNaN(d.getTime());
}

function normMode(reqMode, appUserId) {
    const m = String(reqMode || "").trim().toLowerCase();
    if (m === "public") return "public";
    if (m === "auto") return "auto";
    // default: appUserId=public -> public, else auto
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
    if (!renderers?.renderLine || !renderers?.renderX || !renderers?.renderIG) {
        throw new Error("deps.renderers (renderLine/renderX/renderIG) is missing");
    }

    router.get("/", async (req, res) => {
        try {
            const appUserId = pickAppUserId(req);

            const dateLocalRaw = req.query.date_local;
            const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : toDateLocalJST();

            const asOfRaw = req.query.as_of;
            const asOfISO = isValidISO(asOfRaw) ? String(asOfRaw) : asOfIsoFromDateLocalJST(dateLocal);

            const orbMaxDeg = clamp(toNumberSafe(req.query.orb, 6), 0.1, 12);
            const precisionDeg = clamp(toNumberSafe(req.query.precision, 0.01), 0.001, 1);

            const mode = normMode(req.query.mode, appUserId);

            const format = String(req.query.format || "json").toLowerCase();
            const save = boolish(req.query.save);

            // outputs をレスポンスに含めるか（default true）
            const includeOutputs = req.query.outputs === undefined ? true : boolish(req.query.outputs);

            // build story
            const story = await storyService.buildStoryForUser({
                appUserId,
                mode,
                dateLocal,
                asOfISO,
                orbMaxDeg,
                precisionDeg,
            });

            // どの router が動いてるか印（デバッグ用）
            story.meta = story.meta || {};
            story.meta.router_build = "routes/stories.js v2026-01-04 outputs-enabled";

            // --------------------
            // outputs（rendered texts）
            // ※line/x/ig/text 返す可能性があるので、内部では常に生成する
            // --------------------
            const outputs = {
                line: renderers.renderLine(story),
                x: renderers.renderX(story),
                ig: renderers.renderIG(story),
            };

            if (includeOutputs) {
                story.outputs = outputs;
            } else {
                // 念のため、どこかで outputs が付いてたら消す
                if (story.outputs) delete story.outputs;
            }

            // --------------------
            // save（Firestoreには outputs を入れない）
            // --------------------
            let saved = false;
            let doc_id = null;

            // outputsは先に作る
            const outputs = {
                line: renderers.renderLine(story),
                x: renderers.renderX(story),
                ig: renderers.renderIG(story),
            };

            // レスポンスに含めるか制御
            if (includeOutputs) story.outputs = outputs;

            // 保存するなら outputs は外す
            if (save) {
                doc_id = `${appUserId}-${dateLocal}`;
                const toSave = JSON.parse(JSON.stringify(story));
                delete toSave.outputs;
                await db.collection("stories").doc(doc_id).set(toSave, { merge: true });
                saved = true;
            }

            // --------------------
            // respond
            // --------------------
            if (format === "json") return res.json({ ok: true, saved, doc_id, story });
            if (format === "line") return res.json({ ok: true, saved, doc_id, text: outputs.line });
            if (format === "x") return res.json({ ok: true, saved, doc_id, text: outputs.x });
            if (format === "ig") return res.json({ ok: true, saved, doc_id, text: outputs.ig });
            if (format === "all") return res.json({ ok: true, saved, doc_id, story });

            if (format === "text") {
                const channel = String(req.query.channel || "line").toLowerCase();
                const text = channel === "x" ? outputs.x : channel === "ig" ? outputs.ig : outputs.line;
                res.setHeader("content-type", "text/plain; charset=utf-8");
                return res.status(200).send(text);
            }

            // unknown format fallback
            return res.json({ ok: true, saved, doc_id, story });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/stories" });
        }
    });

    return router;
}

module.exports = { createStoriesRouter };
