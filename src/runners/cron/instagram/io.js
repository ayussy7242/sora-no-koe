"use strict";

const path = require("path");
const sharp = require("sharp");
const { renderInstagramCarousel } = require("../../../engine/renderers/instagram/carousel");
const { writeBufferFiles, writeJsonFile } = require("../shared/io");
const { uploadGcsFiles, uploadGcsFile } = require("../../../utils/infra/gcs_upload");

function writeLocalCarousel({ buffers, outDir, prefix = "slide" } = {}) {
  if (!Array.isArray(buffers) || !buffers.length) return [];
  const items = buffers.map((buffer, idx) => ({
    filename: `${prefix}-${idx + 1}.png`,
    buffer,
  }));
  const result = writeBufferFiles({ outDir, items });
  return result.paths;
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

  const files = buffers.map((buffer, idx) => ({
    key: `slide-${idx + 1}`,
    index: idx + 1,
    filename: `slide-${idx + 1}.png`,
    buffer,
    contentType: "image/png",
  }));

  const upload = await uploadGcsFiles({
    storage,
    bucketName,
    basePath: path.posix.join("ig", "carousel", String(dateLocal)),
    files,
    expiresDays,
    defaultContentType: "image/png",
  });

  const urls = upload.items.map((item) => item.url);
  const paths = upload.items.map((item) => item.path);
  return { ok: true, items: upload.items, urls, paths, bucket: bucketName };
}

async function uploadCarouselSlide({
  storage,
  bucketName,
  dateLocal,
  buffer,
  index,
  contentType = "image/png",
  expiresDays = 7,
} = {}) {
  const t0 = Date.now();
  if (!storage) throw new Error("storage missing");
  if (!bucketName) throw new Error("bucket missing");
  if (!buffer) throw new Error("buffer missing");
  const item = await uploadGcsFile({
    storage,
    bucketName,
    basePath: path.posix.join("ig", "carousel", String(dateLocal)),
    filename: `slide-${index}.png`,
    buffer,
    contentType,
    index,
    key: `slide-${index}`,
    expiresDays,
  });
  console.log("[cron/ig/post] upload_slide", {
    index,
    ms: Date.now() - t0,
    bytes: buffer?.length || 0,
  });
  return item;
}

async function normalizeIgImage({
  buffer,
  format = "png",
  flatten = false,
  flattenBg = "#000000",
} = {}) {
  const fmt = String(format || "png").trim().toLowerCase();
  let pipeline = sharp(buffer, { failOn: "none" });
  if (flatten) {
    pipeline = pipeline.flatten({ background: flattenBg });
  }
  if (fmt === "jpg" || fmt === "jpeg") {
    const out = await pipeline.jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
    return { buffer: out, contentType: "image/jpeg" };
  }
  const out = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
  return { buffer: out, contentType: "image/png" };
}

async function renderAndUploadCarouselSlides({
  storage,
  bucketName,
  dateLocal,
  carousel,
  expiresDays = 7,
  backgroundCache = null,
  normalize = null,
} = {}) {
  if (!carousel) throw new Error("carousel missing");
  const t0 = Date.now();
  const items = [];
  console.log("[cron/ig/post] render_start");
  await renderInstagramCarousel({
    ...carousel,
    backgroundCache,
    onSlide: async ({ index, buffer }) => {
      const normalized = normalize
        ? await normalizeIgImage({ buffer, ...normalize })
        : { buffer, contentType: "image/png" };
      const uploaded = await uploadCarouselSlide({
        storage,
        bucketName,
        dateLocal,
        buffer: normalized.buffer,
        contentType: normalized.contentType,
        index: index + 1,
        expiresDays,
      });
      items.push(uploaded);
    },
  });
  console.log("[cron/ig/post] render_done", { ms: Date.now() - t0 });
  return {
    ok: true,
    items,
    urls: items.map((item) => item.url),
    paths: items.map((item) => item.path),
    bucket: bucketName,
  };
}

module.exports = {
  writeLocalCarousel,
  writeLocalJson,
  uploadCarouselSlides,
  uploadCarouselSlide,
  renderAndUploadCarouselSlides,
};
