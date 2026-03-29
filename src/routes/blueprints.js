"use strict";

const express = require("express");
const { createBlueprintHandlers } = require("../usecases/pdf/blueprint/jobs/handlers");

function createBlueprintsRouter(deps = {}) {
  const router = express.Router();
  const env = deps.env || {};
  const db = deps.db;
  const admin = deps.admin;
  const storage = deps.storage;

  if (!db) throw new Error("deps.db is required for blueprints router");
  if (!admin) throw new Error("deps.admin is required for blueprints router");
  if (!storage) throw new Error("deps.storage is required for blueprints router");

  const handlers = createBlueprintHandlers({ env, db, admin, storage });

  router.get("/ping", (_req, res) => {
    return res.json({ ok: true, where: "blueprints" });
  });

  router.post("/light/generate", express.json({ limit: "1mb" }), handlers.handleGenerate);
  router.get("/light/status", handlers.handleStatus);
  router.post("/light/run", express.json({ limit: "1mb" }), handlers.handleWorker);
  router.post("/light/worker", express.json({ limit: "1mb" }), handlers.handleWorker);
  router.post("/light/pdf_worker", express.json({ limit: "1mb" }), handlers.handlePdfWorker);

  return router;
}

module.exports = { createBlueprintsRouter };
