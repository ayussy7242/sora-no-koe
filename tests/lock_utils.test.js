"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { claimCronLock } = require("../src/usecases/cron/lock_utils");

function createFakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    _store: store,
    collection() {
      return {
        doc(id) {
          return {
            id,
          };
        },
      };
    },
    async runTransaction(fn) {
      const tx = {
        async get(ref) {
          const data = store.get(ref.id);
          return {
            exists: Boolean(data),
            data: () => data,
          };
        },
        set(ref, data, opts) {
          const prev = store.get(ref.id) || {};
          store.set(ref.id, opts?.merge ? { ...prev, ...data } : data);
        },
      };
      return fn(tx);
    },
  };
}

test("claimCronLock acquires when no lock exists", async () => {
  const db = createFakeDb();
  const result = await claimCronLock({ db, id: "ig_post_2026-03-31", ttlMs: 1000 });
  assert.equal(result.ok, true);
  const saved = db._store.get("ig_post_2026-03-31");
  assert.equal(saved.status, "running");
});

test("claimCronLock skips when already running and not stale", async () => {
  const db = createFakeDb({
    "ig_post_2026-03-31": { status: "running", updated_at: Date.now() },
  });
  const result = await claimCronLock({ db, id: "ig_post_2026-03-31", ttlMs: 60 * 60 * 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "already_running");
});

test("claimCronLock skips when already success", async () => {
  const db = createFakeDb({
    "ig_post_2026-03-31": { status: "success", updated_at: Date.now() },
  });
  const result = await claimCronLock({ db, id: "ig_post_2026-03-31", ttlMs: 60 * 60 * 1000 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "already_done");
});
