"use strict";

const path = require("path");
const { toDateLocalJST, isYYYYMMDD } = require("../../../utils/time");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");

function resolveXCommonOptions({ env, opts = {}, slot = "x", fallbackNow = false } = {}) {
  const env2 = resolveEnv(env || {});
  const dryRun = toBool(opts.dryRun ?? opts.dry_run ?? env2.X_POST_DRY_RUN, false);
  const useAi = opts.useAi === undefined ? true : toBool(opts.useAi, true);
  const localOnly = toBool(
    opts.local ?? opts.localOnly ?? opts.local_only ?? env2.X_POST_LOCAL_ONLY,
    false
  );
  const force = !!opts.force;
  const asOfISO = String(opts.asOfISO || opts.as_of || "").trim()
    || (fallbackNow ? new Date().toISOString() : new Date().toISOString());
  const dateLocal = isYYYYMMDD(opts.dateLocal)
    ? String(opts.dateLocal)
    : toDateLocalJST(new Date(asOfISO));
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.X_POST_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "x", slot || "x", dateLocal || "unknown")
  );

  return {
    env2,
    dryRun,
    useAi,
    localOnly,
    force,
    asOfISO,
    dateLocal,
    localOutDir,
  };
}

function resolveXMorningOptions({ env, opts = {} } = {}) {
  return {
    ...resolveXCommonOptions({ env, opts, slot: "morning", fallbackNow: true }),
    resonanceOrbMax: opts.resonanceOrbMax,
  };
}

function resolveXResonanceOptions({ env, opts = {} } = {}) {
  return {
    ...resolveXCommonOptions({ env, opts, slot: "resonance", fallbackNow: false }),
    debugEnabled: toBool(opts.debug ?? opts.debugFlag ?? resolveEnv(env || {}).X_POST_DEBUG, false),
    resonanceOrbMax: opts.resonanceOrbMax,
    resonanceTriggerOrbMax: opts.resonanceTriggerOrbMax,
  };
}

function resolveXNightOptions({ env, opts = {} } = {}) {
  return resolveXCommonOptions({ env, opts, slot: "night", fallbackNow: false });
}

module.exports = {
  resolveXCommonOptions,
  resolveXMorningOptions,
  resolveXResonanceOptions,
  resolveXNightOptions,
};
