"use strict";

const express = require("express");
const { safeEqual } = require("../utils/data/equal");
const { handleJobsWorker } = require("../runners/jobs/worker");
const { resolveEnv } = require("../utils/env");

function createJobsRouter(deps = {}) {
  const router = express.Router();
  const { db, admin, swisseph, env } = deps;

  if (!db) throw new Error("deps.db is required");
  if (!admin) throw new Error("deps.admin is required");
  if (!swisseph) throw new Error("deps.swisseph is required");

  const env2 = resolveEnv(env);
  const allowDebug = String(env2.DEBUG || "0") === "1";

  const workerHandler = async (req, res) => {
    return handleJobsWorker(req, res, {
      db,
      admin,
      swisseph,
      env: env2, // ←ここも env2 を渡すと統一できて気持ちいい
      ok: (res, data) => res.status(200).json({ ok: true, ...data }),
      bad: (res, status, msg, extra) =>
        res.status(status).json({ ok: false, error: msg, ...extra }),
    });
  };

  // GET /jobs/worker（DEBUG=1の時だけ）
  router.get("/worker", (req, res) => {
    if (!allowDebug) return res.status(404).json({ ok: false, error: "not found" });
    return workerHandler(req, res);
  });

  // POST /jobs/worker（cron-token必須）
  router.post("/worker", async (req, res) => {
    const token = req.header("x-cron-token") || "";
    const expected = env2.CRON_TOKEN;

    if (!expected || !safeEqual(token, expected)) {
      return res.status(403).json({ ok: false, error: "forbidden (invalid cron token)" });
    }

    return workerHandler(req, res);
  });

  return router;
}

module.exports = { createJobsRouter };
