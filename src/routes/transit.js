//transit.js

"use strict";

const express = require("express");
const { toNumberSafe, clamp } = require("../utils/data/parse");
const {
  toDateLocalJST,
  asOfIsoFromDateLocalJST,
  runtimeAsOfIsoFromDateLocalJST,
  isYYYYMMDD,
  isValidISO,
} = require("../utils/time");

function createTransitRouter(deps = {}) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      const env = deps.env || {};
      const storyService = deps.storyService;

      if (!storyService?.computeTransitsSwiss) {
        return res.status(500).json({
          ok: false,
          error: "storyService.computeTransitsSwiss is missing",
          path: "/transit",
        });
      }

      // params
      const asOfQ = req.query.as_of ? String(req.query.as_of) : null;
      const dateLocalQ = req.query.date_local ? String(req.query.date_local) : null;

      // precision: precision or precision_deg (互換)
      const precisionRaw =
        req.query.precision ?? req.query.precision_deg ?? env.PRECISION_DEG ?? 0.01;
      const precisionDeg = clamp(toNumberSafe(precisionRaw, 0.01), 0.001, 1);

      if (!Number.isFinite(precisionDeg) || precisionDeg <= 0) {
        return res.status(400).json({
          ok: false,
          error: "precision must be a positive number",
          path: "/transit",
        });
      }

      // date_local 決定
      let dateLocal = null;
      if (dateLocalQ) {
        if (!isYYYYMMDD(dateLocalQ)) {
          return res.status(400).json({
            ok: false,
            error: "date_local must be YYYY-MM-DD",
            path: "/transit",
          });
        }
        dateLocal = dateLocalQ;
      } else if (asOfQ && isValidISO(asOfQ)) {
        dateLocal = toDateLocalJST(new Date(asOfQ));
      } else {
        dateLocal = toDateLocalJST(new Date());
      }

      // as_of 決定：無指定なら date_local に対する東京の実行時刻
      const asOfISO = asOfQ
        ? asOfQ
        : (runtimeAsOfIsoFromDateLocalJST(dateLocal) || asOfIsoFromDateLocalJST(dateLocal));
      if (!isValidISO(asOfISO)) {
        return res.status(400).json({
          ok: false,
          error: "invalid as_of (ISO datetime expected)",
          path: "/transit",
        });
      }

      // compute
      const transitInfo = storyService.computeTransitsSwiss(asOfISO, precisionDeg);

      return res.status(200).json({
        ok: true,
        meta: {
          project: env.PROJECT || "sora-no-koe",
          timezone: env.DEFAULT_TZ || "Asia/Tokyo",
          date_local: dateLocal,
          as_of: asOfISO,
          generated_at_utc: new Date().toISOString(),
          engine: { ephemeris_source: "swisseph", precision_deg: precisionDeg },
        },
        transit: transitInfo,
      });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: e?.message || "transit error",
        path: "/transit",
      });
    }
  });

  return router;
}

module.exports = { createTransitRouter };
