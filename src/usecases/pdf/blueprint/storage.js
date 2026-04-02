"use strict";

const { getBlueprintLightPaths, getBlueprintLightBgPaths } = require("./paths");
const { createStorageClient } = require("../../../utils/infra/gcs_storage");
const { saveGcsFile, getGcsSignedUrl, fileExists } = require("../../../utils/infra/gcs_upload");

function createBlueprintLightStorage({ bucketName, storage, env, urlExpireDays = 7 } = {}) {
  if (!bucketName) throw new Error("bucketName is required");

  let storageClientPromise = null;
  const getStorageClient = async () => {
    if (!storageClientPromise) storageClientPromise = createStorageClient({ storage, env });
    const storageClient = await storageClientPromise;
    if (!storageClient) throw new Error("storage missing");
    return storageClient;
  };
  const getBucket = async () => {
    const storageClient = await getStorageClient();
    return storageClient.bucket(bucketName);
  };

  function normalizeVariantInput(input) {
    if (typeof input === "string") return input;
    if (input && typeof input === "object") return input.variant;
    return undefined;
  }

  async function existsPdf(lineUserId, variant) {
    const { pdfPath } = getBlueprintLightPaths(lineUserId, normalizeVariantInput(variant));
    if (!pdfPath) return { ok: false, code: "missing_line_user" };
    const storageClient = await getStorageClient();
    const exists = await fileExists({ storage: storageClient, bucketName, path: pdfPath });
    return { ok: true, exists: !!exists.exists, filePath: pdfPath };
  }

  async function existsJson(lineUserId) {
    const { jsonPath } = getBlueprintLightPaths(lineUserId);
    if (!jsonPath) return { ok: false, code: "missing_line_user" };
    const storageClient = await getStorageClient();
    const exists = await fileExists({ storage: storageClient, bucketName, path: jsonPath });
    return { ok: true, exists: !!exists.exists, filePath: jsonPath };
  }

  async function downloadJson(lineUserId) {
    const { jsonPath } = getBlueprintLightPaths(lineUserId);
    if (!jsonPath) return { ok: false, code: "missing_line_user" };
    const bucket = await getBucket();
    const file = bucket.file(jsonPath);
    const [buf] = await file.download();
    return { ok: true, data: buf, filePath: jsonPath };
  }

  async function saveJson(lineUserId, content) {
    const { jsonPath } = getBlueprintLightPaths(lineUserId);
    if (!jsonPath) return { ok: false, code: "missing_line_user" };
    const storageClient = await getStorageClient();
    await saveGcsFile({
      storage: storageClient,
      bucketName,
      path: jsonPath,
      buffer: content,
      contentType: "application/json",
      cacheControl: "private, max-age=0, no-transform",
    });
    return { ok: true, filePath: jsonPath };
  }

  async function savePdf(lineUserId, buffer, variant) {
    const { pdfPath } = getBlueprintLightPaths(lineUserId, normalizeVariantInput(variant));
    if (!pdfPath) return { ok: false, code: "missing_line_user" };
    const storageClient = await getStorageClient();
    await saveGcsFile({
      storage: storageClient,
      bucketName,
      path: pdfPath,
      buffer,
      contentType: "application/pdf",
      cacheControl: "private, max-age=0, no-transform",
    });
    return { ok: true, filePath: pdfPath };
  }

  async function saveBgImage(lineUserId, key, buffer) {
    const { files } = getBlueprintLightBgPaths(lineUserId);
    const path = files?.[key];
    if (!path) return { ok: false, code: "missing_line_user" };
    const storageClient = await getStorageClient();
    await saveGcsFile({
      storage: storageClient,
      bucketName,
      path,
      buffer,
      contentType: "image/png",
      cacheControl: "public, max-age=31536000, immutable",
    });
    return { ok: true, filePath: path };
  }

  async function getBgMeta(lineUserId) {
    const { bgDir } = getBlueprintLightBgPaths(lineUserId);
    if (!bgDir) return { ok: false, code: "missing_line_user" };
    const path = `${bgDir}/bg_meta.json`;
    const bucket = await getBucket();
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) return { ok: true, exists: false, meta: null };
    try {
      const [buf] = await file.download();
      const raw = buf.toString("utf8");
      const meta = JSON.parse(raw);
      return { ok: true, exists: true, meta, filePath: path };
    } catch (e) {
      return { ok: false, code: "meta_read_failed", error: String(e?.message || e) };
    }
  }

  async function saveBgMeta(lineUserId, meta) {
    const { bgDir } = getBlueprintLightBgPaths(lineUserId);
    if (!bgDir) return { ok: false, code: "missing_line_user" };
    const path = `${bgDir}/bg_meta.json`;
    const body = JSON.stringify(meta || {}, null, 2);
    const storageClient = await getStorageClient();
    await saveGcsFile({
      storage: storageClient,
      bucketName,
      path,
      buffer: body,
      contentType: "application/json",
      cacheControl: "public, max-age=31536000, immutable",
    });
    return { ok: true, filePath: path };
  }

  async function getBgSignedUrls(lineUserId) {
    const { files } = getBlueprintLightBgPaths(lineUserId);
    if (!files) return { ok: false, code: "missing_line_user" };
    const storageClient = await getStorageClient();
    const out = {};
    const entries = Object.entries(files);
    for (const [key, filePath] of entries) {
      const exists = await fileExists({ storage: storageClient, bucketName, path: filePath });
      if (!exists.exists) continue;
      try {
        const signed = await getGcsSignedUrl({ storage: storageClient, bucketName, path: filePath, expiresDays: urlExpireDays });
        out[key] = signed.url;
      } catch (e) {
        return { ok: false, code: "signing_failed", error: String(e?.message || e) };
      }
    }
    return { ok: true, urls: out };
  }

  async function getSignedUrl(lineUserId, variant) {
    const { pdfPath } = getBlueprintLightPaths(lineUserId, normalizeVariantInput(variant));
    if (!pdfPath) return { ok: false, code: "missing_line_user" };
    const storageClient = await getStorageClient();
    const exists = await fileExists({ storage: storageClient, bucketName, path: pdfPath });
    if (!exists.exists) return { ok: false, code: "not_ready" };
    try {
      const signed = await getGcsSignedUrl({ storage: storageClient, bucketName, path: pdfPath, expiresDays: urlExpireDays });
      return { ok: true, url: signed.url };
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
    saveBgImage,
    getBgMeta,
    saveBgMeta,
    getBgSignedUrls,
    getSignedUrl,
  };
}

module.exports = {
  createBlueprintLightStorage,
};
