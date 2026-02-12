"use strict";

const express = require("express");

function pickToken(req) {
  return (
    (req.query.token ? String(req.query.token) : null) ||
    (req.header("x-debug-token") ? String(req.header("x-debug-token")) : null) ||
    null
  );
}

function mask(v) {
  if (!v) return null;
  const s = String(v);
  if (s.length <= 6) return "***";
  return s.slice(0, 3) + "***" + s.slice(-3);
}

function pickAppUserId(req) {
  return (
    (req.query.app_user_id ? String(req.query.app_user_id) : null) ||
    (req.header("x-app-user-id") ? String(req.header("x-app-user-id")) : null) ||
    null
  );
}

function createDebugRouter(deps = {}) {
  const router = express.Router();

  const env = deps.env || {};
  const db = deps.db;

  const DEBUG_TOKEN = env.DEBUG_TOKEN;
  const PROJECT = env.PROJECT || "sora-no-koe";
  const DEFAULT_TZ = env.DEFAULT_TZ || "Asia/Tokyo";

  if (!db) throw new Error("deps.db is required for debug router");

  function requireDebugToken(req, res, next) {
    const provided = pickToken(req);

    if (!DEBUG_TOKEN) {
      return res.status(500).json({ ok: false, error: "DEBUG_TOKEN is not set", path: "/debug" });
    }
    if (!provided || provided !== DEBUG_TOKEN) {
      return res.status(401).json({ ok: false, error: "unauthorized", path: "/debug" });
    }
    return next();
  }

  // GET /debug/ping?token=...
  router.get("/ping", requireDebugToken, (_req, res) => {
    return res.json({
      ok: true,
      project: PROJECT,
      timezone: DEFAULT_TZ,
      now_utc: new Date().toISOString(),
    });
  });

  // GET /debug/env?token=...
  router.get("/env", requireDebugToken, (_req, res) => {
    return res.json({
      ok: true,
      env: {
        PROJECT,
        DEFAULT_TZ,
        DEBUG_TOKEN: mask(DEBUG_TOKEN),
        FIRESTORE_DATABASE_ID: env.FIRESTORE_DATABASE_ID ?? null,
        SCHEMA_VERSION: env.SCHEMA_VERSION ?? null,
      },
    });
  });

  // GET /debug/user?token=...&app_user_id=...
  router.get("/user", requireDebugToken, async (req, res) => {
    try {
      const appUserId = pickAppUserId(req);
      if (!appUserId) {
        return res.status(400).json({ ok: false, error: "app_user_id required", path: "/debug/user" });
      }

      const [uSnap, nSnap] = await Promise.all([
        db.collection("users").doc(appUserId).get(),
        db.collection("natal_cache").doc(appUserId).get(),
      ]);

      return res.json({
        ok: true,
        app_user_id: appUserId,
        users_exists: uSnap.exists,
        natal_cache_exists: nSnap.exists,
        user: uSnap.exists ? uSnap.data() : null,
        natal_cache: nSnap.exists ? nSnap.data() : null,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/debug/user" });
    }
  });

  // POST /debug/resetRegistration?token=...&line_user_id=Uxxxx
  router.post("/resetRegistration", requireDebugToken, async (req, res) => {
    try {
      const lineUserId = req.query.line_user_id ? String(req.query.line_user_id) : null;
      if (!lineUserId) {
        return res.status(400).json({
          ok: false,
          error: "line_user_id required",
          path: "/debug/resetRegistration",
        });
      }

      const ref = db.collection("line_users").doc(lineUserId);

      await ref.set(
        {
          line_user_id: lineUserId,
          status: "new",
          meta: {
            last_event_type: "debug/resetRegistration",
            last_seen_at: new Date().toISOString(),
          },
          debug: {
            reset_by: "debug/resetRegistration",
            reset_at_utc: new Date().toISOString(),
          },
        },
        { merge: true }
      );

      return res.json({ ok: true, line_user_id: lineUserId, action: "resetRegistration" });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e?.message || String(e),
        path: "/debug/resetRegistration",
      });
    }
  });

  // POST /debug/wipeUser?token=...&app_user_id=...
  router.post("/wipeUser", requireDebugToken, async (req, res) => {
    try {
      const appUserId = pickAppUserId(req);
      if (!appUserId) {
        return res.status(400).json({ ok: false, error: "app_user_id required", path: "/debug/wipeUser" });
      }

      await Promise.allSettled([
        db.collection("users").doc(appUserId).delete(),
        db.collection("natal_cache").doc(appUserId).delete(),
      ]);

      return res.json({ ok: true, app_user_id: appUserId, action: "wipeUser" });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || String(e), path: "/debug/wipeUser" });
    }
  });

  return router;
}

module.exports = { createDebugRouter };
