"use strict";

const express = require("express");

// -------------------- helpers --------------------
function isYYYYMMDD(s) {
    return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toDateLocalJST(date = new Date()) {
    // JSTでYYYY-MM-DD
    const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().slice(0, 10);
}

function asOfIsoFromDateLocalJST(dateLocal) {
    // JST 12:00 = UTC 03:00
    return `${dateLocal}T03:00:00.000Z`;
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

function boolish(v) {
    if (v === true) return true;
    if (v === false) return false;
    if (typeof v !== "string") return false;
    return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

// -------------------- router factory --------------------
function createCronRouter(deps = {}) {
    const router = express.Router();

    const env = deps.env || {};
    const db = deps.db;
    const storyService = deps.storyService;
    const renderers = deps.renderers;

    if (!db) throw new Error("deps.db is required for cron router");
    if (!storyService?.buildStoryForUser) throw new Error("deps.storyService.buildStoryForUser is missing");
    if (!renderers?.renderLine || !renderers?.renderX || !renderers?.renderIG) {
        throw new Error("deps.renderers (renderLine/renderX/renderIG) is missing");
    }

    function requireCronToken(req) {
        const token = req.header("x-cron-token") || "";
        const CRON_TOKEN = env.CRON_TOKEN;

        if (!CRON_TOKEN) return { ok: false, status: 500, message: "CRON_TOKEN is not set" };
        if (token !== CRON_TOKEN) return { ok: false, status: 401, message: "invalid cron token" };
        return { ok: true };
    }

    // GET /cron/health (token不要 / 監視用)
    router.get("/health", (_req, res) => {
        return res.json({
            ok: true,
            project: env.PROJECT,
            timezone: env.DEFAULT_TZ,
            schema_version: env.SCHEMA_VERSION,
        });
    });

    /**
     * POST /cron/daily
     * headers:
     * - x-cron-token: required
     *
     * query/body:
     * - date_local=YYYY-MM-DD (default JST today)
     * - as_of=ISO (default JST noon)
     * - orb=6
     * - precision=0.01
     * - dry_run=1
     * - app_user_id=xxx (default public)
     *
     * 保存先:
     * - stories/{appUserId}-{dateLocal}
     * - posts_daily/{dateLocal}
     */
    router.post("/daily", async (req, res) => {
        const gate = requireCronToken(req);
        if (!gate.ok) {
            return res.status(gate.status).json({ ok: false, error: gate.message, path: "/cron/daily" });
        }

        try {
            const q = req.query || {};
            const b = req.body || {};

            const appUserId = String(b.app_user_id || q.app_user_id || "public");

            const dateLocalRaw = b.date_local || q.date_local;
            const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : toDateLocalJST();

            const asOfRaw = b.as_of || q.as_of;
            const asOfISO = isValidISO(asOfRaw) ? String(asOfRaw) : asOfIsoFromDateLocalJST(dateLocal);

            const orbMaxDeg = clamp(toNumberSafe(b.orb ?? q.orb, 6), 0.1, 12);
            const precisionDeg = clamp(toNumberSafe(b.precision ?? q.precision, 0.01), 0.001, 1);

            const dryRun = boolish(b.dry_run ?? q.dry_run);

            // 1) build story
            const isPublic = String(appUserId) === "public";

            const story = await storyService.buildStoryForUser({
                appUserId,
                ...(isPublic ? { mode: "public" } : {}),
                dateLocal,
                asOfISO,
                orbMaxDeg,
                precisionDeg,
            });

            // 2) build texts
            const texts = {
                line: renderers.renderLine(story),
                x: renderers.renderX(story),
                ig: renderers.renderIG(story),
            };

            // 3) save (unless dry_run)
            const story_doc_id = `${appUserId}-${dateLocal}`;
            const posts_doc_id = `${dateLocal}`;
            let saved = false;

            if (!dryRun) {
                await db.collection("stories").doc(story_doc_id).set(story, { merge: true });

                await db.collection("posts_daily").doc(posts_doc_id).set(
                    {
                        meta: {
                            project: env.PROJECT,
                            timezone: env.DEFAULT_TZ,
                            schema_version: env.SCHEMA_VERSION,
                            date_local: dateLocal,
                            as_of: asOfISO,
                            generated_at_utc: new Date().toISOString(),
                        },
                        app_user_id: appUserId,
                        texts,
                        story_ref: { collection: "stories", doc_id: story_doc_id },
                    },
                    { merge: true }
                );

                saved = true;
            }

            return res.json({
                ok: true,
                dry_run: dryRun,
                saved,
                date_local: dateLocal,
                as_of: asOfISO,
                app_user_id: appUserId,
                story_doc_id,
                posts_doc_id,
                preview: {
                    sky_top: story?.public?.sky_top || [],
                    moon: story?.public?.moon || null,
                },
            });
        } catch (e) {
            return res.status(500).json({
                ok: false,
                error: e?.message || String(e),
                path: "/cron/daily",
            });
        }
    });

    return router;
}

module.exports = { createCronRouter };
