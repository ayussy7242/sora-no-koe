"use strict";

function summarizeError(err) {
  return {
    message: err?.message || String(err),
    code: err?.code || err?.name || null,
  };
}

async function withCronExecution({ label, meta = null, onError = null } = {}, run) {
  const startedAt = Date.now();
  const startMeta = typeof meta === "function" ? (meta("start") || {}) : meta || {};
  console.log(`${label} start`, startMeta);

  try {
    const result = await run();
    const doneMeta = typeof meta === "function" ? (meta("done", result) || {}) : meta || {};
    console.log(`${label} done`, { ...doneMeta, ms: Date.now() - startedAt });
    return result;
  } catch (err) {
    const errorMeta = typeof meta === "function" ? (meta("error") || {}) : meta || {};
    console.error(`${label} error`, { ...errorMeta, ...summarizeError(err), ms: Date.now() - startedAt });
    if (typeof onError === "function") {
      await onError(err);
    }
    throw err;
  }
}

module.exports = {
  withCronExecution,
};
