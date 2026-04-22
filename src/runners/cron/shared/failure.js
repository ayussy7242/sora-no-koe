"use strict";

async function persistExecutionFailure({ policy, resultPolicy, persist, payload } = {}) {
  const shouldPersist = resultPolicy?.persistFailure ?? policy?.failure?.persist;
  if (!shouldPersist) return false;
  if (typeof persist !== "function") return false;
  await persist(payload);
  return true;
}

module.exports = {
  persistExecutionFailure,
};
