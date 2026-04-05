"use strict";

const path = require("path");
const { renderInstagramCarousel } = require("../../../engine/renderers/instagram/carousel");
const { renderIGCaption } = require("../../../presenters/format/ig_caption");
const { toDateLocalJST, isYYYYMMDD } = require("../../../utils/time");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");
const { pickPreferredResonanceAspect } = require("../../../domain/resonance");
const { moonEventFlags } = require("../../../domain/moon");
const { generateIgDailyAiOutputs } = require("../../../usecases/channels/instagram/ai/daily");
const { generateIgMoonEventAiOutputs } = require("../../../usecases/channels/instagram/ai/moon_event");
const { buildPublicStorySnapshot } = require("../../../usecases/story/store");
const { ensureIgOutputs } = require("../../../usecases/story/output_helpers");
const { claimCronLock, markCronLockSuccess, markCronLockFailed } = require("../../../usecases/cron/lock_utils");
const {
  createImageContainer,
  createCarouselContainer,
  publishMedia,
  waitForContainer,
} = require("../../../integrations/instagram/graph");
const { createStorageClient } = require("../../../utils/infra/gcs_storage");
const { buildCarouselSlides } = require("./daily_slides");
const { buildMoonEventCarouselSlides } = require("./moon_event_slides");
const {
  resolveMoonEventTargetDateLocal,
  resolveMoonEventKind,
  detectMoonEventLocal,
  resolveMoonEventSpaceConfig,
  buildMoonEventCaption,
  pickMoonResonanceAspect,
} = require("./moon_event");
const {
  writeLocalCarousel,
  writeLocalJson,
  renderAndUploadCarouselSlides,
} = require("./io");

function resolveBackgroundCache(env = {}) {
  const enabledRaw = String(env.IG_BG_CACHE ?? "true").toLowerCase();
  const enabled = !["0", "false", "off", "no"].includes(enabledRaw);
  if (!enabled) return null;
  const forceRaw = String(env.IG_BG_CACHE_REFRESH ?? "false").toLowerCase();
  const force = ["1", "true", "yes", "on"].includes(forceRaw);
  const dir = env.IG_BG_CACHE_DIR || path.join(process.cwd(), "tmp", "ig", "bg_cache");
  return { dir, force };
}

function buildAspectKey(aspect, { includeOrb = false } = {}) {
  if (!aspect) return "";
  const a = String(aspect?.a || "").toLowerCase();
  const b = String(aspect?.b || "").toLowerCase();
  const deg = Number.isFinite(Number(aspect?.aspect_deg)) ? Number(aspect.aspect_deg) : "";
  const orb = includeOrb && Number.isFinite(Number(aspect?.orb_deg))
    ? Number(aspect.orb_deg).toFixed(2)
    : "";
  return [a, b, deg, orb].filter(Boolean).join("|");
}

function isIgTransientError(err) {
  const code = String(err?.code || "");
  if (code === "2") return true;
  const message = String(err?.message || "");
  if (message.includes("OAuthException 2") || message.includes("unexpected error")) return true;
  const detail = String(err?.detail || "");
  if (detail.includes("\"is_transient\":true")) return true;
  return false;
}

async function withIgRetry(fn, { retries = 2, delayMs = 1500, label = "" } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (!isIgTransientError(err) || attempt >= retries) throw err;
      const waitMs = delayMs * (attempt + 1);
      console.warn("[ig] transient error; retrying", {
        label,
        attempt: attempt + 1,
        wait_ms: waitMs,
        code: err?.code,
        message: err?.message,
      });
      await new Promise((r) => setTimeout(r, waitMs));
      attempt += 1;
    }
  }
}

