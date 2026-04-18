"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeAspectKey } = require("../src/domain/canonical");
const {
  normalizeAspectType,
  isMajorAspect,
  isHardAspect,
} = require("../src/domain/aspect/canonical");

test("normalizeAspectType canonicalizes quincunx aliases", () => {
  assert.equal(normalizeAspectType("quincunx"), "quincunx_150");
  assert.equal(normalizeAspectType("inconjunct"), "quincunx_150");
});

test("normalizeAspectType canonicalizes suffix and spacing variants", () => {
  assert.equal(normalizeAspectType("trine_120"), "trine");
  assert.equal(normalizeAspectType("semi_square"), "semi_square_45");
  assert.equal(normalizeAspectType("semisquare"), "semi_square_45");
});

test("normalizeAspectType canonicalizes septile family aliases", () => {
  assert.equal(normalizeAspectType("septile"), "septile_family");
  assert.equal(normalizeAspectType("biseptile"), "septile_family");
});

test("isMajorAspect recognizes canonicalized major aspects", () => {
  assert.equal(isMajorAspect("trine_120"), true);
  assert.equal(isMajorAspect("opposition"), true);
  assert.equal(isMajorAspect("quincunx"), false);
});

test("isHardAspect classifies hard vs non-hard aspects", () => {
  assert.equal(isHardAspect("square"), true);
  assert.equal(isHardAspect("opposition"), true);
  assert.equal(isHardAspect("trine"), false);
});

test("normalizeAspectKey does not coerce empty aspect input to conjunction", () => {
  assert.equal(normalizeAspectKey(null, null), "");
  assert.equal(normalizeAspectKey("", undefined), "");
});
