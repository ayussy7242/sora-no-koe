"use strict";

const fs = require("fs");
const path = require("path");
const {
  buildBlueprintV25BgImages,
  buildStoryStub,
  BG_IMAGE_KEYS,
  buildCacheKey,
} = require("../../../../engine/pdf/blueprint_v25/backgrounds");
const { buildSpaceSeedLabel } = require("../../../../engine/shared/space_background");
const { isSpaceDebug } = require("../../../../engine/shared/space_background/utils");

async function buildOrReuseV25BgImages({
  lineUserId,
  aiData,
  rowsMain,
  rowsExtra,
  elementCounts,
  dateLabel,
  natalHash,
  allowRegenBg = true,
  blueprintStorage,
} = {}) {
  const bgKeys = BG_IMAGE_KEYS;
  const story = buildStoryStub({ rowsMain, rowsExtra, elementCounts, dateLabel });
  const cacheKey = buildCacheKey({ rowsMain, rowsExtra, elementCounts, dateLabel, natalHash });
  const seedLabel = buildSpaceSeedLabel({
    seedVersion: "v2",
    channel: "blueprint",
    userId: lineUserId,
    natalHash,
    prefixChannel: true,
  });
  const debug = isSpaceDebug();
  if (blueprintStorage) {
    const metaRes = await blueprintStorage.getBgMeta(lineUserId);
    if (metaRes?.ok && metaRes.exists && metaRes.meta?.cacheKey === cacheKey) {
      const signedBg = await blueprintStorage.getBgSignedUrls(lineUserId);
      const count = Object.keys(signedBg?.urls || {}).length;
      if (signedBg?.ok && count === bgKeys.length) {
        if (debug) {
          console.log("[blueprint] bg reuse", { lineUserId, count, cache: "meta", seedLabel });
        }
        return { bgImages: signedBg.urls, story, reused: true };
      }
    }
    if (!allowRegenBg) {
      const signedBg = await blueprintStorage.getBgSignedUrls(lineUserId);
      const count = Object.keys(signedBg?.urls || {}).length;
      if (signedBg?.ok && count === bgKeys.length) {
        if (debug) {
          console.log("[blueprint] bg reuse", { lineUserId, count, cache: "forced", seedLabel });
        }
        return { bgImages: signedBg.urls, story, reused: true };
      }
    }
  }

  const bgDir = path.join(process.cwd(), "tmp", "blueprint_bg", lineUserId);
  await buildBlueprintV25BgImages({
    blueprint: aiData,
    rowsMain,
    rowsExtra,
    elementCounts,
    dateLabel,
    natalHash,
    seedLabel,
    outDir: bgDir,
    inline: false,
  });
  const bgBuffers = {};
  bgKeys.forEach((key) => {
    const filePath = path.join(bgDir, `bg_${key}.png`);
    if (fs.existsSync(filePath)) {
      bgBuffers[key] = fs.readFileSync(filePath);
    }
  });
  for (const key of bgKeys) {
    const buf = bgBuffers[key];
    if (buf && blueprintStorage) await blueprintStorage.saveBgImage(lineUserId, key, buf);
  }
  if (blueprintStorage) {
    await blueprintStorage.saveBgMeta(lineUserId, { cacheKey, created_at: new Date().toISOString() });
  }
  let bgImages = null;
  if (blueprintStorage) {
    const signedBg = await blueprintStorage.getBgSignedUrls(lineUserId);
    if (signedBg?.ok && signedBg.urls) bgImages = signedBg.urls;
  }
  if (debug) {
    console.log("[blueprint] bg regen", { lineUserId, allowRegenBg, seedLabel });
  }
  return { bgImages, story, reused: false };
}

module.exports = { buildOrReuseV25BgImages };
