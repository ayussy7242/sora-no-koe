"use strict";

const fs = require("fs");
const path = require("path");
const { toDateLocalJST } = require("../../../utils/time");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");
const { createStorageClient } = require("../../../utils/infra/gcs_storage");
const { uploadGcsFile } = require("../../../utils/infra/gcs_upload");
const { buildPublicStorySnapshot } = require("../../../usecases/story/store");
const { buildMonthlyOverviewReelPlan } = require("../../../usecases/channels/instagram/monthly_overview_reel");
const {
  renderMonthlyBackground,
  renderMonthlyOverviewFrame,
  renderMonthlyOverviewOutroFrame,
  exportMonthlyOverviewVideo,
} = require("../../../renderers/instagram/reel/monthly_overview");
const {
  createVideoContainer,
  publishMedia,
  waitForContainer,
} = require("../../../integrations/instagram/graph");
const { writeJsonFile, writeTextFile } = require("../shared/io");
const { claimCronLock, markCronLockSuccess, markCronLockFailed } = require("../../../usecases/cron/lock_utils");

function ensureDir(dir) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
}

function parseMonthFromDate(dateLocal) {
  if (!dateLocal) return "";
  const str = String(dateLocal);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str.slice(0, 7) : str;
}

function parseNumber(input, fallback) {
  const n = Number(input);
  return Number.isFinite(n) ? n : fallback;
}

