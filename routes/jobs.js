"use strict";

const express = require("express");
const { handleJobsWorker } = require("../jobs/worker");

function createJobsRouter(deps = {}) {
  const router = express.Router();
  const { db, admin, swisseph, env } = deps;

  if (!db) throw new Error("deps.db is required");
  if (!admin) throw new Error("deps.admin is required");
  if (!swisseph) throw new Error("deps.swisseph is required");

  // 共通ハンドラ（GET/POSTで共有）
  const workerHandler = async (req, res) => {
    return handleJobsWorker(req, res, {
      db,
      admin,
      swisseph,
      env,
      ok: (res, data) => res.status(200).json({ ok: true, ...data }),
      bad: (res, status, msg, extra) =>
        res.status(status).json({ ok: false, error: msg, ...extra }),
    });
  };

  // GET /jobs/worker（手動・デバッグ用）
  router.get("/worker", workerHandler);

  // POST /jobs/worker（Scheduler専用・cron-token必須）
  router.post("/worker", async (req, res) => {
    const token = req.headers["x-cron-token"];
    const expected = env?.CRON_TOKEN || process.env.CRON_TOKEN; // ←ここ大事

    if (!expected || token !== expected) {
      return res.status(403).json({
        ok: false,
        error: "forbidden (invalid cron token)",
      });
    }

    return workerHandler(req, res);
  });

  return router;
}

module.exports = { createJobsRouter };
