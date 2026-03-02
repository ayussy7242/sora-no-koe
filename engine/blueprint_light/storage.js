"use strict";

const { getBlueprintLightPaths } = require("./paths");

function createBlueprintLightStorage({ bucket, urlExpireDays = 7 } = {}) {
  if (!bucket) throw new Error("bucket is required");

function normalizeVariantInput(input) {
  if (typeof input === "string") return input;
  if (input && typeof input === "object") return input.variant;
  return undefined;
}

async function existsPdf(lineUserId, variant) {
  const { pdfPath } = getBlueprintLightPaths(lineUserId, normalizeVariantInput(variant));
  if (!pdfPath) return { ok: false, code: "missing_line_user" };
  const file = bucket.file(pdfPath);
  const [exists] = await file.exists();
  return { ok: true, exists: !!exists, filePath: pdfPath, file };
}

  async function existsJson(lineUserId) {
    const { jsonPath } = getBlueprintLightPaths(lineUserId);
    if (!jsonPath) return { ok: false, code: "missing_line_user" };
    const file = bucket.file(jsonPath);
    const [exists] = await file.exists();
    return { ok: true, exists: !!exists, filePath: jsonPath, file };
  }

async function downloadJson(lineUserId) {
  const { jsonPath } = getBlueprintLightPaths(lineUserId);
    if (!jsonPath) return { ok: false, code: "missing_line_user" };
    const file = bucket.file(jsonPath);
    const [buf] = await file.download();
    return { ok: true, data: buf, filePath: jsonPath };
  }

  async function saveJson(lineUserId, content) {
    const { jsonPath } = getBlueprintLightPaths(lineUserId);
    if (!jsonPath) return { ok: false, code: "missing_line_user" };
    const file = bucket.file(jsonPath);
    await file.save(content, {
      contentType: "application/json",
      resumable: false,
    });
    return { ok: true, filePath: jsonPath };
  }

async function savePdf(lineUserId, buffer, variant) {
  const { pdfPath } = getBlueprintLightPaths(lineUserId, normalizeVariantInput(variant));
  if (!pdfPath) return { ok: false, code: "missing_line_user" };
  const file = bucket.file(pdfPath);
    await file.save(buffer, {
      contentType: "application/pdf",
      resumable: false,
      metadata: { cacheControl: "private, max-age=0, no-transform" },
    });
    return { ok: true, filePath: pdfPath };
  }

async function getSignedUrl(lineUserId, variant) {
  const { pdfPath } = getBlueprintLightPaths(lineUserId, normalizeVariantInput(variant));
  if (!pdfPath) return { ok: false, code: "missing_line_user" };
    const file = bucket.file(pdfPath);
    const [exists] = await file.exists();
    if (!exists) return { ok: false, code: "not_ready" };
    const expiresMs = urlExpireDays * 24 * 60 * 60 * 1000;
    try {
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + expiresMs,
        version: "v4",
      });
      return { ok: true, url };
    } catch (e) {
      const message = String(e?.message || e || "signing_failed");
      return { ok: false, code: "signing_failed", error: message };
    }
  }

  return {
    existsPdf,
    existsJson,
    downloadJson,
    saveJson,
    savePdf,
    getSignedUrl,
  };
}

module.exports = {
  createBlueprintLightStorage,
};
