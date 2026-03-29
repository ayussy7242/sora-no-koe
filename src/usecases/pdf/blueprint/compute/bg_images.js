"use strict";

const fs = require("fs");
const path = require("path");
const { buildBlueprintV25BgImages, buildStoryStub, BG_IMAGE_KEYS } = require("../../../../engine/pdf/blueprint_v25/backgrounds");

async function buildOrReuseV25BgImages({
  lineUserId,
  aiData,
  rowsMain,
  rowsExtra,
  elementCounts,
  dateLabel,
  allowRegenBg = true,
  blueprintStorage,
} = {}) {
  const bgKeys = BG_IMAGE_KEYS;
  const story = buildStoryStub({ rowsMain, rowsExtra, elementCounts, dateLabel });
  if (!allowRegenBg && blueprintStorage) {
    const signedBg = await blueprintStorage.getBgSignedUrls(lineUserId);
    const count = Object.keys(signedBg?.urls || {}).length;
    if (signedBg?.ok && count === bgKeys.length) {
      console.log("[blueprint] bg reuse", { lineUserId, count });
      return { bgImages: signedBg.urls, story, reused: true };
    }
  }

  const bgDir = path.join(process.cwd(), "tmp", "blueprint_bg", lineUserId);
  await buildBlueprintV25BgImages({
    blueprint: aiData,
    rowsMain,
    rowsExtra,
    elementCounts,
    dateLabel,
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
  let bgImages = null;
  if (blueprintStorage) {
    const signedBg = await blueprintStorage.getBgSignedUrls(lineUserId);
    if (signedBg?.ok && signedBg.urls) bgImages = signedBg.urls;
  }
  console.log("[blueprint] bg regen", { lineUserId, allowRegenBg });
  return { bgImages, story, reused: false };
}

module.exports = { buildOrReuseV25BgImages };
