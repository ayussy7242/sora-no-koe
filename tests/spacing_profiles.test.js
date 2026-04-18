"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeSpacing } = require("../src/presenters/format/spacing");

test("normalizeSpacing uses tighter blank-line rhythm for x", () => {
  const text = "header\n\n\n\nbody";
  assert.equal(normalizeSpacing(text, "x"), "header\n\nbody");
});

test("normalizeSpacing keeps wider blank-line rhythm for ig", () => {
  const text = "header\n\n\n\nbody";
  assert.equal(normalizeSpacing(text, "ig"), "header\n\n\nbody");
});
