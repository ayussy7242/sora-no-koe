"use strict";

const express = require("express");
const { createBlueprintLightService } = require("../engine/blueprint_light");
const { createLineApi } = require("../line/line_api");
const dict = require("../dict");

function requireTasksCaller(env, req) {
  const tokenExpected = env?.INTERNAL_TASKS_TOKEN || null;
  if (!tokenExpected) return { ok: false, status: 500, error: "INTERNAL_TASKS_TOKEN not set" };
  const token = String(req.header("x-internal-tasks-token") || "").trim();
  if (!token || token !== tokenExpected) {
    return { ok: false, status: 403, error: "invalid token" };
  }
  return { ok: true };
}

function createBlueprintsRouter(deps = {}) {
  const router = express.Router();
  const env = deps.env || {};
  const db = deps.db;
  const admin = deps.admin;
  const storage = deps.storage;

  if (!db) throw new Error("deps.db is required for blueprints router");
  if (!admin) throw new Error("deps.admin is required for blueprints router");
  if (!storage) throw new Error("deps.storage is required for blueprints router");

  router.get("/ping", (_req, res) => {
    return res.json({ ok: true, where: "blueprints" });
  });

  router.post("/light/generate", express.json({ limit: "1mb" }), async (req, res) => {
    const auth = requireTasksCaller(env, req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    const lineUserId = String(req.body?.line_user_id || "").trim();
    if (!lineUserId) return res.status(400).json({ ok: false, error: "line_user_id required" });

    const userSnap = await db.collection("line_users").doc(lineUserId).get();
    if (!userSnap.exists) {
      return res.status(202).json({ ok: true, code: "skipped_user_not_found" });
    }

    const blueprint = createBlueprintLightService({ db, admin, storage, env, dict });
    try {
      const gen = await blueprint.generateAndStore({ lineUserId });

      const signed = await blueprint.getOrCreateSignedUrl({ lineUserId });
      if (!signed?.ok || !signed?.url) {
        throw new Error("signed url missing after generate");
      }

      const lineApiClient = createLineApi({
        accessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
        maxText: Number(env.MAX_LINE_TEXT || 4800),
      });

      const templateMessage = {
        type: "template",
        altText: "魂の設計図（LIGHT）はこちら",
        template: {
          type: "buttons",
          title: "魂の設計図（LIGHT）",
          text: "あなた専用の設計図です🌌",
          actions: [
            {
              type: "uri",
              label: "設計図を開く",
              uri: signed.url,
            },
          ],
        },
      };

      await lineApiClient.pushMessages(lineUserId, templateMessage);
      return res.json({ ok: true, code: gen?.skipped ? "already_exists" : "generated" });
    } catch (e) {
      console.log("[blueprint] generate failed:", e?.message || String(e));
      return res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  return router;
}

module.exports = { createBlueprintsRouter };
