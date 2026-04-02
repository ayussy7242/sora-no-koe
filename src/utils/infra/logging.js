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

function trimPreview(text, maxLen = 120) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const chars = Array.from(raw);
  if (chars.length <= maxLen) return raw;
  return chars.slice(0, Math.max(0, maxLen - 1)).join("") + "…";
}

function logAiGeneration(meta = {}) {
  const previewLimit = Number.isFinite(Number(meta.previewLimit)) ? Number(meta.previewLimit) : 120;
  const lastText = meta.lastText ? String(meta.lastText) : "";
  const payload = {
    layer: meta.layer || "ai_generate",
    channel: meta.channel || "",
    kind: meta.kind || "",
    ok: !!meta.ok,
    attempts: Number.isFinite(Number(meta.attempts)) ? Number(meta.attempts) : undefined,
    fallback: meta.fallback === true,
    reason: meta.reason || undefined,
    model: meta.model || undefined,
  };
  if (lastText) {
    payload.last_text_len = Array.from(lastText).length;
    payload.last_text_preview = trimPreview(lastText, previewLimit);
  }
  console.log("[ai]", payload);
}

module.exports = {
  memorySnapshot,
  getReqId,
  logWithReq,
  logAiGeneration,
};
