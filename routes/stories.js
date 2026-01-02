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

      const story = await storyService.buildStoryForUser({
        appUserId,
        mode,
        dateLocal,
        asOfISO,
        orbMaxDeg,
        precisionDeg,
      });

      let saved = false;
      let doc_id = null;

      if (save) {
        doc_id = `${appUserId}-${dateLocal}`;
        await db.collection("stories").doc(doc_id).set(story, { merge: true });
        saved = true;
      }

      const texts = {
        line: renderers.renderLine(story),
        x: renderers.renderX(story),
        ig: renderers.renderIG(story),
      };

      if (format === "json") return res.json({ ok: true, saved, doc_id, story });
      if (format === "line") return res.json({ ok: true, saved, doc_id, text: texts.line });
      if (format === "x") return res.json({ ok: true, saved, doc_id, text: texts.x });
      if (format === "ig") return res.json({ ok: true, saved, doc_id, text: texts.ig });
      if (format === "all") return res.json({ ok: true, saved, doc_id, story, texts });

      if (format === "text") {
        const channel = String(req.query.channel || "line").toLowerCase();
        const text = channel === "x" ? texts.x : channel === "ig" ? texts.ig : texts.line;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        return res.status(200).send(text);
      }

      return res.json({ ok: true, saved, doc_id, story });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/stories" });
    }
  });

  return router;
}

module.exports = { createStoriesRouter };