async function runIgMonthlyOverviewReel(deps, opts = {}) {
  const env2 = resolveEnv(deps?.env || {});
  const storyService = deps?.storyService;
  const db = deps?.db;
  const admin = deps?.admin;
  const storage = deps?.storage;

  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");

  const now = opts.asOfISO ? new Date(opts.asOfISO) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("invalid as_of");
  const asOfISO = opts.asOfISO || now.toISOString();
  const dateLocal = opts.dateLocal || toDateLocalJST(now);
  const month = String(opts.month || parseMonthFromDate(dateLocal) || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("month must be YYYY-MM");

  const dryRun = toBool(opts.dryRun ?? env2.IG_REEL_DRY_RUN, false);
  const localOnly = toBool(opts.local ?? opts.localOnly ?? opts.local_only ?? env2.IG_REEL_LOCAL_ONLY, false);
  const inputFps = parseNumber(opts.fps ?? env2.IG_REEL_FPS, 2);
  const outroSeconds = parseNumber(opts.outroSeconds ?? env2.IG_REEL_OUTRO_SECONDS, 1.5);
  const outroEnabled = opts.outro !== undefined
    ? toBool(opts.outro, true)
    : toBool(env2.IG_REEL_OUTRO_ENABLED, true);
  const renderVideo = opts.video !== undefined ? toBool(opts.video, true) : true;
  const force =
    opts.force === true ||
    opts.force_lock === true ||
    opts.forceLock === true ||
    env2.IG_REEL_FORCE === true;

  const outDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.IG_REEL_OUT_DIR ||
    path.join(process.cwd(), "dist", "instagram", "monthly_overview_reel", month)
  );
  const framesDir = path.join(outDir, "frames");

  const lockTtlMin = Number(env2.IG_REEL_LOCK_TTL_MIN || 120);
  const lockTtlMs = Number.isFinite(lockTtlMin) ? Math.max(1, lockTtlMin) * 60 * 1000 : 2 * 60 * 60 * 1000;
  let lockRef = null;
  const lockId = `ig_monthly_reel_${month}`;

  if (!dryRun && !localOnly && db && !force) {
    const lock = await claimCronLock({ db, admin, id: lockId, ttlMs: lockTtlMs });
    if (!lock.ok) {
      return {
        ok: true,
        skipped: true,
        reason: lock.reason || "already_posted",
        month,
        date_local: dateLocal,
        as_of: asOfISO,
      };
    }
    lockRef = lock.ref;
  }

  try {
    ensureDir(outDir);
    ensureDir(framesDir);

    const baseDir = path.dirname(outDir);
    const plan = buildMonthlyOverviewReelPlan({ month, outputBaseDir: baseDir });
    if (plan.caption) {
      writeTextFile({ outDir, filename: "caption.txt", text: `${plan.caption}\n` });
    }

    const bgPath = path.join(outDir, "bg.png");
    const bgRender = await renderMonthlyBackground({ month });
    const bgBuffer = bgRender.buffer;
    fs.writeFileSync(bgPath, bgBuffer);

    for (const day of plan.days) {
      const { story } = await buildPublicStorySnapshot({
        storyService,
        dateLocal: day.dateLocal,
        asOfISO: day.asOfISO,
        save: false,
      });
      const buffer = await renderMonthlyOverviewFrame({
        story,
        month: plan.month,
        dayLabel: day.dayLabel,
        totalDays: day.totalDays,
        activeDay: day.dayIndex,
        wheelInput: day.wheelInput,
        backgroundBuffer: bgBuffer,
      });
      const file = path.join(framesDir, `frame_${String(day.dayIndex).padStart(4, "0")}.png`);
      fs.writeFileSync(file, buffer);
    }

    let outroFrames = 0;
    if (outroEnabled && outroSeconds > 0) {
      outroFrames = Math.max(1, Math.round(outroSeconds * inputFps));
      const outroBuffer = await renderMonthlyOverviewOutroFrame({
        month: plan.month,
        backgroundBuffer: bgBuffer,
      });
      for (let i = 0; i < outroFrames; i += 1) {
        const idx = plan.days.length + 1 + i;
        const file = path.join(framesDir, `frame_${String(idx).padStart(4, "0")}.png`);
        fs.writeFileSync(file, outroBuffer);
      }
    }

    let videoPath = null;
    if (renderVideo) {
      videoPath = path.join(outDir, `monthly_overview_reel_${month}.mp4`);
      await exportMonthlyOverviewVideo({
        framesDir,
        outputPath: videoPath,
        inputFps,
      });
    }

    const meta = {
      ok: true,
      month,
      date_local: dateLocal,
      as_of: asOfISO,
      fps: inputFps,
      outro_seconds: outroSeconds,
      outro_frames: outroFrames,
      total_days: plan.days.length,
      total_frames: plan.days.length + outroFrames,
      output_dir: outDir,
      frames_dir: framesDir,
      video_path: videoPath,
      caption: plan.caption || "",
      generated_at_utc: new Date().toISOString(),
    };
    writeJsonFile({ outDir, filename: "meta.json", data: meta, space: 2 });

    if (localOnly) {
      if (lockRef) await markCronLockSuccess(lockRef, { result: { ok: true, local_only: true } }).catch(() => {});
      return { ...meta, local_only: true, dry_run: dryRun };
    }

    let videoUrl = null;
    let uploadPath = null;
    if (renderVideo && storage) {
      const storageClient = await createStorageClient({ storage, env: env2 });
      const bucketName = env2.GCS_BUCKET_SORA || env2.GCS_BUCKET_BLUEPRINTS || null;
      if (!storageClient || !bucketName) {
        throw new Error("storage or bucket missing");
      }
      const buffer = fs.readFileSync(videoPath);
      const uploaded = await uploadGcsFile({
        storage: storageClient,
        bucketName,
        basePath: path.posix.join("ig", "reel", month),
        filename: path.basename(videoPath),
        buffer,
        contentType: "video/mp4",
        expiresDays: parseNumber(env2.IG_REEL_EXPIRES_DAYS, 7),
      });
      videoUrl = uploaded.url;
      uploadPath = uploaded.path;
    }

    if (!dryRun && renderVideo) {
      const accessToken = env2.IG_ACCESS_TOKEN;
      const igUserId = env2.IG_USER_ID;
      if (!accessToken) throw new Error("IG_ACCESS_TOKEN missing");
      if (!igUserId) throw new Error("IG_USER_ID missing");
      if (!videoUrl) throw new Error("video_url_missing");

      const mediaType = String(env2.IG_REEL_MEDIA_TYPE || "REELS");
      const shareToFeed = env2.IG_REEL_SHARE_TO_FEED !== undefined
        ? toBool(env2.IG_REEL_SHARE_TO_FEED, true)
        : true;
      const caption = String(plan.caption || "");

      const created = await createVideoContainer({
        igUserId,
        videoUrl,
        caption,
        accessToken,
        version: env2.IG_API_VERSION,
        mediaType,
        shareToFeed,
      });
      const creationId = created?.id || created?.creation_id || null;
      if (!creationId) throw new Error("IG creation_id missing");

      const wait = await waitForContainer({
        creationId,
        accessToken,
        version: env2.IG_API_VERSION,
        timeoutMs: parseNumber(env2.IG_CONTAINER_TIMEOUT_MS, 240000),
      });
      if (!wait?.ok) throw new Error(`IG container failed: ${wait?.error || "unknown"}`);

      const publish = await publishMedia({
        igUserId,
        creationId,
        accessToken,
        version: env2.IG_API_VERSION,
      });

      if (lockRef) {
        await markCronLockSuccess(lockRef, { result: { ok: true, publish } }).catch(() => {});
      }

      return {
        ...meta,
        video_url: videoUrl,
        upload_path: uploadPath,
        publish,
      };
    }

    if (lockRef) await markCronLockSuccess(lockRef, { result: { ok: true, dry_run: dryRun } }).catch(() => {});
    return {
      ...meta,
      video_url: videoUrl,
      upload_path: uploadPath,
      dry_run: dryRun,
    };
  } catch (err) {
    if (lockRef) {
      await markCronLockFailed(lockRef, { error: err?.message || String(err) }).catch(() => {});
    }
    throw err;
  }
}

module.exports = {
  runIgMonthlyOverviewReel,
};
