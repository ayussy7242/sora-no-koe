"use strict";

async function withExecutionLock({ policy, acquire, onSkip, finalize = null } = {}, run) {
  let lease = null;
  try {
    if (policy?.lock?.shouldAcquire) {
      const lock = await acquire();
      if (!lock?.ok) {
        return typeof onSkip === "function" ? onSkip(lock) : lock;
      }
      lease = lock;
    }
    return await run(lease);
  } finally {
    if (typeof finalize === "function") {
      await finalize(lease);
    }
  }
}

module.exports = {
  withExecutionLock,
};
