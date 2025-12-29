//transit.js

"use strict";

const express = require("express");

// JSTでYYYY-MM-DDを作る（Node標準でOK）
function toDateLocalJST(dateObj) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateObj);
}

function isISODateTime(s) {
  if (typeof s !== "string") return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function asOfIsoFromDateLocalJST(dateLocal) {
  // JST 12:00 = UTC 03:00（固定で安定）
  return `${dateLocal}T03:00:00.000Z`;
}

function toNumberSafe(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

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
      } else if (asOfQ && isISODateTime(asOfQ)) {
        dateLocal = toDateLocalJST(new Date(asOfQ));
      } else {
        dateLocal = toDateLocalJST(new Date());
      }

      // as_of 決定：無指定なら date_local JST正午固定
      const asOfISO = asOfQ ? asOfQ : asOfIsoFromDateLocalJST(dateLocal);
      if (!isISODateTime(asOfISO)) {
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
