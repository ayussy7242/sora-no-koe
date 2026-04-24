"use strict";

const path = require("path");
const { renderInstagramCarousel } = require("../../../engine/renderers/instagram/carousel");
const { buildCosmicSpaceConfig, applySpaceConfigBoost } = require("../../../engine/shared/space_background");
const { renderIGCaption, renderIGCaptionVariant } = require("../../../presenters/format/ig_caption");
const { toDateLocalJST } = require("../../../utils/time");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");
const {
  pickPreferredResonanceAspect,
  pickResonanceForInstagram,
  resolveResonanceMode,
} = require("../../../domain/resonance");
const { normalizeBodyKey } = require("../../../domain/canonical");
const { CORE_PLANETS } = require("../../../domain/astro/constants");
const { generateIgDailyAiOutputs } = require("../../../usecases/channels/instagram/ai/daily");
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
const {
  buildMorningCarouselSlides,
  buildResonanceCarouselSlides,
  buildNightCarouselSlides,
} = require("./slot_slides");
const {
  writeLocalCarousel,
  writeLocalJson,
  renderAndUploadCarouselSlides,
} = require("./io");
const { withCronExecution } = require("../shared/execution");
const { resolveInstagramExecutionPolicy } = require("../shared/policy/execution");
const { withExecutionLock } = require("../shared/lock");
const { withExecutionResultMarking } = require("../shared/marking");
const { resolveInstagramPostOptions } = require("./options");

const IG_DENSITY_BOOST = 1.2;

function resolveDensityBoost(env = {}, slotKey = "") {
  const base = Number(env.IG_DENSITY_BOOST);
  if (slotKey === "night") {
    const night = Number(env.IG_NIGHT_DENSITY_BOOST);
    if (Number.isFinite(night)) return night;
    if (Number.isFinite(base)) return base;
    return IG_DENSITY_BOOST * 2;
  }
  if (Number.isFinite(base)) return base;
  return IG_DENSITY_BOOST;
}

function resolveBackgroundCache(env = {}) {
  const enabledRaw = String(env.IG_BG_CACHE ?? "true").toLowerCase();
  const enabled = !["0", "false", "off", "no"].includes(enabledRaw);
  if (!enabled) return null;
  const forceRaw = String(env.IG_BG_CACHE_REFRESH ?? "false").toLowerCase();
  const force = ["1", "true", "yes", "on"].includes(forceRaw);
  const dir = env.IG_BG_CACHE_DIR || path.join(process.cwd(), "tmp", "ig", "bg_cache");
  return { dir, force };
}

function isMajorAspectDeg(deg) {
  if (!Number.isFinite(Number(deg))) return false;
  const d = Math.round(Number(deg));
  return d === 0 || d === 60 || d === 90 || d === 120 || d === 180;
}

function isCorePairCandidate(candidate) {
  const aKey = normalizeBodyKey(candidate?.a || "");
  const bKey = normalizeBodyKey(candidate?.b || "");
  if (!aKey || !bKey) return false;
  return CORE_PLANETS.includes(aKey) && CORE_PLANETS.includes(bKey);
}

