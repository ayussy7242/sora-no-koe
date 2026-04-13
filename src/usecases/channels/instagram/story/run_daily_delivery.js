"use strict";

const path = require("path");
const { createStorageClient } = require("../../../../utils/infra/gcs_storage");
const { asOfIsoFromDateLocalJST, toDateLocalJST, isYYYYMMDD } = require("../../../../utils/time");
const { resolveEnv } = require("../../../../utils/env");
const { writeBufferFiles, writeJsonFile } = require("../../../../utils/infra/local_io");
const { uploadGcsFiles } = require("../../../../utils/infra/gcs_upload");
const { generateIgStoryTexts } = require("./generate_texts");
const { renderStoryBackgroundSet } = require("../../../../engine/renderers/instagram/story/render_backgrounds");
const { buildCosmicSpaceConfig, applySpaceConfigBoost } = require("../../../../engine/shared/space_background");
const { formatIgStoryLinePayload } = require("./format_message");
const { sendIgStoryToLine } = require("./send_to_line");
const { runDailyBlog } = require("../../../../runners/cron/blog");
const { buildPublicStorySnapshot } = require("../../../story/store");
const { claimCronLock, markCronLockSuccess, markCronLockFailed } = require("../../../cron/lock_utils");

const IG_DENSITY_BOOST = 1.2;

