"use strict";

const { safeEqual } = require("../utils/data/equal");
const { memorySnapshot, logWithReq } = require("../utils/infra/logging");
const { stripQuery } = require("../utils/http");

function createCronTokenGuard({ env }) {
  return function requireCronToken(req) {
    const token = String(req.header("x-cron-token") || "").trim();
    const cronToken = String(env?.CRON_TOKEN || "").trim();

    if (!cronToken) return { ok: false, status: 500, message: "CRON_TOKEN is not set" };
    if (!safeEqual(token, cronToken)) return { ok: false, status: 401, message: "invalid cron token" };
    return { ok: true };
  };
}

function logCronError(path, err, req) {
  const message = err?.message || String(err);
  const error_code = err?.code || err?.name || null;
  const meta = {
    path,
    method: req?.method,
    url: stripQuery(req?.originalUrl),
    error_code,
  };
  console.error(`[cron] error ${path}`, { message, ...meta });
  if (err?.stack) console.error(err.stack);
}

function logCronPhase(req, label, meta = {}) {
  logWithReq(req, label, { ...meta, mem: memorySnapshot() });
}

function cronError(res, req, path, err) {
  logCronError(path, err, req);
  const error_code = err?.code || err?.name || null;
  return res.status(500).json({
    ok: false,
    error: err?.message || String(err),
    error_code,
    path,
  });
}

function registerCronPostRoute(router, {
  path,
  requireCronToken,
  buildOptions = () => ({}),
  run,
  logLabel = null,
  logMeta = null,
} = {}) {
  router.post(path, async (req, res) => {
    const gate = requireCronToken(req);
    if (!gate.ok) return res.status(gate.status).json({ ok: false, error: gate.message, path: `/cron${path}` });

    try {
      const startedAt = Date.now();
      if (logLabel) {
        logCronPhase(req, `${logLabel} start`, typeof logMeta === "function" ? (logMeta("start", {}) || {}) : {});
      }

      const opts = await buildOptions(req);
      const result = await run({ req, res, opts });

      if (logLabel) {
        const baseMeta = typeof logMeta === "function" ? (logMeta("done", result) || {}) : {};
        logCronPhase(req, `${logLabel} done`, { ...baseMeta, ms: Date.now() - startedAt });
      }
      return res.json(result);
    } catch (err) {
      return cronError(res, req, `/cron${path}`, err);
    }
  });
}

module.exports = {
  createCronTokenGuard,
  logCronPhase,
  cronError,
  registerCronPostRoute,
};
