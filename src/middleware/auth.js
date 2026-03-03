"use strict";

/**
 * Simple token auth middleware
 *
 * 対応:
 * - Header: x-cron-token / x-debug-token
 * - Authorization: Bearer xxx
 *
 * usage:
 *   const auth = require("../middleware/auth");
 *   router.post("/cron/daily", auth({ tokenEnv: "CRON_TOKEN" }), handler)
 */

module.exports = function auth(opts = {}) {
  const {
    tokenEnv,                 // required: env key name
    headerName = null,        // optional: explicit header name
    allowBearer = true,
  } = opts;

  if (!tokenEnv) {
    throw new Error("auth middleware requires tokenEnv");
  }

  return function authMiddleware(req, res, next) {
    try {
      const expected = process.env[tokenEnv];
      if (!expected) {
        return res.status(500).json({
          ok: false,
          error: `server token ${tokenEnv} not configured`,
        });
      }

      let token = null;

      // 1) explicit header
      if (headerName) {
        token = req.header(headerName);
      }

      // 2) Bearer
      if (!token && allowBearer) {
        const authz = req.header("authorization");
        if (authz && authz.startsWith("Bearer ")) {
          token = authz.slice(7);
        }
      }

      if (!token) {
        return res.status(401).json({
          ok: false,
          error: "missing auth token",
        });
      }

      if (token !== expected) {
        return res.status(403).json({
          ok: false,
          error: "invalid auth token",
        });
      }

      next();
    } catch (e) {
      next(e);
    }
  };
};
