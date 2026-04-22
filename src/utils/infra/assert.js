"use strict";

function getPathValue(target, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), target);
}

function assertDeps(target, required = [], { label = "deps" } = {}) {
  for (const path of required) {
    if (getPathValue(target, path) === undefined) {
      throw new Error(`${label}.${path} is missing`);
    }
  }
}

module.exports = {
  assertDeps,
};
