"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { safeEqual } = require("../src/utils/safe_equal");

test("safeEqual returns true for identical values", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual(123, "123"), true);
});

test("safeEqual returns false for mismatched values or length", () => {
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("short", "longer"), false);
  assert.equal(safeEqual("", "x"), false);
  assert.equal(safeEqual(null, "x"), false);
  assert.equal(safeEqual("x", undefined), false);
});
