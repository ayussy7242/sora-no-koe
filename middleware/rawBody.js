"use strict";

/**
 * rawBody middleware
 *
 * 目的:
 * - LINE署名検証用に「完全な生の body(Buffer)」を保持
 * - JSONなら req.bodyParsed に安全にパース（req.bodyは触らない）
 *
 * ⚠ 注意:
 * - この middleware は express.json() より前に使うこと
 * - /line/webhook 専用で使うのがベスト
 */

module.exports = function rawBody(opts = {}) {
  const {
    limitBytes = 1 * 1024 * 1024, // 1MB
    parseJson = true,
  } = opts;

  return function rawBodyMiddleware(req, res, next) {
    try {
      // すでに rawBody があるなら何もしない
      if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
        return next();
      }

      // stream がすでに消費済み（＝他 middleware が先に読んだ）
      // → 署名検証は保証できないが、落とさず進める
      if (req.readableEnded || req.body !== undefined) {
        if (req.body && typeof req.body === "object") {
          req.rawBody = Buffer.from(JSON.stringify(req.body), "utf8");
        } else {
          req.rawBody = Buffer.from("", "utf8");
        }
        return next();
      }

      let total = 0;
      const chunks = [];

      req.on("error", (err) => next(err));

      req.on("data", (chunk) => {
        if (!chunk) return;

        total += chunk.length;
        if (total > limitBytes) {
          // 即終了（next しない）
          res.status(413).send("Payload too large");
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        const buf = Buffer.concat(chunks);
        req.rawBody = buf;

        // JSON は req.bodyParsed にのみ入れる（req.body は触らない）
        if (parseJson && buf.length) {
          const ct = String(req.headers["content-type"] || "").toLowerCase();
          const looksJson =
            ct.includes("application/json") ||
            ct.includes("text/json");

          if (looksJson) {
            try {
              req.bodyParsed = JSON.parse(buf.toString("utf8"));
            } catch (_) {
              // 壊れててもOK（署名検証優先）
            }
          }
        }

        next();
      });
    } catch (e) {
      next(e);
    }
  };
};
