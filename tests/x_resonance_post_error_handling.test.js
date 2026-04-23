"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { classifyXError } = require("../src/runners/cron/x/utils");

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
