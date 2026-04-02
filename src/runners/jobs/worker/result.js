"use strict";

function buildNoJobResult(workerId) {
  return { ran: true, processed: 0, worker_id: workerId };
}

function buildOkResult(workerId, result = {}) {
  return {
    ran: true,
    ...result,
    worker_id: workerId,
  };
}

function buildLockErrorResult(workerId, error) {
  return {
    error: error?.message || String(error),
    worker_id: workerId,
  };
}

function buildJobFailedResult(workerId, jobId, error) {
  return {
    job_id: jobId,
    error: error?.message || String(error),
    worker_id: workerId,
  };
}

module.exports = {
  buildNoJobResult,
  buildOkResult,
  buildLockErrorResult,
  buildJobFailedResult,
};