async function runIgPost(deps, opts = {}) {
  const env = deps?.env || {};
  const env2 = resolveEnv(env);
  const storyService = deps?.storyService;
  const storage = deps?.storage;
  const storageClient = await createStorageClient({ storage, env: env2 });
  const db = deps?.db;
  const admin = deps?.admin;
  const dict = deps?.dict || require("../../../content/dict");

  if (!storyService?.buildStoryForUser) throw new Error("storyService missing");

  const now = opts.asOfISO ? new Date(opts.asOfISO) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("invalid as_of");
  const asOfISO = opts.asOfISO || now.toISOString();
  const dateLocal = opts.dateLocal || toDateLocalJST(now);
  const useAi = opts.useAi !== false;
  const withCta = opts.withCta !== false;
  const dryRun = opts.dryRun === true || env2.IG_POST_DRY_RUN === true;
  const waitTimeoutMs = Number.isFinite(Number(env2.IG_CONTAINER_TIMEOUT_MS))
    ? Number(env2.IG_CONTAINER_TIMEOUT_MS)
    : 240000;
  const mediaNormalize = toBool(env2.IG_MEDIA_NORMALIZE, false);
  const mediaFormat = String(env2.IG_MEDIA_FORMAT || "png");
  const mediaFlatten = toBool(env2.IG_MEDIA_FLATTEN, false);
  const mediaFlattenBg = String(env2.IG_MEDIA_FLATTEN_BG || "#000000");
  const mediaRetryCount = Number.isFinite(Number(env2.IG_MEDIA_RETRY_COUNT))
    ? Number(env2.IG_MEDIA_RETRY_COUNT)
    : 2;
  const mediaRetryDelayMs = Number.isFinite(Number(env2.IG_MEDIA_RETRY_DELAY_MS))
    ? Number(env2.IG_MEDIA_RETRY_DELAY_MS)
    : 1500;
  const localOnly = toBool(
    opts.local ?? opts.localOnly ?? opts.local_only ?? env2.IG_POST_LOCAL_ONLY,
    false
  );
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.IG_POST_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "ig", "post", dateLocal)
  );
  const backgroundCache = resolveBackgroundCache(env2);
  const proxyBase = String(env2.IG_PROXY_BASE_URL || env2.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  const useProxy = toBool(env2.IG_PROXY_ENABLED, false) && !!proxyBase;
  const force =
    opts.force === true ||
    opts.force_lock === true ||
    opts.forceLock === true ||
    env2.IG_POST_FORCE === true;

  const lockTtlMin = Number(env2.IG_POST_LOCK_TTL_MIN || 30);
  const lockTtlMs = Number.isFinite(lockTtlMin) ? Math.max(1, lockTtlMin) * 60 * 1000 : 30 * 60 * 1000;
  let lockRef = null;

  if (!dryRun && !localOnly && db && !force) {
    const lock = await claimCronLock({ db, admin, id: `ig_post_${dateLocal}`, ttlMs: lockTtlMs });
    if (!lock.ok) {
      return {
        ok: true,
        skipped: true,
        reason: lock.reason || "already_posted",
        date_local: dateLocal,
        as_of: asOfISO,
      };
    }
    lockRef = lock.ref;
  }

  let story;
  try {
    const tStory = Date.now();
    story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;
    console.log("[cron/ig/post] story_built", { ms: Date.now() - tStory });

    const igOut = ensureIgOutputs(story);
    const preferredAspect = pickPreferredResonanceAspect(story, { resonanceMode: opts.resonanceMode });
    if (preferredAspect) {
      igOut.source.resonance_aspect = preferredAspect;
      igOut.source.resonance_aspect_key = buildAspectKey(preferredAspect, { includeOrb: true });
    } else {
      igOut.source.resonance_aspect_key = "";
    }

    const tAi = Date.now();
    story = await generateIgDailyAiOutputs({
      story,
      dict,
      openai: {
        apiKey: env2.OPENAI_API_KEY,
        baseUrl: env2.OPENAI_BASE_URL,
        model: env2.OPENAI_MODEL,
      },
      asOfISO,
      useAi,
      forceAi: opts.forceAi,
    });
    console.log("[cron/ig/post] ai_done", { ms: Date.now() - tAi, useAi });

    const carousel = buildCarouselSlides({ story, dateLocal, withCta, dict });
    const topAspect = igOut?.source?.resonance_aspect || story?.public?.sky_top?.[0] || story?.public?.sky_all?.[0] || null;
    const caption = renderIGCaption(story);

    if (localOnly) {
      const buffers = await renderInstagramCarousel({ ...carousel, backgroundCache });
      const localPaths = writeLocalCarousel({ buffers, outDir: localOutDir, prefix: "slide" });
      const jsonPath = writeLocalJson({
        data: {
          ok: true,
          dry_run: true,
          local_only: true,
          date_local: dateLocal,
          as_of: asOfISO,
          resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
          resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
          resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
          slide3_display_aspect: topAspect || null,
          caption,
          carousel,
        },
        outDir: localOutDir,
        filename: "ig_post.json",
      });
      return {
        ok: true,
        dry_run: true,
        local_only: true,
        date_local: dateLocal,
        as_of: asOfISO,
        resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
        resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
        resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
        slide3_display_aspect: topAspect || null,
        ai_input_aspect: story?.outputs?.ig?.source?.resonance_aspect || null,
        caption,
        local_dir: localOutDir,
        local_paths: localPaths,
        local_json: jsonPath,
      };
    }

    const accessToken = env2.IG_ACCESS_TOKEN;
    const igUserId = env2.IG_USER_ID;
    const graphVersion = env2.IG_GRAPH_VERSION || "v19.0";
    if (!accessToken) throw new Error("IG_ACCESS_TOKEN missing");
    if (!igUserId) throw new Error("IG_USER_ID missing");
    if (!storageClient) throw new Error("storage missing");

    const bucketName = env2.IG_GCS_BUCKET || env2.GCS_BUCKET_SORA || env2.GCS_BUCKET_BLUEPRINTS;
    const tRender = Date.now();
    const upload = await renderAndUploadCarouselSlides({
      storage: storageClient,
      bucketName,
      dateLocal,
      carousel,
      expiresDays: env2.IG_IMAGE_URL_EXPIRES_DAYS,
      backgroundCache,
      normalize: mediaNormalize
        ? { format: mediaFormat, flatten: mediaFlatten, flattenBg: mediaFlattenBg }
        : null,
    });
    console.log("[cron/ig/post] render_upload_done", { ms: Date.now() - tRender });

    const imageUrls = useProxy
      ? upload.paths.map((p) => `${proxyBase}/ig/proxy?path=${encodeURIComponent(p)}`)
      : upload.urls;

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        date_local: dateLocal,
        as_of: asOfISO,
        resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
        resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
        resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
        slide3_display_aspect: topAspect || null,
        ai_input_aspect: story?.outputs?.ig?.source?.resonance_aspect || null,
        caption,
        image_urls: imageUrls,
        gcs_paths: upload.paths,
      };
    }

    const childIds = [];
    for (const imageUrl of imageUrls) {
      const created = await withIgRetry(
        () =>
          createImageContainer({
            igUserId,
            imageUrl,
            accessToken,
            version: graphVersion,
          }),
        { retries: mediaRetryCount, delayMs: mediaRetryDelayMs, label: "create_image_container" }
      );
      const childId = created?.id;
      if (!childId) throw new Error("child container id missing");
      const wait = await waitForContainer({
        creationId: childId,
        accessToken,
        version: graphVersion,
        timeoutMs: waitTimeoutMs,
      });
      if (!wait.ok) throw new Error(`child container not ready: ${childId}`);
      childIds.push(childId);
    }

    const carouselContainer = await withIgRetry(
      () =>
        createCarouselContainer({
          igUserId,
          children: childIds,
          caption,
          accessToken,
          version: graphVersion,
        }),
      { retries: mediaRetryCount, delayMs: mediaRetryDelayMs, label: "create_carousel_container" }
    );
    const creationId = carouselContainer?.id;
    if (!creationId) throw new Error("carousel container id missing");

    const tWait = Date.now();
    const waitCarousel = await waitForContainer({
      creationId,
      accessToken,
      version: graphVersion,
      timeoutMs: waitTimeoutMs,
    });
    console.log("[cron/ig/post] wait_carousel_done", { ms: Date.now() - tWait, ok: waitCarousel?.ok });
    if (!waitCarousel.ok) throw new Error(`carousel container not ready: ${creationId}`);

    const published = await withIgRetry(
      () =>
        publishMedia({
          igUserId,
          creationId,
          accessToken,
          version: graphVersion,
        }),
      { retries: mediaRetryCount, delayMs: mediaRetryDelayMs, label: "publish_media" }
    );

    const result = {
      ok: true,
      date_local: dateLocal,
      as_of: asOfISO,
      resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
      resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
      resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
      slide3_display_aspect: topAspect || null,
      ai_input_aspect: story?.outputs?.ig?.source?.resonance_aspect || null,
      caption,
      image_urls: upload.urls,
      gcs_paths: upload.paths,
      carousel_container_id: creationId,
      media_id: published?.id || null,
      child_container_ids: childIds,
    };

    if (lockRef) {
      await markCronLockSuccess({
        ref: lockRef,
        admin,
        extra: { date_local: dateLocal, media_id: result.media_id || null },
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

async function runIgMoonEventPost(deps, opts = {}) {
  const env = deps?.env || {};
  const env2 = resolveEnv(env);
  const storyService = deps?.storyService;
  const dict = deps?.dict || require("../../../content/dict");

  if (!storyService?.buildStoryForUser) throw new Error("storyService missing");

  const now = opts.asOfISO ? new Date(opts.asOfISO) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("invalid as_of");
  const asOfISO = opts.asOfISO || now.toISOString();

  const { offsetDays, targetDateLocal } = resolveMoonEventTargetDateLocal({ now, opts, env: env2 });
  const withCta = opts.withCta !== false;
  const dryRun = opts.dryRun === true || env2.IG_POST_DRY_RUN === true;
  const waitTimeoutMs = Number.isFinite(Number(env2.IG_CONTAINER_TIMEOUT_MS))
    ? Number(env2.IG_CONTAINER_TIMEOUT_MS)
    : 240000;
  const mediaNormalize = toBool(env2.IG_MEDIA_NORMALIZE, false);
  const mediaFormat = String(env2.IG_MEDIA_FORMAT || "png");
  const mediaFlatten = toBool(env2.IG_MEDIA_FLATTEN, false);
  const mediaFlattenBg = String(env2.IG_MEDIA_FLATTEN_BG || "#000000");
  const mediaRetryCount = Number.isFinite(Number(env2.IG_MEDIA_RETRY_COUNT))
    ? Number(env2.IG_MEDIA_RETRY_COUNT)
    : 2;
  const mediaRetryDelayMs = Number.isFinite(Number(env2.IG_MEDIA_RETRY_DELAY_MS))
    ? Number(env2.IG_MEDIA_RETRY_DELAY_MS)
    : 1500;
  const useAi = opts.useAi !== false;
  const forceAi = opts.forceAi === true;
  const backgroundCache = resolveBackgroundCache(env2);
  const proxyBase = String(env2.IG_PROXY_BASE_URL || env2.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  const useProxy = toBool(env2.IG_PROXY_ENABLED, false) && !!proxyBase;
  const localOnly = toBool(
    opts.local ?? opts.localOnly ?? opts.local_only ?? env2.IG_MOON_EVENT_LOCAL_ONLY,
    false
  );
  const forceNext = toBool(
    opts.forceNext ?? opts.force_next ?? opts.useNext ?? opts.use_next ?? env2.IG_MOON_EVENT_FORCE_NEXT,
    false
  );
  const { eventKind } = resolveMoonEventKind(opts);

  const event = detectMoonEventLocal({
    dateLocal: targetDateLocal,
    asOfISO,
    dict,
    forceNext,
    eventKind,
  });

  if (!event) {
    return {
      ok: true,
      dry_run: dryRun,
      date_local: targetDateLocal,
      as_of: asOfISO,
      skipped: true,
      reason: "moon_event_missing",
      date_offset_days: offsetDays,
    };
  }

  const moonFlags = moonEventFlags(event);
  const isFullMoonEvent = moonFlags.isFull;
  const isNewMoonEvent = moonFlags.isNew;
  const eventDateLocal = toDateLocalJST(event.date);
  const eventAsOfISO = event?.date instanceof Date ? event.date.toISOString() : asOfISO;

  const story = (await buildPublicStorySnapshot({ storyService, dateLocal: eventDateLocal, asOfISO: eventAsOfISO, save: false })).story;

  let summaryText = "";
  let moonPlacementText = "";
  let sunMoonText = "";
  let moonResonanceText = "";
  const baseCaption = buildMoonEventCaption(event);
  let caption = baseCaption;
  const moonResonanceAspect = pickMoonResonanceAspect(story);
  const aiOutputs = await generateIgMoonEventAiOutputs({
    story,
    dict,
    event,
    resonanceAspect: moonResonanceAspect,
    openai: {
      apiKey: env2.OPENAI_API_KEY,
      baseUrl: env2.OPENAI_BASE_URL,
      model: env2.OPENAI_MODEL,
    },
    useAi,
    baseCaption,
    forceAi,
  });
  summaryText = aiOutputs.summaryText;
  moonPlacementText = aiOutputs.moonPlacementText;
  sunMoonText = aiOutputs.sunMoonText;
  moonResonanceText = aiOutputs.moonResonanceText;
  caption = aiOutputs.caption;

  const carousel = buildMoonEventCarouselSlides({
    story,
    event,
    dateLocal: eventDateLocal,
    withCta,
    dict,
    summaryText,
    moonPlacementText,
    sunMoonText,
    moonResonanceText,
    moonResonanceAspect,
  });
  carousel.seedVariant = "moon_event";
  carousel.spaceConfig = resolveMoonEventSpaceConfig(event);

  if (localOnly) {
    const buffers = await renderInstagramCarousel({ ...carousel, backgroundCache });
    const localOutDir = String(
      opts.localOutDir ||
      opts.local_out_dir ||
      env2.IG_MOON_EVENT_LOCAL_OUT_DIR ||
      path.join(process.cwd(), "tmp", "ig-moon-event", eventDateLocal)
    );
    const localPaths = writeLocalCarousel({ buffers, outDir: localOutDir, prefix: "slide" });
    writeLocalJson({
      data: {
        ok: true,
        dry_run: true,
        local_only: true,
        date_local: eventDateLocal,
        as_of: asOfISO,
        event: {
          kind: event.kind,
          is_full: isFullMoonEvent,
          is_new: isNewMoonEvent,
          label: event.label,
          date_label: event.dateLabel,
        },
        caption,
        carousel,
      },
      outDir: localOutDir,
      filename: "ig_post.json",
    });
    return {
      ok: true,
      dry_run: true,
      local_only: true,
      date_local: eventDateLocal,
      as_of: asOfISO,
      event: {
        kind: event.kind,
        is_full: isFullMoonEvent,
        is_new: isNewMoonEvent,
        label: event.label,
        date_label: event.dateLabel,
      },
      caption,
      local_dir: localOutDir,
      local_paths: localPaths,
    };
  }

  const storage = deps?.storage;
  const storageClient = await createStorageClient({ storage, env: env2 });
  const accessToken = env2.IG_ACCESS_TOKEN;
  const igUserId = env2.IG_USER_ID;
  const graphVersion = env2.IG_GRAPH_VERSION || "v19.0";
  if (!storageClient) throw new Error("storage missing");
  if (!accessToken) throw new Error("IG_ACCESS_TOKEN missing");
  if (!igUserId) throw new Error("IG_USER_ID missing");

  const bucketName = env2.IG_GCS_BUCKET || env2.GCS_BUCKET_SORA || env2.GCS_BUCKET_BLUEPRINTS;
  const upload = await renderAndUploadCarouselSlides({
    storage: storageClient,
    bucketName,
    dateLocal: eventDateLocal,
    carousel,
    expiresDays: env2.IG_IMAGE_URL_EXPIRES_DAYS,
    backgroundCache,
    normalize: mediaNormalize
      ? { format: mediaFormat, flatten: mediaFlatten, flattenBg: mediaFlattenBg }
      : null,
  });

  // caption already resolved (AI or fallback)

  const imageUrls = useProxy
    ? upload.paths.map((p) => `${proxyBase}/ig/proxy?path=${encodeURIComponent(p)}`)
    : upload.urls;

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      date_local: eventDateLocal,
      as_of: asOfISO,
      event: {
        kind: event.kind,
        is_full: isFullMoonEvent,
        is_new: isNewMoonEvent,
        label: event.label,
        date_label: event.dateLabel,
      },
      caption,
      image_urls: imageUrls,
      gcs_paths: upload.paths,
    };
  }

  const childIds = [];
  for (const imageUrl of imageUrls) {
    const created = await withIgRetry(
      () =>
        createImageContainer({
          igUserId,
          imageUrl,
          accessToken,
          version: graphVersion,
        }),
      { retries: mediaRetryCount, delayMs: mediaRetryDelayMs, label: "create_image_container" }
    );
    const childId = created?.id;
    if (!childId) throw new Error("child container id missing");
    const wait = await waitForContainer({
      creationId: childId,
      accessToken,
      version: graphVersion,
      timeoutMs: waitTimeoutMs,
    });
    if (!wait.ok) throw new Error(`child container not ready: ${childId}`);
    childIds.push(childId);
  }

  const carouselContainer = await withIgRetry(
    () =>
      createCarouselContainer({
        igUserId,
        children: childIds,
        caption,
        accessToken,
        version: graphVersion,
      }),
    { retries: mediaRetryCount, delayMs: mediaRetryDelayMs, label: "create_carousel_container" }
  );
  const creationId = carouselContainer?.id;
  if (!creationId) throw new Error("carousel container id missing");

  const waitCarousel = await waitForContainer({
    creationId,
    accessToken,
    version: graphVersion,
    timeoutMs: waitTimeoutMs,
  });
  if (!waitCarousel.ok) throw new Error(`carousel container not ready: ${creationId}`);

  const published = await withIgRetry(
    () =>
      publishMedia({
        igUserId,
        creationId,
        accessToken,
        version: graphVersion,
      }),
    { retries: mediaRetryCount, delayMs: mediaRetryDelayMs, label: "publish_media" }
  );

  return {
    ok: true,
    date_local: eventDateLocal,
    as_of: asOfISO,
    event: {
      kind: event.kind,
      label: event.label,
      date_label: event.dateLabel,
    },
    caption,
    image_urls: upload.urls,
    gcs_paths: upload.paths,
    carousel_container_id: creationId,
    media_id: published?.id || null,
    child_container_ids: childIds,
  };
}

module.exports = { runIgPost, runIgMoonEventPost };
