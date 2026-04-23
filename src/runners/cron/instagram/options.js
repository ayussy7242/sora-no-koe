"use strict";

const path = require("path");
const { toDateLocalJST } = require("../../../utils/time");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");

function resolveInstagramPostOptions({ env, opts = {} } = {}) {
  const env2 = resolveEnv(env || {});
  const now = opts.asOfISO ? new Date(opts.asOfISO) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("invalid as_of");

  const asOfISO = opts.asOfISO || now.toISOString();
  const dateLocal = opts.dateLocal || toDateLocalJST(now);
  const slotRaw = String(opts.slot || "").trim().toLowerCase();
  const slotKey = ["morning", "resonance", "night"].includes(slotRaw) ? slotRaw : "";
  const useAi = opts.useAi !== false;
  const withCta = opts.withCta !== undefined
    ? opts.withCta !== false
    : slotKey
      ? slotKey === "morning"
      : true;
  const dryRun = opts.dryRun === true || env2.IG_POST_DRY_RUN === true;
  const localOnly = toBool(
    opts.local ?? opts.localOnly ?? opts.local_only ?? env2.IG_POST_LOCAL_ONLY,
    false
  );
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.IG_POST_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "ig", slotKey || "post", dateLocal)
  );
  const force =
    opts.force === true ||
    opts.force_lock === true ||
    opts.forceLock === true ||
    env2.IG_POST_FORCE === true;

  return {
    env2,
    asOfISO,
    dateLocal,
    slotKey,
    useAi,
    withCta,
    dryRun,
    localOnly,
    localOutDir,
    force,
  };
}

module.exports = {
  resolveInstagramPostOptions,
};
