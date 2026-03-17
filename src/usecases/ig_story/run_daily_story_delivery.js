"use strict";

const path = require("path");
const { asOfIsoFromDateLocalJST, toDateLocalJST } = require("../../utils/time_utils");
const { generateIgStoryTexts } = require("./generate_story_texts");
const { renderStoryBackgroundSet } = require("../../renderers/ig_story/render_story_backgrounds");
const { formatIgStoryLinePayload } = require("./format_story_line_message");
const { sendIgStoryToLine } = require("./send_story_to_line");

function isYYYYMMDD(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDays(dateLocal, days = 1) {
  const base = new Date(`${dateLocal}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = `${base.getMonth() + 1}`.padStart(2, "0");
  const d = `${base.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function uploadStoryImages({
  storage,
  bucketName,
  dateLocal,
  buffers,
  expiresDays = 3,
} = {}) {
  if (!storage) throw new Error("storage missing");
  if (!bucketName) throw new Error("bucket missing");
  if (!Array.isArray(buffers) || buffers.length !== 3) throw new Error("buffers missing");

  const bucket = storage.bucket(bucketName);
  const urls = {};
  const paths = {};
  const expiresMs = Math.max(1, Number(expiresDays) || 3) * 24 * 60 * 60 * 1000;
  const names = ["today", "resonance", "tomorrow"];

  for (let i = 0; i < buffers.length; i++) {
    const key = names[i];
    const relPath = path.posix.join("ig", "story", String(dateLocal), `sora_story_${key}_${dateLocal}.png`);
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
    urls[key] = url;
    paths[key] = relPath;
  }

  return { ok: true, urls, paths, bucket: bucketName };
}

async function runDailyIgStoryDelivery(deps, opts = {}) {
  const env = deps?.env || {};
  const env2 = { ...(env || {}), ...(process.env || {}) };
  const storyService = deps?.storyService;
  const storage = deps?.storage;
  const dict = deps?.dict || require("../../content/dict");

  if (!storyService?.buildStoryForUser) throw new Error("storyService missing");
  if (!storage) throw new Error("storage missing");

  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const asOfISO = opts.asOfISO || asOfIsoFromDateLocalJST(dateLocal);
  const tomorrowLocal = addDays(dateLocal, 1);
  const asOfTomorrowISO = opts.asOfTomorrowISO || (tomorrowLocal ? asOfIsoFromDateLocalJST(tomorrowLocal) : asOfISO);
  const dryRun = opts.dryRun === true || opts.dry_run === true;

  const story = await storyService.buildStoryForUser({
    appUserId: "public",
    dateLocal,
    asOfISO,
    mode: "public",
  });
  const tomorrowStory = tomorrowLocal
    ? await storyService.buildStoryForUser({
        appUserId: "public",
        dateLocal: tomorrowLocal,
        asOfISO: asOfTomorrowISO,
        mode: "public",
      })
    : story;

  const storyTextsResult = await generateIgStoryTexts({
    dateLocal,
    story,
    tomorrowStory,
    dict,
    openai: {
      apiKey: env2.OPENAI_API_KEY,
      baseUrl: env2.OPENAI_BASE_URL,
      model: env2.OPENAI_MODEL,
    },
    maxRetries: 1,
    asOfISO,
    asOfTomorrowISO,
  });

  const buffers = await renderStoryBackgroundSet({
    story,
    dateLabel: String(dateLocal).replace(/-/g, "."),
  });

  const bucketName = env2.IG_GCS_BUCKET || env2.GCS_BUCKET_SORA || env2.GCS_BUCKET_BLUEPRINTS;
  const upload = await uploadStoryImages({
    storage,
    bucketName,
    dateLocal,
    buffers,
    expiresDays: env2.IG_IMAGE_URL_EXPIRES_DAYS || 3,
  });

  const payload = formatIgStoryLinePayload({
    dateLocal,
    images: upload.urls,
    storyTexts: storyTextsResult.story_texts,
  });

  const toLineUserId = env2.IG_STORY_DELIVERY_LINE_USER_ID || env2.OWNER_LINE_USER_ID;
  if (!toLineUserId) {
    return {
      ok: false,
      error: "IG_STORY_DELIVERY_LINE_USER_ID missing",
      date_local: dateLocal,
      story_texts: storyTextsResult.story_texts,
      images: upload.urls,
      dry_run: dryRun,
    };
  }

  const sendResult = await sendIgStoryToLine({
    env: env2,
    lineUserId: toLineUserId,
    payload,
    dryRun,
  });

  return {
    ok: true,
    date_local: dateLocal,
    dry_run: dryRun,
    story_texts: storyTextsResult.story_texts,
    images: upload.urls,
    gcs_paths: upload.paths,
    line: {
      to: toLineUserId,
      sent: sendResult.sent,
      dry_run: sendResult.dry_run,
    },
  };
}

module.exports = { runDailyIgStoryDelivery };
