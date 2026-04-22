"use strict";

async function withExecutionResultMarking({
  skip = null,
  markSuccess = null,
  markFailed = null,
  shouldMarkSuccess = (result) => !result?.skipped,
} = {}, run) {
  const skippedResult = typeof skip === "function" ? await skip() : skip;
  if (skippedResult) return skippedResult;

  try {
    const result = await run();
    if (typeof markSuccess === "function" && shouldMarkSuccess(result)) {
      await markSuccess(result);
    }
    return result;
  } catch (err) {
    if (typeof markFailed === "function") {
      await markFailed(err);
    }
    throw err;
  }
}

module.exports = {
  withExecutionResultMarking,
};