function buildResonanceDebug({ item, list, resonanceMode } = {}) {
  const normalize = (it) => ({
    key: it?.key || "",
    types: it?.types || [],
    score: it?.score ?? null,
    reasons: it?.reasons || [],
    channel_bias: it?.channel_bias || null,
    orb: it?.flags?.orb ?? null,
    a: it?.candidate?.a || null,
    b: it?.candidate?.b || null,
    aspect_deg: it?.candidate?.aspect_deg ?? null,
    a_sign_key: it?.candidate?.a_sign_key || null,
    b_sign_key: it?.candidate?.b_sign_key || null,
  });
  const topItems = Array.isArray(list) ? list.slice(0, 5) : [];
  const top = topItems.map(normalize);
  const picked = item ? normalize(item) : null;
  const stats = {
    resonance_mode: resonanceMode || null,
    count_candidates: Array.isArray(list) ? list.length : 0,
    count_major_aspect: Array.isArray(list)
      ? list.filter((row) => isMajorAspectDeg(row?.candidate?.aspect_deg)).length
      : 0,
    count_core_pair: Array.isArray(list)
      ? list.filter((row) => isCorePairCandidate(row?.candidate)).length
      : 0,
    count_major_aspect_in_top: topItems.filter((row) => isMajorAspectDeg(row?.candidate?.aspect_deg)).length,
    count_core_pair_in_top: topItems.filter((row) => isCorePairCandidate(row?.candidate)).length,
  };
  return { picked, list: top, stats };
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

async function createChildContainerWithFallback({
  igUserId,
  accessToken,
  graphVersion,
  waitTimeoutMs,
  mediaRetryCount,
  mediaRetryDelayMs,
  imageUrl,
  fallbackImageUrl = "",
  index = 0,
} = {}) {
  async function createAndWait(targetUrl, { source = "primary" } = {}) {
    const created = await withIgRetry(
      () =>
        createImageContainer({
          igUserId,
          imageUrl: targetUrl,
          accessToken,
          version: graphVersion,
        }),
      { retries: mediaRetryCount, delayMs: mediaRetryDelayMs, label: `create_image_container:${source}` }
    );
    const childId = created?.id;
    if (!childId) throw new Error(`child container id missing (${source})`);
    const wait = await waitForContainer({
      creationId: childId,
      accessToken,
      version: graphVersion,
      timeoutMs: waitTimeoutMs,
    });
    if (!wait.ok) {
      const stageError = new Error(`child container not ready: ${childId}`);
      stageError.stage = "wait_child_container";
      stageError.source = source;
      stageError.childId = childId;
      stageError.status = wait?.status || null;
      throw stageError;
    }
    return { childId, source, status: wait?.status || null };
  }

  try {
    return await createAndWait(imageUrl, { source: "signed_url" });
  } catch (err) {
    const canFallback = fallbackImageUrl && fallbackImageUrl !== imageUrl;
    console.warn("[cron/ig/post] child_container_failed", {
      index,
      source: err?.source || "signed_url",
      stage: err?.stage || "create_child_container",
      child_id: err?.childId || null,
      message: err?.message || String(err),
      status: err?.status || null,
      can_fallback: canFallback,
    });
    if (!canFallback) throw err;
  }

  console.warn("[cron/ig/post] retry_with_proxy", { index });
  return createAndWait(fallbackImageUrl, { source: "proxy_url" });
}

async function runIgPost(deps, opts = {}) {
  const env = deps?.env || {};
  const runOpts = resolveInstagramPostOptions({ env, opts });
  const {
    env2,
    asOfISO,
    dateLocal,
    slotKey,
    useAi,
    withCta,
    dryRun,
    localOnly,
    localOutDir,
    force,
  } = runOpts;
  const storyService = deps?.storyService;
  const storage = deps?.storage;
  const storageClient = await createStorageClient({ storage, env: env2 });
  const db = deps?.db;
  const admin = deps?.admin;
  const dict = deps?.dict || require("../../../content/dict");

  if (!storyService?.buildStoryForUser) throw new Error("storyService missing");
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
  const backgroundCache = resolveBackgroundCache(env2);
  const proxyBase = String(env2.IG_PROXY_BASE_URL || env2.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  const useProxy = toBool(env2.IG_PROXY_ENABLED, false) && !!proxyBase;
  const forceMorningJpeg = toBool(env2.IG_MORNING_FORCE_JPEG, true);

  const lockTtlMin = Number(env2.IG_POST_LOCK_TTL_MIN || 30);
  const lockTtlMs = Number.isFinite(lockTtlMin) ? Math.max(1, lockTtlMin) * 60 * 1000 : 30 * 60 * 1000;
  let lockRef = null;
  const lockId = slotKey ? `ig_post_${slotKey}_${dateLocal}` : `ig_post_${dateLocal}`;
  const policy = resolveInstagramExecutionPolicy({
    runner: "post",
    slot: slotKey || "",
    dateLocal,
    dryRun,
    localOnly,
    force,
  });

  const lockOutcome = await withExecutionLock({
    policy,
    acquire: () => claimCronLock({ db, admin, id: lockId, ttlMs: lockTtlMs }),
    onSkip: (lock) => ({
      ok: true,
      skipped: true,
      reason: lock.reason || "already_posted",
      date_local: dateLocal,
      as_of: asOfISO,
    }),
  }, async (lock) => {
    lockRef = lock?.ref || null;
    return null;
  });
  if (lockOutcome) return lockOutcome;

  let story;
  return withExecutionResultMarking({
    markSuccess: async (result) => {
      if (lockRef) {
        await markCronLockSuccess({
          ref: lockRef,
          admin,
          extra: { date_local: dateLocal, media_id: result?.media_id || null },
        });
      }
    },
    markFailed: async (e) => {
      if (lockRef) {
        await markCronLockFailed({ ref: lockRef, admin, error: e?.message || String(e) });
      }
    },
  }, () => withCronExecution({
    label: "[cron/ig/post]",
    meta: (phase, result) => {
      if (phase === "start") return { slot: slotKey || "morning", date_local: dateLocal, as_of: asOfISO, dry_run: dryRun, local_only: localOnly, use_ai: useAi };
      if (phase === "done") return { ok: result?.ok, slot: slotKey || "morning", date_local: dateLocal, media_id: result?.media_id || null, policy };
      return { slot: slotKey || "morning", date_local: dateLocal, as_of: asOfISO, dry_run: dryRun, local_only: localOnly, policy };
    },
  }, async () => {
    const tStory = Date.now();
    story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;
    console.log("[cron/ig/post] story_built", { ms: Date.now() - tStory });

    const igOut = ensureIgOutputs(story);
    const skyTop = Array.isArray(story?.public?.sky_top) ? story.public.sky_top : [];
    const skyAll = Array.isArray(story?.public?.sky_all) ? story.public.sky_all : [];
    const resonanceMode = resolveResonanceMode(story, opts.resonanceMode);
    const { item: preferredItem, list: importantList } = pickResonanceForInstagram({
      story,
      dict,
      candidates: [...skyTop, ...skyAll],
      skyTop,
    });
    const resonanceDebug = buildResonanceDebug({
      item: preferredItem,
      list: importantList,
      resonanceMode,
    });
    const preferredAspect =
      igOut?.source?.resonance_aspect ||
      preferredItem?.candidate ||
      pickPreferredResonanceAspect(story, { resonanceMode: opts.resonanceMode });
    if (preferredAspect) {
      igOut.source.resonance_aspect = preferredAspect;
      igOut.source.resonance_aspect_key = buildAspectKey(preferredAspect, { includeOrb: true });
      if (!igOut.source.resonance_aspect_key_used) {
        igOut.source.resonance_aspect_key_used = igOut.source.resonance_aspect_key || "";
      }
    } else {
      igOut.source.resonance_aspect_key = "";
    }

    const tAi = Date.now();
    const aiVariant =
      opts.aiVariant ||
      opts.ai_variant ||
      (slotKey === "resonance" ? "split" : slotKey === "night" ? "night" : undefined);
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
      variant: aiVariant,
      slot: slotKey || "",
    });
    console.log("[cron/ig/post] ai_done", { ms: Date.now() - tAi, useAi });

    const carousel = slotKey === "morning"
      ? buildMorningCarouselSlides({ story, dateLocal, withCta, dict })
      : slotKey === "resonance"
        ? buildResonanceCarouselSlides({ story, dateLocal, dict })
        : slotKey === "night"
          ? buildNightCarouselSlides({ story, dateLocal, dict })
          : buildMorningCarouselSlides({ story, dateLocal, withCta, dict });
    if (slotKey) {
      carousel.seedVariant = slotKey;
    }
    const presetName = slotKey === "morning"
      ? "cosmic_vivid"
      : slotKey === "night"
        ? "special_crimson"
        : "cosmic_crimson";
    carousel.spaceConfig = applySpaceConfigBoost(
      buildCosmicSpaceConfig(presetName, carousel.spaceConfig),
      { densityBoost: resolveDensityBoost(env2, slotKey) }
    );
    const topAspect = igOut?.source?.resonance_aspect || story?.public?.sky_top?.[0] || story?.public?.sky_all?.[0] || null;
    const caption = slotKey
      ? (renderIGCaptionVariant(story, { dict, variant: slotKey }) || renderIGCaption(story, { dict }))
      : renderIGCaption(story, { dict });

    if (localOnly) {
      const buffers = await renderInstagramCarousel({ ...carousel, backgroundCache });
      const localPaths = writeLocalCarousel({ buffers, outDir: localOutDir, prefix: "slide" });
      const jsonPath = writeLocalJson({
        data: {
          ok: true,
          dry_run: true,
          local_only: true,
          slot: slotKey || "morning",
          date_local: dateLocal,
          as_of: asOfISO,
          resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
          resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
          resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
          slide3_display_aspect: topAspect || null,
          caption,
          carousel,
          resonance_debug: resonanceDebug,
        },
        outDir: localOutDir,
        filename: "ig_post.json",
      });
      return {
        ok: true,
        dry_run: true,
        local_only: true,
        slot: slotKey || "morning",
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
        resonance_debug: resonanceDebug,
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
      normalize: (mediaNormalize || (slotKey === "morning" && forceMorningJpeg))
        ? {
            format: slotKey === "morning" && forceMorningJpeg ? "jpeg" : mediaFormat,
            flatten: slotKey === "morning" && forceMorningJpeg ? true : mediaFlatten,
            flattenBg: mediaFlattenBg,
          }
        : null,
    });
    console.log("[cron/ig/post] render_upload_done", { ms: Date.now() - tRender });

    const directImageUrls = upload.urls;
    const proxyImageUrls = proxyBase
      ? upload.paths.map((p) => `${proxyBase}/ig/proxy?path=${encodeURIComponent(p)}`)
      : [];
    const imageUrls = directImageUrls;

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        slot: slotKey || "morning",
        date_local: dateLocal,
        as_of: asOfISO,
        resonance_aspect_key: igOut?.source?.resonance_aspect_key || null,
        resonance_aspect_key_used: igOut?.source?.resonance_aspect_key_used || null,
        resonance_aspect_used: igOut?.source?.resonance_aspect_used || null,
        slide3_display_aspect: topAspect || null,
        ai_input_aspect: story?.outputs?.ig?.source?.resonance_aspect || null,
        caption,
      image_urls: imageUrls,
      image_urls_direct: directImageUrls,
      image_urls_proxy: proxyImageUrls,
      gcs_paths: upload.paths,
      resonance_debug: resonanceDebug,
    };
    }

    const childIds = [];
    for (let i = 0; i < imageUrls.length; i += 1) {
      const imageUrl = imageUrls[i];
      const fallbackImageUrl = useProxy ? (proxyImageUrls[i] || "") : "";
      const child = await createChildContainerWithFallback({
        igUserId,
        accessToken,
        graphVersion,
        waitTimeoutMs,
        mediaRetryCount,
        mediaRetryDelayMs,
        imageUrl,
        fallbackImageUrl,
        index: i + 1,
      });
      childIds.push(child.childId);
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

    return {
      ok: true,
      slot: slotKey || "morning",
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
  }));
}

async function runIgMorningPost(deps, opts = {}) {
  return runIgPost(deps, { ...opts, slot: "morning" });
}

async function runIgResonancePost(deps, opts = {}) {
  return runIgPost(deps, { ...opts, slot: "resonance" });
}

async function runIgNightPost(deps, opts = {}) {
  return runIgPost(deps, { ...opts, slot: "night" });
}

module.exports = {
  runIgPost,
  runIgMorningPost,
  runIgResonancePost,
  runIgNightPost,
};
