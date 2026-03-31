"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isYYYYMMDD,
  asOfIsoFromDateLocalJST,
  normalizeDateTimeLocalJST,
} = require("../src/utils/time_utils");

test("isYYYYMMDD validates date format", () => {
  assert.equal(isYYYYMMDD("2026-03-31"), true);
  assert.equal(isYYYYMMDD("2026-3-31"), false);
  assert.equal(isYYYYMMDD("2026/03/31"), false);
  assert.equal(isYYYYMMDD(""), false);
});

test("asOfIsoFromDateLocalJST uses JST noon in UTC", () => {
  assert.equal(asOfIsoFromDateLocalJST("2026-03-31"), "2026-03-31T03:00:00.000Z");
});

test("normalizeDateTimeLocalJST adds JST offset when missing", () => {
  assert.equal(
    normalizeDateTimeLocalJST("2026-01-23T18:10:00"),
    "2026-01-23T18:10:00+09:00"
  );
  assert.equal(
    normalizeDateTimeLocalJST("2026-01-23 18:10:00"),
    "2026-01-23T18:10:00+09:00"
  );
  assert.equal(
    normalizeDateTimeLocalJST("2026-01-23T18:10:00Z"),
    "2026-01-23T18:10:00Z"
  );
});
