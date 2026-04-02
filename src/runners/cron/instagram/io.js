"use strict";

const path = require("path");
const { renderInstagramCarousel } = require("../../../engine/renderers/instagram/carousel");
const { writeBufferFile, writeJsonFile } = require("../shared/io");

function writeLocalCarousel({ buffers, outDir, prefix = "slide" } = {}) {
  if (!Array.isArray(buffers) || !buffers.length) return [];
  const paths = [];
  for (let i = 0; i < buffers.length; i++) {
    const filename = `${prefix}-${i + 1}.png`;
    const full = writeBufferFile({ outDir, filename, buffer: buffers[i] });
    if (full) paths.push(full);
  }
  return paths;
}

function writeLocalJson({ data, outDir, filename = "ig_post.json" } = {}) {
  return writeJsonFile({ outDir, filename, data, space: 2 });
}

async function uploadCarouselSlides({
  storage,
  bucketName,
  dateLocal,
  buffers,
  expiresDays = 7,
} = {}) {
  if (!storage) throw new Error("storage missing");
  if (!bucketName) throw new Error("bucket missing");
  if (!Array.isArray(buffers) || buffers.length === 0) throw new Error("buffers missing");

  const bucket = storage.bucket(bucketName);
  const urls = [];
  const paths = [];
  const expiresMs = Math.max(1, Number(expiresDays) || 7) * 24 * 60 * 60 * 1000;

  for (let i = 0; i < buffers.length; i++) {
    const index = i + 1;
    const relPath = path.posix.join("ig", "carousel", String(dateLocal), `slide-${index}.png`);
    const file = bucket.file(relPath);
    await file.save(buffers[i], {
      contentType: "image/png",
      resumable: false,
      metadata: { cacheControl: "private, max-age=0, no-transform" },
    });
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + expiresMs,
      version: "v4",
    });
    urls.push(url);
    paths.push(relPath);
  }

  return { ok: true, urls, paths, bucket: bucketName };
}

async function uploadCarouselSlide({
  storage,
  bucketName,
  dateLocal,
  buffer,
  index,
  expiresDays = 7,
} = {}) {
  const t0 = Date.now();
  if (!storage) throw new Error("storage missing");
  if (!bucketName) throw new Error("bucket missing");
  if (!buffer) throw new Error("buffer missing");
  const bucket = storage.bucket(bucketName);
  const expiresMs = Math.max(1, Number(expiresDays) || 7) * 24 * 60 * 60 * 1000;
  const relPath = path.posix.join("ig", "carousel", String(dateLocal), `slide-${index}.png`);
  const file = bucket.file(relPath);
  await file.save(buffer, {
    contentType: "image/png",
    resumable: false,
    metadata: { cacheControl: "private, max-age=0, no-transform" },
  });
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresMs,
    version: "v4",
  });
  console.log("[cron/ig/post] upload_slide", {
    index,
    ms: Date.now() - t0,
    bytes: buffer?.length || 0,
  });
  return { url, path: relPath };
}

async function renderAndUploadCarouselSlides({
  storage,
  bucketName,
  dateLocal,
  carousel,
  expiresDays = 7,
  backgroundCache = null,
} = {}) {
  if (!carousel) throw new Error("carousel missing");
  const t0 = Date.now();
  const urls = [];
  const paths = [];
  console.log("[cron/ig/post] render_start");
  await renderInstagramCarousel({
    ...carousel,
    backgroundCache,
    onSlide: async ({ index, buffer }) => {
      const uploaded = await uploadCarouselSlide({
        storage,
        bucketName,
        dateLocal,
        buffer,
        index: index + 1,
        expiresDays,
      });
      urls.push(uploaded.url);
      paths.push(uploaded.path);
    },
  });
  console.log("[cron/ig/post] render_done", { ms: Date.now() - t0 });
  return { ok: true, urls, paths, bucket: bucketName };
}

module.exports = {
  writeLocalCarousel,
  writeLocalJson,
  uploadCarouselSlides,
  uploadCarouselSlide,
  renderAndUploadCarouselSlides,
};
