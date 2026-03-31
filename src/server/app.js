// app.js — Unified STABLE (v2026.01)
"use strict";

const express = require("express");
const crypto = require("crypto");

// routers（factory）
const { createHealthRouter } = require("../routes/health");
const { createTransitRouter } = require("../routes/transit");
const { createStoriesRouter } = require("../routes/stories");
const { createLineRouter } = require("../routes/line");
const { createCronRouter } = require("../routes/cron");
const { createIgRouter } = require("../routes/ig");
const { createDebugRouter } = require("../routes/debug");
const { createJobsRouter } = require("../routes/jobs");
const { createStripeRouter } = require("../routes/stripe");
const { createBlueprintsRouter } = require("../routes/blueprints");
const { createBlueprintsDebugRouter } = require("../routes/blueprints_debug");

// -------------------- helpers --------------------
function createReqId() {
  return crypto.randomBytes(8).toString("hex");
}

function isRawBodyPath(req) {
  // rawBody が必要な webhook は body parser から完全除外
  // - /line/webhook
  // - /api/stripe/webhook
  // - /stripe/webhook (legacy)
  const url = req?.originalUrl || "";
  return (
    url.startsWith("/line/webhook") ||
    url.startsWith("/api/stripe/webhook") ||
    url.startsWith("/stripe/webhook")
  );
}

/**
 * ✅ LINE webhook を “完全に” 除外する body parser
 * - json も urlencoded も webhook では絶対に走らせない
 * - rawBody は routes/line.js 側で読む
 */
function safeBodyParsers() {
  const json = express.json({ limit: "2mb" });
  const urlencoded = express.urlencoded({ extended: true, limit: "2mb" });

  return (req, res, next) => {
    if (isRawBodyPath(req)) return next();

    json(req, res, (err) => {
      if (err) return next(err);
      urlencoded(req, res, next);
    });
  };
}

function maskSecrets(obj) {
  const clone = { ...(obj || {}) };
  for (const k of Object.keys(clone)) {
    if (/SECRET|TOKEN|KEY|PASS|PASSWORD/i.test(k) && clone[k]) {
      clone[k] = "***";
    }
  }
  return clone;
}

function buildMeta(deps) {
  const env = deps?.env || {};
  return {
    ok: true,
    project: env.PROJECT || "sora-no-koe",
    timezone: env.DEFAULT_TZ || "Asia/Tokyo",
    schema_version: env.SCHEMA_VERSION || "unknown",
    revision: process.env.K_REVISION || null,
    service: process.env.K_SERVICE || null,
    region: process.env.K_REGION || null,
  };
}

// -------------------- createApp --------------------
function createApp(deps = {}) {
  const app = express();
  const env = deps.env || {};

  // ✅ どこからでも deps を参照できる
  app.locals.deps = deps;

  app.disable("x-powered-by");
  app.set("trust proxy", true);

  // request id
  app.use((req, _res, next) => {
    req.id = req.headers["x-request-id"] || createReqId();
    next();
  });

  // logger
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      if (!req.originalUrl.startsWith("/health")) {
        console.log(`[${req.id}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
      }
    });
    next();
  });

  // ✅ body parsers（LINE webhook除外）
  app.use(safeBodyParsers());

  // -------------------- root / meta --------------------
  app.get("/", (_req, res) => {
    res.status(200).json({
      ...buildMeta(deps),
      message: "sora-no-koe api",
    });
  });

  app.get("/meta", (_req, res) => {
    res.status(200).json({
      ...buildMeta(deps),
      env: maskSecrets(env),
      features: {
        firestore: !!deps.db,
        admin: !!deps.admin,
        swisseph: !!deps.swisseph,
        storyService: !!deps.storyService,
        renderers: !!deps.renderers,
        geocoder: !!deps.geocoder,
      },
    });
  });

  // -------------------- feature routers --------------------
  app.use("/health", createHealthRouter(deps));
  app.use("/transit", createTransitRouter(deps));
  app.use("/stories", createStoriesRouter(deps));
  app.use("/line", createLineRouter(deps));
  app.use("/ig", createIgRouter(deps));
  app.use("/cron", createCronRouter(deps));
  // Stripe webhook: /api/stripe (primary) + /stripe (legacy)
  app.use("/api/stripe", createStripeRouter(deps));
  app.use("/stripe", createStripeRouter(deps));
  app.use("/internal/blueprints", createBlueprintsRouter(deps));
  app.use("/internal/tasks/blueprints", createBlueprintsRouter(deps));
  app.use("/internal/debug/blueprints", createBlueprintsDebugRouter(deps));
  app.use("/debug", createDebugRouter(deps));
  app.use("/jobs", createJobsRouter(deps));

  // 404
  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: "not found",
      path: req.path,
      request_id: req.id,
    });
  });

  // error handler
  app.use((err, req, res, _next) => {
    console.error(`[${req.id}] [app:error]`, err);
    const error_code = err?.code || err?.name || null;
    res.status(err?.statusCode || err?.status || 500).json({
      ok: false,
      error: err?.message || "internal error",
      error_code,
      request_id: req.id,
    });
  });

  return app;
}

module.exports = { createApp };
