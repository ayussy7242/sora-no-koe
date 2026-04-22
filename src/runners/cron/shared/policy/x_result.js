"use strict";

const RESULT_STATUS = {
  SUCCESS: "success",
  PARTIAL_SUCCESS: "partial_success",
  FAILED: "failed",
  SKIPPED_LOCK: "skipped_lock",
  SKIPPED_DUPLICATE: "skipped_duplicate",
};

const RESULT_REASON = {
  LOCK_NOT_ACQUIRED: "lock_not_acquired",
  DUPLICATE_CONTENT: "duplicate_content",
  AI_GENERATION_FAILED: "ai_generation_failed",
  BUILD_FAILED: "build_failed",
  PUBLISH_FAILED: "publish_failed",
  NO_CANDIDATE: "no_candidate",
};

function buildResultPolicy(status, reason = null) {
  return {
    status,
    reason,
    persistFailure: status === RESULT_STATUS.FAILED || status === RESULT_STATUS.PARTIAL_SUCCESS,
    markAsSuccess: status === RESULT_STATUS.SUCCESS || status === RESULT_STATUS.PARTIAL_SUCCESS,
  };
}

function resolveLockSkippedPolicy() {
  return buildResultPolicy(RESULT_STATUS.SKIPPED_LOCK, RESULT_REASON.LOCK_NOT_ACQUIRED);
}

function resolveDuplicateSkippedPolicy() {
  return buildResultPolicy(RESULT_STATUS.SKIPPED_DUPLICATE, RESULT_REASON.DUPLICATE_CONTENT);
}

function resolveFailedPolicy(reason = RESULT_REASON.PUBLISH_FAILED) {
  return buildResultPolicy(RESULT_STATUS.FAILED, reason);
}

function resolvePublishOutcomePolicy({ okCount = 0, errorCount = 0 } = {}) {
  if (Number(okCount) > 0 && Number(errorCount) === 0) {
    return buildResultPolicy(RESULT_STATUS.SUCCESS, null);
  }
  if (Number(okCount) > 0 && Number(errorCount) > 0) {
    return buildResultPolicy(RESULT_STATUS.PARTIAL_SUCCESS, RESULT_REASON.PUBLISH_FAILED);
  }
  return buildResultPolicy(RESULT_STATUS.FAILED, RESULT_REASON.PUBLISH_FAILED);
}

module.exports = {
  RESULT_STATUS,
  RESULT_REASON,
  buildResultPolicy,
  resolveLockSkippedPolicy,
  resolveDuplicateSkippedPolicy,
  resolveFailedPolicy,
  resolvePublishOutcomePolicy,
};
