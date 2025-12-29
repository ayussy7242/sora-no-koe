"use strict";

const express = require("express");

/**
 * Health Router (Cloud Run friendly)
 * - GET /health        : readiness + optional db ping
 * - GET /health/live   : liveness (always 200 if process is alive)
 *
 * deps:
 *  - env
 *  - db (Firestore)
 *  - admin
 *  - swisseph
 *  - storyService
 *  - renderers
 *  - line
 */
function createHealthRouter(deps = {}) {
  const router = express.Router();

  function safeBool(v) {
    if (v === true) return true;
    if (v === false) return false;
    if (typeof v !== "string") return false;
    return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  }

  function parseRequired(env = {}) {
    // デフォルト必須（運用で変えたいときは env.HEALTH_REQUIRED を使う）
    // 例: "firestore,storyService,renderers,swisseph"
    const def = {
      firestore: true,
      storyService: true,
      renderers: true,
      swisseph: true,
      // LINE webhookを止めたくないなら true にしてもOK
      line: false,
      admin: false,
    };

    const raw = env.HEALTH_REQUIRED ? String(env.HEALTH_REQUIRED).trim() : "";
    if (!raw) return def;

    // 指定されたものだけ true、それ以外は false（明示的運用）
    const req = {};
    for (const k of Object.keys(def)) req[k] = false;
    raw.split(",").map(s => s.trim()).filter(Boolean).forEach((k) => {
      req[k] = true;
    });
    return req;
  }

  async function dbPingMaybe({ db, env }) {
    if (!db) return null;

    // 明示的にONのときだけ叩く（普段は軽量最優先）
    if (!safeBool(env.HEALTH_DB_PING)) return null;

    try {
      // read/write両方を避けつつ確認したいなら read のみでもOK
      // ただ “権限/接続” が怪しい時は write が刺さることもある
      const ref = db.collection("_health").doc("ping");

      // read
      const snap = await ref.get();

      // optional write（必要な時だけ）
      // env.HEALTH_DB_PING_WRITE=1 のときだけ軽く更新（merge）
      let write = null;
      if (safeBool(env.HEALTH_DB_PING_WRITE)) {
        await ref.set(
          { last_ping_utc: new Date().toISOString(), service: process.env.K_SERVICE || null },
          { merge: true }
        );
        write = { ok: true };
      }

      return { ok: true, exists: snap.exists, write };
    } catch (e) {
      return { ok: false, error: e?.message || "db ping failed" };
    }
  }

  // readiness
  router.get("/", async (_req, res) => {
    const env = deps.env || {};

    try {
      // 依存の存在確認（落とさない、状態として返す）
      const checks = {
        firestore: !!deps.db,
        admin: !!deps.admin,
        swisseph: !!deps.swisseph,
        storyService: !!deps.storyService,
        renderers: !!deps.renderers,
        line: !!deps.line,
      };

      const required = parseRequired(env);

      const readiness = Object.entries(required).every(([k, must]) => {
        if (!must) return true;
        return checks[k] === true;
      });

      const dbPing = await dbPingMaybe({ db: deps.db, env });

      const payload = {
        ok: readiness, // readiness が false なら ok も false に寄せる（運用で分かりやすい）
        readiness,
        checks,
        required,
        db_ping: dbPing,
        meta: {
          project: env.PROJECT || "sora-no-koe",
          schema_version: env.SCHEMA_VERSION || "unknown",
          timezone: env.DEFAULT_TZ || "Asia/Tokyo",
          service: process.env.K_SERVICE || null,
          revision: process.env.K_REVISION || null,
          region: process.env.K_REGION || null,
          now_utc: new Date().toISOString(),
        },
      };

      return res.status(readiness ? 200 : 503).json(payload);
    } catch (e) {
      // ヘルスが例外で落ちるのが一番事故るので、503 + JSONで返す
      return res.status(503).json({
        ok: false,
        readiness: false,
        error: e?.message || String(e),
        meta: {
          project: env.PROJECT || "sora-no-koe",
          schema_version: env.SCHEMA_VERSION || "unknown",
          timezone: env.DEFAULT_TZ || "Asia/Tokyo",
          now_utc: new Date().toISOString(),
        },
      });
    }
  });

  // liveness（process aliveなら常に200）
  router.get("/live", (_req, res) => {
    res.status(200).send("ok");
  });

  return router;
}

module.exports = { createHealthRouter };
