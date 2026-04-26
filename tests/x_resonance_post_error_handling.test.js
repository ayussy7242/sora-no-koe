"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { classifyXError, resolveXMaxChars } = require("../src/runners/cron/x/utils");

test("classifyXError detects duplicate content from X API payload", () => {
  const err = new Error("X v2 post failed: 403 / {\"errors\":[{\"code\":187,\"message\":\"Status is a duplicate.\"}]}");
  err.status = 403;
  err.body = "{\"errors\":[{\"code\":187,\"message\":\"Status is a duplicate.\"}]}";

  const result = classifyXError(err);
  assert.equal(result.isDuplicateContent, true);
  assert.equal(result.kind, "duplicate_content");
  assert.equal(result.summary, "duplicate content");
});

test("classifyXError falls back to status summary for unknown errors", () => {
  const err = new Error("X v2 post failed: 503 / upstream timeout");
  err.status = 503;

  const result = classifyXError(err);
  assert.equal(result.isDuplicateContent, false);
  assert.equal(result.kind, "unknown");
  assert.equal(result.summary, "503");
});

test("resolveXMaxChars allows premium cap override via env", () => {
  const prevPremium = process.env.X_PREMIUM_ENABLED;
  const prevHardMax = process.env.X_HARD_MAX_CHARS;

  process.env.X_PREMIUM_ENABLED = "true";
  delete process.env.X_HARD_MAX_CHARS;

  try {
    assert.equal(resolveXMaxChars(500), 500);
    assert.equal(resolveXMaxChars(5000), 4000);
  } finally {
    if (prevPremium === undefined) delete process.env.X_PREMIUM_ENABLED;
    else process.env.X_PREMIUM_ENABLED = prevPremium;

    if (prevHardMax === undefined) delete process.env.X_HARD_MAX_CHARS;
    else process.env.X_HARD_MAX_CHARS = prevHardMax;
  }
});
