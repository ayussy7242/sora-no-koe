// routes/stories.js — Unified STABLE (v2026-01-27 safe-outputs + single-render)
"use strict";

const express = require("express");
const { normalizeStoryArgs } = require("../engine/story_args");
const { SORA_ALIAS_ENTRIES } = require("../line/sora_alias");
const { buildRenderMap, resolvePrimaryKey, attachOutputs } = require("./stories_render");

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

  const s = s0.includes(" ") && !s0.includes("T") ? s0.replace(" ", "T") : s0;

  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    return isValidISO(s) ? s : null;
  }

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
 */
function resolveStoryMode(reqMode, appUserId) {
  const m = String(reqMode || "").trim().toLowerCase();

  if (m === "auto") return "auto";
  if (m === "public") return "public";

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
    !renderers?.renderSoraUraLine ||
    !renderers?.renderSoraUraSilentLine ||
    !renderers?.renderSoraUraRareLine ||
    !renderers?.renderSoraUraHarmonyLine ||
    !renderers?.renderAnshinLine ||
    !renderers?.renderX ||
    !renderers?.renderIG ||
    !renderers?.renderThreads
  ) {
    throw new Error("deps.renderers (renderLine/renderSoraLine/renderSoraAllLine/renderX/renderIG/renderThreads) is missing");
  }

  router.get("/", async (req, res) => {
    try {
      // ① format/channel
      const format = String(req.query.format || "json").trim().toLowerCase();
      const reqChannel = String(req.query.channel || "").trim().toLowerCase();

      const channelAlias = {
        // sora系は共通エイリアス（line/intent と同一）から構築
        ...(SORA_ALIAS_ENTRIES || []).reduce((acc, e) => {
          if (e?.alias && e?.channel) acc[e.alias] = e.channel;
          return acc;
        }, {}),

        // anshin / other channels
        anshin: "line_anshin",
        line_anshin: "line_anshin",

        // optional aliases
        x: "x",
        ig: "ig",
        threads: "threads",
        line: "line",
      };

      const ch = channelAlias[reqChannel] || reqChannel;

      const isSocial =
        format === "x" || format === "ig" || format === "threads" ||
        ch === "x" || ch === "ig" || ch === "threads";

      const isSora = ch === "line_sora";
      const isSoraAll = ch === "line_sora_all";
      const isSoraUra = ch === "line_sora_ura";
      const isSoraUraSilent = ch === "line_sora_ura_silent";
      const isSoraUraRare = ch === "line_sora_ura_rare";
      const isSoraUraHarmony = ch === "line_sora_ura_harmony";
      const isAnshin = ch === "line_anshin";

      // ② appUserId/mode
      let appUserId = pickAppUserId(req);
      let mode = resolveStoryMode(req.query.mode, appUserId);

      // ③ save 先に初期化
      let save = boolish(req.query.save);

      // ④ public固定＆保存禁止ルール（SNS / sora系は public固定）
      if (isSocial || isSora || isSoraAll || isSoraUra || isSoraUraSilent || isSoraUraRare || isSoraUraHarmony) {
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
      const story = await storyService.buildStoryForUser(
        normalizeStoryArgs({
          appUserId,
          mode,       // public | auto
          dateLocal,  // 表示用
          asOfISO,    // ✅ ここが NOW
          orbMaxDeg,
          precisionDeg,
        })
      );

      // anshin / natal 用に natal_cache を補足（publicは取得しない）
      let anshinNatalCache = null;
      let natalCache = null;
      if (appUserId && appUserId !== "public") {
        try {
          const snap = await db.collection("natal_cache").doc(appUserId).get();
          const data = snap.exists ? snap.data() : null;
          if (isAnshin) anshinNatalCache = data;
          natalCache = data;
        } catch (_) {
          anshinNatalCache = null;
          natalCache = null;
        }
      }

      // router印（デバッグ用）
      story.meta = story.meta || {};
      story.meta.router_build = "routes/stories.js v2026-01-27 safe-outputs + single-render";
      story.meta.router_asof_source =
        (req.query.as_of && isValidISO(req.query.as_of)) ? "as_of" :
          (req.query.datetime_local ? "datetime_local" : "server_now");
      // AI debug flag (per-request)
      const aiDebugOn = boolish(req.query.ai_debug) || boolish(req.query.debug);
      if (aiDebugOn) story.meta.ai_debug_on = true;

      // --------------------
      // render only what is requested (NO collateral failures)
      // --------------------
      const renderMap = buildRenderMap({ renderers, story, anshinNatalCache, natalCache });

      // format/channel -> primary output key
      const wantKey = resolvePrimaryKey({ format, channel: ch });

      const primaryText = await (renderMap[wantKey] || renderMap.line)();

      // outputs: include only if requested (and never break main response)
      await attachOutputs({ story, renderMap, primaryKey: wantKey, primaryText, includeOutputs });

      // save（※現状 doc_id が日付固定なので “今”を保存すると上書きになる）
      if (save) {
        doc_id = `${appUserId}-${dateLocal}`;
        const ref = db.collection("stories").doc(doc_id);

        const txResult = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const existing = snap.exists ? snap.data() : null;
          const isFinalized = !!existing?.meta?.finalized;

          if (final && isFinalized && !force) {
            return { didWrite: false, alreadyFinal: true };
          }

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

      // respond (json)
      if (format === "json") return res.json({ ok: true, saved, doc_id, meta: story.meta, story });
      if (format === "all") return res.json({ ok: true, saved, doc_id, meta: story.meta, story });

      // respond (single text channel)
      if (format === "line" || format === "x" || format === "ig" || format === "threads") {
        return res.json({ ok: true, saved, doc_id, text: primaryText });
      }

      // text/plain
      if (format === "text") {
        res.setHeader("content-type", "text/plain; charset=utf-8");
        return res.status(200).send(primaryText);
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
