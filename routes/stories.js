// routes/stories.js — Unified STABLE (v2026-01-19)
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
  if (
    !renderers?.renderLine ||
    !renderers?.renderSoraLine ||
    !renderers?.renderSoraAllLine ||
    !renderers?.renderX ||
    !renderers?.renderIG
  ) {
    throw new Error("deps.renderers (renderLine/renderSoraLine/renderSoraAllLine/renderX/renderIG) is missing");
  }

  router.get("/", async (req, res) => {
    try {
      // ① format/channel
      const format = String(req.query.format || "json").toLowerCase();
      const reqChannel = String(req.query.channel || "").toLowerCase();

      const isSocial =
        format === "x" || format === "ig" ||
        reqChannel === "x" || reqChannel === "ig";

      const isSora = reqChannel === "line_sora" || reqChannel === "sora";
      const isSoraAll = reqChannel === "line_sora_all";

      // ② appUserId/mode
      let appUserId = pickAppUserId(req);
      let mode = normMode(req.query.mode, appUserId);

      // ③ save 先に初期化
      let save = boolish(req.query.save);

      // ④ public固定＆保存禁止ルール
      if (isSocial || isSora || isSoraAll) {
        appUserId = "public";
        mode = "public";
        save = false;
      }

      // saved/doc_id を先に宣言
      let saved = false;
      let doc_id = null;

      const dateLocalRaw = req.query.date_local;
      const dateLocal = isYYYYMMDD(dateLocalRaw) ? String(dateLocalRaw) : toDateLocalJST();

      const asOfRaw = req.query.as_of;
      const asOfISO = isValidISO(asOfRaw) ? String(asOfRaw) : asOfIsoFromDateLocalJST(dateLocal);

      const orbMaxDeg = clamp(toNumberSafe(req.query.orb, 6), 0.1, 12);
      const precisionDeg = clamp(toNumberSafe(req.query.precision, 0.01), 0.001, 1);

      // final: 今日の確定版ロック / force: ロック無視で上書き
      const final = boolish(req.query.final);
      const force = boolish(req.query.force);

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

      // router印（デバッグ用）
      story.meta = story.meta || {};
      story.meta.router_build = "routes/stories.js v2026-01-19 outputs-enabled";

      // outputs はレスポンス用テキストなので常に生成
      const outputs = {
        line: renderers.renderLine(story),
        sora: renderers.renderSoraLine(story),
        sora_all: renderers.renderSoraAllLine(story),
        x: renderers.renderX(story),
        ig: renderers.renderIG(story),
      };

      if (includeOutputs) {
        story.outputs = outputs;
      } else if (story.outputs) {
        delete story.outputs;
      }

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

          // deep clone して outputs を確実に除去
          const toSave = JSON.parse(JSON.stringify(story));
          delete toSave.outputs;

          toSave.meta = toSave.meta || {};

          if (final) {
            toSave.meta.finalized = true;
            toSave.meta.finalized_at_utc = new Date().toISOString();
            toSave.meta.finalized_by = "api";
          } else if (isFinalized) {
            // forceで上書きされてもfinal情報は維持（ロックは外さない）
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
      if (format === "all") return res.json({ ok: true, saved, doc_id, story });

      // text/plain
      if (format === "text") {
        const ch = reqChannel || "line";

        const text =
          ch === "x" ? outputs.x :
          ch === "ig" ? outputs.ig :
          (ch === "line_sora_all") ? outputs.sora_all :
          (ch === "line_sora" || ch === "sora") ? outputs.sora :
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
