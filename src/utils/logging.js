"use strict";

function mb(value) {
  return Number.isFinite(Number(value)) ? Math.round((Number(value) / 1024 / 1024) * 10) / 10 : null;
}

function memorySnapshot() {
  const m = process.memoryUsage ? process.memoryUsage() : {};
  return {
    rss_mb: mb(m.rss),
    heap_used_mb: mb(m.heapUsed),
    heap_total_mb: mb(m.heapTotal),
    external_mb: mb(m.external),
    array_buffers_mb: mb(m.arrayBuffers),
  };
}

function getReqId(req) {
  return req?.id || req?.headers?.["x-request-id"] || null;
}

function logWithReq(req, label, meta = {}) {
  const request_id = getReqId(req);
  console.log(label, { request_id, ...meta });
}

module.exports = {
  memorySnapshot,
  getReqId,
  logWithReq,
};
