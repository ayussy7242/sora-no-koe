"use strict";

const path = require("path");
const { renderInstagramCarousel } = require("../../../engine/renderers/instagram/carousel");
const { buildCosmicSpaceConfig, applySpaceConfigBoost } = require("../../../engine/shared/space_background");
const { toDateLocalJST } = require("../../../utils/time");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");
const { moonEventFlags } = require("../../../domain/moon");
const { generateIgMoonEventAiOutputs } = require("../../../usecases/channels/instagram/ai/moon_event");
const { buildPublicStorySnapshot } = require("../../../usecases/story/store");
const {
  createImageContainer,
  createCarouselContainer,
  publishMedia,
  waitForContainer,
} = require("../../../integrations/instagram/graph");
const { createStorageClient } = require("../../../utils/infra/gcs_storage");
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
const { withCronExecution } = require("../shared/execution");
const { resolveInstagramExecutionPolicy } = require("../shared/policy/execution");

const IG_DENSITY_BOOST = 1.2;

function resolveBackgroundCache(env = {}) {
  const enabledRaw = String(env.IG_BG_CACHE ?? "true").toLowerCase();
  const enabled = !["0", "false", "off", "no"].includes(enabledRaw);
  if (!enabled) return null;
  const forceRaw = String(env.IG_BG_CACHE_REFRESH ?? "false").toLowerCase();
  const force = ["1", "true", "yes", "on"].includes(forceRaw);
  const dir = env.IG_BG_CACHE_DIR || path.join(process.cwd(), "tmp", "ig", "bg_cache");
  return { dir, force };
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
  const policy = resolveInstagramExecutionPolicy({
    runner: "moon_event",
    slot: "moon_event",
    dateLocal: targetDateLocal,
    dryRun,
    localOnly,
    force: false,
  });

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

  return withCronExecution({
    label: "[cron/ig/moon_event]",
    meta: (phase, result) => {
      if (phase === "start") return { date_local: targetDateLocal, as_of: asOfISO, dry_run: dryRun, local_only: localOnly, event_kind: event?.kind || null };
      if (phase === "done") return { ok: result?.ok, date_local: result?.date_local || eventDateLocal, media_id: result?.media_id || null, event_kind: event?.kind || null, policy };
      return { date_local: targetDateLocal, as_of: asOfISO, dry_run: dryRun, local_only: localOnly, event_kind: event?.kind || null, policy };
    },
  }, async () => {
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
    const eventPreset = event?.kind === "new" ? "special_event_newmoon" : "cosmic_vivid";
    carousel.spaceConfig = applySpaceConfigBoost(
      buildCosmicSpaceConfig(eventPreset, resolveMoonEventSpaceConfig(event)),
      { densityBoost: IG_DENSITY_BOOST }
    );

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
  });
}

module.exports = { runIgMoonEventPost };
