"use strict";

const express = require("express");
const { handleJobsWorker } = require("../jobs/worker");

function createJobsRouter(deps = {}) {
    const router = express.Router();

    const { db, admin, swisseph, env } = deps;

    if (!db) throw new Error("deps.db is required");
    if (!admin) throw new Error("deps.admin is required");
    if (!swisseph) throw new Error("deps.swisseph is required");

    // GET /jobs/worker
    router.get("/worker", async (req, res) => {
        return handleJobsWorker(req, res, {
            db,
            admin,
            swisseph,
            env,
            ok: (res, data) => res.status(200).json({ ok: true, ...data }),
            bad: (res, status, msg, extra) =>
                res.status(status).json({ ok: false, error: msg, ...extra }),
        });
    });

    return router;
}

module.exports = { createJobsRouter };
