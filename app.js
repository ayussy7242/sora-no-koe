"use strict";

const express = require("express");
const crypto = require("crypto");

// routers（factory）
const { createHealthRouter } = require("./routes/health");
const { createTransitRouter } = require("./routes/transit");
const { createStoriesRouter } = require("./routes/stories");
const { createLineRouter } = require("./routes/line");
const { createCronRouter } = require("./routes/cron");
const { createDebugRouter } = require("./routes/debug");

// --------------------
// helpers
// --------------------
function createReqId() {
  return crypto.randomBytes(8).toString("hex");
}

function safeJsonMiddleware() {
  // LINE webhook は routes/line.js 内で rawBody
  return express.json({ limit: "2mb" });
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

// --------------------
// createApp
// --------------------
function createApp(deps = {}) {
  const app = express();
  const env = deps.env || {};

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
      if (!req.originalUrl.startsWith("/healthz")) {
        console.log(
          `[${req.id}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`
        );
      }
    });
    next();
  });

  // body parsers
  app.use(safeJsonMiddleware());
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  // --------------------
  // root / meta
  // --------------------
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
      },
    });
  });

  // --------------------
  // feature routers
  // --------------------
  const healthRouter = createHealthRouter(deps);
  app.use("/healthz", healthRouter);
  app.use("/health", healthRouter);

  app.use("/transit", createTransitRouter(deps));
  app.use("/stories", createStoriesRouter(deps));
  app.use("/line", createLineRouter(deps));
  app.use("/cron", createCronRouter(deps));
  app.use("/debug", createDebugRouter(deps));

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
    res.status(err?.statusCode || err?.status || 500).json({
      ok: false,
      error: err?.message || "internal error",
      code: err?.code || null,
      request_id: req.id,
    });
  });

  return app;
}

module.exports = { createApp };
