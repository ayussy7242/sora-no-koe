"use strict";

const { randomId } = require("./utils");

function buildWorkerContext(deps = {}) {
  const { db, admin, ok, bad, swisseph } = deps;

  if (!db) throw new Error("deps.db required");
  if (!admin) throw new Error("deps.admin required");
  if (!ok || !bad) throw new Error("deps.ok/bad required");
  if (!swisseph) throw new Error("deps.swisseph required");

  const env = { ...(deps.env || {}), ...(process.env || {}) };

  const config = {
    MAX_ATTEMPTS: Number(env.JOBS_MAX_ATTEMPTS || 5),
    LEASE_MINUTES: Number(env.JOBS_LEASE_MINUTES || 10),
    RESET_STALE: String(env.JOBS_RESET_STALE || "1") === "1",
    STALE_LIMIT: Number(env.JOBS_STALE_LIMIT || 10),
  };

  const workerId = String(env.K_REVISION || "")
    ? `cr-${env.K_REVISION}-${randomId(6)}`
    : `local-${randomId(6)}`;

  const jobsCol = db.collection("jobs_natal_calc");

  return {
    db,
    admin,
    ok,
    bad,
    swisseph,
    env,
    config,
    workerId,
    jobsCol,
  };
}

module.exports = {
  buildWorkerContext,
};