function resolveStoryDensityBoost(env = {}) {
  const story = Number(env.IG_STORY_DENSITY_BOOST);
  if (Number.isFinite(story)) return story;
  const base = Number(env.IG_DENSITY_BOOST);
  if (Number.isFinite(base)) return base;
  return IG_DENSITY_BOOST * 2;
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

function normalizeElementKey(value) {
  const key = String(value || "").toLowerCase();
  return key === "fire" || key === "earth" || key === "air" || key === "water" ? key : "";
}

function elementFromSign(dict, signKey) {
  const key = String(signKey || "").toLowerCase();
  if (!key) return "";
  const signs = dict?.SIGNS_V2?.signs || dict?.SIGNS?.signs || {};
  return signs?.[key]?.element || "";
}

function buildResonanceSpaceConfig({ aspect, dict }) {
  if (!aspect) return null;
  const elementA = elementFromSign(dict, aspect?.a_sign_key || "");
  const elementB = elementFromSign(dict, aspect?.b_sign_key || "");
  if (!elementA && !elementB) return null;
  const hasBoth = elementA && elementB && elementA !== elementB;
  return {
    elementOverride: elementA || elementB,
    secondaryElementOverride: elementB || elementA || elementB,
    ...(hasBoth ? { forceSecondaryMix: true, secondaryMixRatio: 0.62 } : {}),
  };
}

function buildTodaySpaceConfig({ story, dict }) {
  const top = normalizeElementKey(story?.public?.sky_strata?.top_element || story?.meta?.sky_strata?.top_element || "");
  if (top) return { elementOverride: top };
  const moonKey = story?.public?.moon?.sign_key || story?.public?.transit_signs?.moon?.sign_key || "";
  const sunKey = story?.public?.transit_signs?.sun?.sign_key || "";
  const fallbackElement = elementFromSign(dict, moonKey) || elementFromSign(dict, sunKey);
  return fallbackElement ? { elementOverride: fallbackElement } : null;
}

function buildEventSpaceConfig({ event, dict, story }) {
  if (!event || !dict) return null;

  if (event.kind === "tight_aspect") {
    const elementA = elementFromSign(dict, event?.aSignKey || "");
    const elementB = elementFromSign(dict, event?.bSignKey || "");
    if (!elementA && !elementB) return null;
    const hasBoth = elementA && elementB && elementA !== elementB;
    return {
      elementOverride: elementA || elementB,
      secondaryElementOverride: elementB || elementA || elementB,
      ...(hasBoth ? { forceSecondaryMix: true, secondaryMixRatio: 0.62 } : {}),
    };
  }

  let signKey = event?.signKey || "";
  if (!signKey && event?.planetKey && story?.public?.transit_signs?.[event.planetKey]?.sign_key) {
    signKey = story.public.transit_signs[event.planetKey].sign_key;
  }
  const element = elementFromSign(dict, signKey);
  return element ? { elementOverride: element } : null;
}

function mergeSpaceConfig(base, override) {
  if (!override) return base || null;
  return { ...(base || {}), ...override };
}

function writeLocalStoryImages({ outDir, dateLocal, buffers }) {
  if (!Array.isArray(buffers) || buffers.length !== 3) throw new Error("buffers missing");
  const names = ["today", "resonance", "tomorrow"];
  const items = buffers.map((buffer, idx) => {
    const key = names[idx];
    return { key, filename: `sora_story_${key}_${dateLocal}.png`, buffer };
  });
  const result = writeBufferFiles({ outDir, items });
  return result.byKey;
}

function writeLocalStoryPayload({ outDir, dateLocal, storyTexts, payload }) {
  const storyTextsPath = writeJsonFile({
    outDir,
    filename: `story_texts_${dateLocal}.json`,
    data: storyTexts || {},
    space: 2,
  });
  const payloadPath = writeJsonFile({
    outDir,
    filename: `payload_${dateLocal}.json`,
    data: payload || {},
    space: 2,
  });
  return { story_texts_path: storyTextsPath, payload_path: payloadPath };
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

  const names = ["today", "resonance", "tomorrow"];
  const files = buffers.map((buffer, idx) => {
    const key = names[idx];
    return {
      key,
      index: idx + 1,
      filename: `sora_story_${key}_${dateLocal}.png`,
      buffer,
      contentType: "image/png",
    };
  });

  const upload = await uploadGcsFiles({
    storage,
    bucketName,
    basePath: path.posix.join("ig", "story", String(dateLocal)),
    files,
    expiresDays,
    defaultContentType: "image/png",
  });

  const urls = {};
  const paths = {};
  upload.items.forEach((item) => {
    if (item.key) {
      urls[item.key] = item.url;
      paths[item.key] = item.path;
    }
  });

  return { ok: true, items: upload.items, urls, paths, bucket: bucketName };
}

async function runDailyIgStoryDelivery(deps, opts = {}) {
  const env = deps?.env || {};
  const env2 = resolveEnv(env);
  const storyService = deps?.storyService;
  const storage = deps?.storage;
  const db = deps?.db;
  const admin = deps?.admin;
  const dict = deps?.dict || require("../../../../content/dict");

  if (!storyService?.buildStoryForUser) throw new Error("storyService missing");
  if (!db) throw new Error("db missing");

  const textOnly = opts.textOnly === true || opts.text_only === true;
  const localOnly = opts.local === true || opts.local_only === true || opts.localOnly === true || env2.IG_STORY_LOCAL_ONLY === true;
  const storageClient = await createStorageClient({ storage, env: env2 });

  if (!textOnly && !storageClient && !localOnly) throw new Error("storage missing");

  const dateLocal = isYYYYMMDD(opts.dateLocal) ? String(opts.dateLocal) : toDateLocalJST();
  const asOfNowISO = opts.asOfNowISO || new Date().toISOString();
  const asOfISO = opts.asOfISO || asOfIsoFromDateLocalJST(dateLocal);
  const tomorrowLocal = addDays(dateLocal, 1);
  const asOfTomorrowISO = opts.asOfTomorrowISO || (tomorrowLocal ? asOfIsoFromDateLocalJST(tomorrowLocal) : asOfISO);
  const dryRun = opts.dryRun === true || opts.dry_run === true;
  const runDry = dryRun || localOnly;
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.IG_STORY_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "ig", "story", dateLocal || "unknown")
  );
  const force =
    opts.force === true ||
    opts.force_lock === true ||
    opts.forceLock === true ||
    env2.IG_STORY_FORCE === true;

  const lockTtlMin = Number(env2.IG_STORY_LOCK_TTL_MIN || env2.IG_POST_LOCK_TTL_MIN || 30);
  const lockTtlMs = Number.isFinite(lockTtlMin) ? Math.max(1, lockTtlMin) * 60 * 1000 : 30 * 60 * 1000;
  let lockRef = null;

  if (!runDry && db && !force) {
    const lock = await claimCronLock({ db, admin, id: `ig_story_${dateLocal}`, ttlMs: lockTtlMs });
    if (!lock.ok) {
      return {
        ok: true,
        skipped: true,
        reason: lock.reason || "already_done",
        date_local: dateLocal,
        dry_run: runDry,
        text_only: textOnly,
      };
    }
    lockRef = lock.ref;
  }

  try {
    const { story } = await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false });
    const { story: nowStory } = await buildPublicStorySnapshot({
      storyService,
      dateLocal,
      asOfISO: asOfNowISO,
      save: false,
    });
    const tomorrowStory = tomorrowLocal
      ? (await buildPublicStorySnapshot({ storyService, dateLocal: tomorrowLocal, asOfISO: asOfTomorrowISO, save: false })).story
      : story;

    const blogResult = await runDailyBlog(
      { env: env2, storyService, db },
      { dateLocal, asOfISO, dryRun: runDry, publish: false }
    );

    const blogUrl = blogResult?.link || null;

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
      asOfNowISO,
      nowStory,
      resonanceMode: opts.resonanceMode,
    });

    if (blogUrl) {
      storyTextsResult.story_texts = storyTextsResult.story_texts || {};
      storyTextsResult.story_texts.resonance = {
        ...(storyTextsResult.story_texts.resonance || {}),
        blog_url: blogUrl,
      };
    }

    const lineUrl = env2.LINE_ADD_FRIEND_URL || "https://lin.ee/ZDjvxg8E";
    storyTextsResult.story_texts = storyTextsResult.story_texts || {};
    storyTextsResult.story_texts.tomorrow = {
      ...(storyTextsResult.story_texts.tomorrow || {}),
      line_url: lineUrl,
    };

    const bucketName = env2.IG_GCS_BUCKET || env2.GCS_BUCKET_SORA || env2.GCS_BUCKET_BLUEPRINTS;
    let upload = { ok: true, urls: {}, paths: {}, bucket: bucketName };
    if (!textOnly) {
      const baseSpaceConfig = applySpaceConfigBoost(
        buildCosmicSpaceConfig("cosmic_default"),
        { densityBoost: resolveStoryDensityBoost(env2) }
      );
      const todaySpace = mergeSpaceConfig(baseSpaceConfig, buildTodaySpaceConfig({ story, dict }));
      const resonanceAspect =
        storyTextsResult?.source?.resonance_aspect ||
        story?.outputs?.ig?.source?.resonance_aspect ||
        story?.public?.sky_top?.[0] ||
        story?.public?.sky_all?.[0] ||
        null;
      const resonanceSpace = mergeSpaceConfig(
        baseSpaceConfig,
        buildResonanceSpaceConfig({ aspect: resonanceAspect, dict })
      );
      const topEvent = storyTextsResult?.source?.tomorrow_events?.[0] || null;
      const tomorrowSpace = mergeSpaceConfig(
        baseSpaceConfig,
        buildEventSpaceConfig({ event: topEvent, dict, story: tomorrowStory })
      );
      const spaceConfigs = [todaySpace, resonanceSpace, tomorrowSpace];
      const buffers = await renderStoryBackgroundSet({
        story,
        dateLabel: String(dateLocal).replace(/-/g, "."),
        spaceConfigs,
      });
      if (localOnly) {
        const localPaths = writeLocalStoryImages({ outDir: localOutDir, dateLocal, buffers });
        upload = { ok: true, urls: localPaths, paths: localPaths, bucket: "local" };
      } else {
        upload = await uploadStoryImages({
          storage: storageClient,
          bucketName,
          dateLocal,
          buffers,
          expiresDays: env2.IG_IMAGE_URL_EXPIRES_DAYS || 3,
        });
      }
    }

    const payload = formatIgStoryLinePayload({
      dateLocal,
      images: upload.urls,
      storyTexts: storyTextsResult.story_texts,
      blogUrl,
      lineUrl,
    });

    if (localOnly) {
      const localFiles = writeLocalStoryPayload({
        outDir: localOutDir,
        dateLocal,
        storyTexts: storyTextsResult.story_texts,
        payload,
      });
      return {
        ok: true,
        date_local: dateLocal,
        dry_run: true,
        local_only: true,
        text_only: textOnly,
        story_texts: storyTextsResult.story_texts,
        blog_url: blogUrl,
        line_url: lineUrl,
        images: upload.urls,
        local_dir: localOutDir,
        local_paths: upload.paths,
        story_texts_path: localFiles.story_texts_path,
        payload_path: localFiles.payload_path,
      };
    }

    let sendResult = { ok: true, sent: 0, dry_run: true, skipped: true };
    let toLineUserId = null;
    if (!textOnly) {
      toLineUserId = env2.IG_STORY_DELIVERY_LINE_USER_ID || env2.OWNER_LINE_USER_ID;
      if (!toLineUserId) {
        const error = "IG_STORY_DELIVERY_LINE_USER_ID missing";
        if (lockRef) await markCronLockFailed({ ref: lockRef, admin, error });
        return {
          ok: false,
          error,
          date_local: dateLocal,
          story_texts: storyTextsResult.story_texts,
          images: upload.urls,
          dry_run: runDry,
        };
      }
      sendResult = await sendIgStoryToLine({
        env: env2,
        lineUserId: toLineUserId,
        payload,
        dryRun: runDry,
      });
    }

    const result = {
      ok: true,
      date_local: dateLocal,
      dry_run: runDry,
      text_only: textOnly,
      story_texts: storyTextsResult.story_texts,
      blog_url: blogUrl,
      line_url: lineUrl,
      images: upload.urls,
      gcs_paths: upload.paths,
      line: {
        to: toLineUserId,
        sent: sendResult.sent,
        dry_run: sendResult.dry_run,
        skipped: sendResult.skipped,
      },
    };

    if (lockRef) {
      await markCronLockSuccess({
        ref: lockRef,
        admin,
        extra: { date_local: dateLocal, sent: sendResult.sent || 0 },
      });
    }

    return result;
  } catch (e) {
    if (lockRef) {
      await markCronLockFailed({ ref: lockRef, admin, error: e?.message || String(e) });
    }
    throw e;
  }
}

module.exports = { runDailyIgStoryDelivery };
