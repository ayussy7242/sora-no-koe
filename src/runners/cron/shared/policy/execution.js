"use strict";

function buildPolicy({
  runner,
  family,
  dryRun = false,
  localOnly = false,
  force = false,
  lockId = null,
  lockEnabled = false,
  lockOnDryRun = false,
  persistFailure = false,
  failureScope = "none",
} = {}) {
  return {
    runner: runner || "",
    family: family || "",
    dryRun: !!dryRun,
    localOnly: !!localOnly,
    force: !!force,
    lock: {
      enabled: !!lockEnabled,
      key: lockId || null,
      onDryRun: !!lockOnDryRun,
      shouldAcquire: !!lockEnabled && (!dryRun || !!lockOnDryRun) && !localOnly && !force,
    },
    failure: {
      persist: !!persistFailure,
      scope: failureScope || "none",
    },
  };
}

function resolveXExecutionPolicy({
  runner,
  dateLocal,
  dryRun = false,
  localOnly = false,
  force = false,
} = {}) {
  const slot = String(runner || "").trim().toLowerCase();
  const lockKey = slot && dateLocal ? `${slot}:${dateLocal}` : null;
  const persistFailure = slot === "morning" || slot === "resonance";
  return buildPolicy({
    runner: slot,
    family: "x",
    dryRun,
    localOnly,
    force,
    lockId: lockKey,
    lockEnabled: ["morning", "resonance", "night"].includes(slot),
    lockOnDryRun: false,
    persistFailure,
    failureScope: persistFailure ? "publish_or_build" : "none",
  });
}

function resolveInstagramExecutionPolicy({
  runner,
  dryRun = false,
  localOnly = false,
  force = false,
  slot = "",
  dateLocal = "",
  month = "",
} = {}) {
  const kind = String(runner || "").trim().toLowerCase();
  let lockId = null;
  if (kind === "post") {
    lockId = slot ? `ig_post_${slot}_${dateLocal}` : `ig_post_${dateLocal}`;
  } else if (kind === "monthly") {
    lockId = month ? `ig_monthly_${month}` : null;
  } else if (kind === "monthly_overview_reel") {
    lockId = month ? `ig_monthly_reel_${month}` : null;
  }

  return buildPolicy({
    runner: kind,
    family: "instagram",
    dryRun,
    localOnly,
    force,
    lockId,
    lockEnabled: kind === "post" || kind === "monthly" || kind === "monthly_overview_reel",
    lockOnDryRun: false,
    persistFailure: false,
    failureScope: "none",
  });
}

module.exports = {
  buildPolicy,
  resolveXExecutionPolicy,
  resolveInstagramExecutionPolicy,
};
