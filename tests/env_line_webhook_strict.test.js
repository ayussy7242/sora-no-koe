"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function loadEnv(overrides) {
  const keys = Object.keys(overrides);
  const prev = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  delete require.cache[require.resolve("../src/config/env")];
  const env = require("../src/config/env");

  for (const key of keys) {
    if (prev[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = prev[key];
    }
  }
  delete require.cache[require.resolve("../src/config/env")];

  return env;
}

test("LINE_WEBHOOK_STRICT is forced on in production", () => {
  const env = loadEnv({ NODE_ENV: "production", LINE_WEBHOOK_STRICT: "0" });
  assert.equal(env.LINE_WEBHOOK_STRICT, true);
});

test("LINE_WEBHOOK_STRICT respects env in non-production", () => {
  const envOn = loadEnv({ NODE_ENV: "development", LINE_WEBHOOK_STRICT: "1" });
  assert.equal(envOn.LINE_WEBHOOK_STRICT, true);

  const envOff = loadEnv({ NODE_ENV: "development", LINE_WEBHOOK_STRICT: "0" });
  assert.equal(envOff.LINE_WEBHOOK_STRICT, false);
});
