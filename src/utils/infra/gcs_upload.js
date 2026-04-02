"use strict";

const path = require("path");

function resolveExpiresMs(expiresDays, fallbackDays = 7) {
  const days = Math.max(1, Number(expiresDays) || fallbackDays);
  return days * 24 * 60 * 60 * 1000;
}

async function uploadGcsFiles({
  storage,
  bucketName,
  basePath,
  files = [],
  expiresDays = 7,
  defaultContentType = "application/octet-stream",
} = {}) {
  if (!storage) throw new Error("storage missing");
  if (!bucketName) throw new Error("bucket missing");
  if (!Array.isArray(files) || files.length === 0) throw new Error("files missing");

  const bucket = storage.bucket(bucketName);
  const expiresMs = resolveExpiresMs(expiresDays, 7);
  const items = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i] || {};
    const filename = String(file.filename || "").trim();
    if (!filename) throw new Error("filename missing");
    const relPath = basePath ? path.posix.join(basePath, filename) : filename;
    const contentType = file.contentType || defaultContentType;
    const buffer = file.buffer;
    if (!buffer) throw new Error("buffer missing");

    const gcsFile = bucket.file(relPath);
    await gcsFile.save(buffer, {
      contentType,
      resumable: false,
      metadata: { cacheControl: "private, max-age=0, no-transform" },
    });

    const [url] = await gcsFile.getSignedUrl({
      action: "read",
      expires: Date.now() + expiresMs,
      version: "v4",
    });

    items.push({
      key: file.key || null,
      index: Number.isFinite(Number(file.index)) ? Number(file.index) : i + 1,
      path: relPath,
      url,
      contentType,
    });
  }

  return { ok: true, items, bucket: bucketName };
}

async function uploadGcsFile(opts = {}) {
  const res = await uploadGcsFiles({ ...opts, files: [opts] });
  return res.items[0];
}

async function saveGcsFile({
  storage,
  bucketName,
  path: filePath,
  buffer,
  contentType = "application/octet-stream",
  cacheControl = "private, max-age=0, no-transform",
} = {}) {
  if (!storage) throw new Error("storage missing");
  if (!bucketName) throw new Error("bucket missing");
  if (!filePath) throw new Error("path missing");
  if (!buffer) throw new Error("buffer missing");

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filePath);
  await file.save(buffer, {
    contentType,
    resumable: false,
    metadata: { cacheControl },
  });
  return { ok: true, path: filePath, bucket: bucketName, contentType };
}

async function fileExists({ storage, bucketName, path: filePath } = {}) {
  if (!storage) throw new Error("storage missing");
  if (!bucketName) throw new Error("bucket missing");
  if (!filePath) throw new Error("path missing");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filePath);
  const [exists] = await file.exists();
  return { ok: true, exists: !!exists, path: filePath };
}

async function getGcsSignedUrl({
  storage,
  bucketName,
  path: filePath,
  expiresDays = 7,
} = {}) {
  if (!storage) throw new Error("storage missing");
  if (!bucketName) throw new Error("bucket missing");
  if (!filePath) throw new Error("path missing");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filePath);
  const expiresMs = resolveExpiresMs(expiresDays, 7);
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresMs,
    version: "v4",
  });
  return { ok: true, url, path: filePath, bucket: bucketName };
}

module.exports = {
  uploadGcsFiles,
  uploadGcsFile,
  resolveExpiresMs,
  saveGcsFile,
  fileExists,
  getGcsSignedUrl,
};
