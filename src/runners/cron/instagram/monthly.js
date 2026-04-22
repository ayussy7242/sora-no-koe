"use strict";

const fs = require("fs");
const path = require("path");
const { renderInstagramCarousel } = require("../../../engine/renderers/instagram/carousel");
const {
  createImageContainer,
  createCarouselContainer,
  publishMedia,
  waitForContainer,
} = require("../../../integrations/instagram/graph");
const { createStorageClient } = require("../../../utils/infra/gcs_storage");
const { resolveEnv } = require("../../../utils/env");
const { toDateLocalJST } = require("../../../utils/time");
const { toBool } = require("../../../utils/data/bool");
const { createSchemaValidator } = require("../../../utils/schema/validator");
const { buildMonthlyOverviewReference, buildMonthlyOverviewDeck } = require("../../../usecases/reference/monthly_overview");
const { generateIgMonthlyCaptionText, formatMonthDot, buildCaptionFallback } = require("../../../usecases/channels/instagram/ai/monthly_overview");
const { createStoryService } = require("../../../usecases/story/story");
const { resolvePublicStory } = require("../../../usecases/story/resolve");
const { swisseph } = require("../../../config/swisseph");
const { claimCronLock, markCronLockSuccess, markCronLockFailed } = require("../../../usecases/cron/lock_utils");
const { writeLocalCarousel, writeLocalJson, renderAndUploadCarouselSlides } = require("./io");
const { resolveInstagramExecutionPolicy } = require("../shared/policy/execution");
const { withExecutionLock } = require("../shared/lock");
const { withExecutionResultMarking } = require("../shared/marking");
const dictDefault = require("../../../content/dict");
const { STORY_SCHEMA_VERSION } = require("../../../domain/schema/versions");

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

function parseMonthFromDate(dateLocal) {
  if (!dateLocal) return "";
  const str = String(dateLocal);
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str.slice(0, 7) : str;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function buildAspectListFromGroup(group) {
  const out = [];
  for (const [k, v] of Object.entries(group || {})) {
    const deg = Number(v?.deg);
    if (!Number.isFinite(deg)) continue;
    out.push({ type: v?.key || k, deg });
  }
  return out;
}

function buildAspectLists(dict) {
  const ASPECTS_SRC = dict?.ASPECTS || dict?.ASPECTS_V2 || dict?.ASPECTS_V1 || null;
  const fromMajorList =
    Array.isArray(ASPECTS_SRC?.major_list)
      ? ASPECTS_SRC.major_list.filter((a) => Number.isFinite(Number(a?.deg)))
      : [];
  const ASPECTS = fromMajorList.length
    ? fromMajorList
    : (() => {
        const fromMajor = buildAspectListFromGroup(ASPECTS_SRC?.major);
        if (fromMajor.length) return fromMajor;
        return [
          { type: "conjunction", deg: 0 },
          { type: "sextile", deg: 60 },
          { type: "square", deg: 90 },
          { type: "trine", deg: 120 },
          { type: "opposition", deg: 180 },
        ];
      })();
  const ASPECTS_DEEP = buildAspectListFromGroup(ASPECTS_SRC?.deep_space);
  return { ASPECTS, ASPECTS_DEEP };
}

function buildStoryServiceSafe(dict) {
  if (!swisseph) return null;
  const stubDb = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: false, data: () => null }),
      }),
    }),
  };
  const { ASPECTS, ASPECTS_DEEP } = buildAspectLists(dict);
  try {
    return createStoryService({
      db: stubDb,
      admin: null,
      swisseph,
      SIGNS: dict?.SIGNS,
      ASPECTS,
      ASPECTS_DEEP,
      DEFAULT_TZ: "Asia/Tokyo",
      PROJECT: "sora-no-koe",
      SCHEMA_VERSION: STORY_SCHEMA_VERSION,
    });
  } catch (e) {
    console.error("[monthly_overview] storyService disabled:", e?.message || String(e));
    return null;
  }
}

async function buildMonthStory({ month, day = 15, dict }) {
  const storyService = buildStoryServiceSafe(dict);
  if (!storyService) return null;
  const dateLocal = `${month}-${String(day).padStart(2, "0")}`;
  const asOfISO = new Date(`${dateLocal}T12:00:00+09:00`).toISOString();
  try {
    const story = await resolvePublicStory({ storyService, dateLocal, asOfISO });
    return story || null;
  } catch (e) {
    console.error("[monthly_overview] story build failed:", e?.message || String(e));
    return null;
  }
}

function formatMonthlyCaption({ month, body }) {
  const titleLine = `⭐️ ${formatMonthDot(month)} 今月の星カレンダー`;
  return [titleLine, body].filter(Boolean).join("\n\n");
}

function validatePayloads({ reference, deck, exportPayload }) {
  const validator = createSchemaValidator();
  const checks = [
    { label: "reference", schemaId: "monthly_overview.v1.schema.json", data: reference },
    { label: "deck", schemaId: "monthly_overview.deck.v1.schema.json", data: deck },
    { label: "export", schemaId: "monthly_overview.export.v1.schema.json", data: exportPayload },
  ];

  const failures = [];
  for (const check of checks) {
    const result = validator.validate(check.schemaId, check.data);
    if (!result.ok) {
      const errors = (result.errors || []).map((err) => `${err.instancePath || "/"} ${err.message || "invalid"}`.trim());
      failures.push({ label: check.label, schemaId: check.schemaId, errors });
    }
  }

  if (failures.length) {
    const details = failures
      .map((fail) => `- ${fail.label} (${fail.schemaId})\n  ${fail.errors.join("\n  ")}`)
      .join("\n");
    throw new Error(`schema validation failed:\n${details}`);
  }
}

function buildMonthlyExport({ month, dict, templatePath, storyDay = 15 }) {
  const reference = buildMonthlyOverviewReference({ month, dict });
  const template = readJson(templatePath);
  const deck = buildMonthlyOverviewDeck({ reference, template });
  return buildMonthStory({ month, day: storyDay, dict })
    .then((story) => {
      if (story) {
        deck.story = story;
        deck.story_date_local = story?.meta?.date_local || `${month}-${String(storyDay).padStart(2, "0")}`;
      }
      const exportPayload = {
        type: "monthly_overview_export",
        version: "v1",
        month,
        time_zone: reference.time_zone,
        generated_at_utc: new Date().toISOString(),
        reference,
        deck,
      };
      validatePayloads({ reference, deck, exportPayload });
      return exportPayload;
    });
}

function buildMonthlyCarousel({ payload }) {
  const deck = payload.deck || payload;
  const header = deck.header || null;
  const dateLabel = deck.data?.month || payload.month || deck.data?.month || "";
  const spaceConfig = deck.spaceConfig || payload.spaceConfig || null;
  const seedVariant = deck.seedVariant || payload.seedVariant || null;
  const story = deck.story || payload.story || null;
  const slides = (deck.slides || []).map((slide) => ({
    kind: slide.type || "slide1",
    data: {
      ...slide,
      header: slide.header || header,
      dateLabel,
      story,
    },
  }));
  return {
    slides,
    slideSet: deck.layout_key || "monthly_overview",
    spaceConfig,
    seedVariant,
  };
}

async function runIgMonthlyPost(deps, opts = {}) {
  const env = deps?.env || {};
  const env2 = resolveEnv(env);
  const dict = deps?.dict || dictDefault;
  const db = deps?.db;
  const admin = deps?.admin;
  const storage = deps?.storage;
  const storageClient = await createStorageClient({ storage, env: env2 });

  const now = opts.asOfISO ? new Date(opts.asOfISO) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("invalid as_of");
  const asOfISO = opts.asOfISO || now.toISOString();
  const dateLocal = opts.dateLocal || toDateLocalJST(now);
  const month = String(opts.month || parseMonthFromDate(dateLocal) || "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("month must be YYYY-MM");

  const dryRun = opts.dryRun === true || env2.IG_POST_DRY_RUN === true;
  const localOnly = toBool(opts.local ?? opts.localOnly ?? opts.local_only ?? env2.IG_POST_LOCAL_ONLY, false);
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.IG_POST_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "ig", "monthly_overview", month)
  );
  const backgroundCache = resolveBackgroundCache(env2);
  const force =
    opts.force === true ||
    opts.force_lock === true ||
    opts.forceLock === true ||
    env2.IG_POST_FORCE === true;

  const lockTtlMin = Number(env2.IG_POST_LOCK_TTL_MIN || 60);
  const lockTtlMs = Number.isFinite(lockTtlMin) ? Math.max(1, lockTtlMin) * 60 * 1000 : 60 * 60 * 1000;
  let lockRef = null;
  const lockId = `ig_monthly_${month}`;
  const policy = resolveInstagramExecutionPolicy({ runner: "monthly", month, dryRun, localOnly, force });

  const lockOutcome = await withExecutionLock({
    policy,
    acquire: () => claimCronLock({ db, admin, id: lockId, ttlMs: lockTtlMs }),
    onSkip: (lock) => ({
      ok: true,
      skipped: true,
      reason: lock.reason || "already_posted",
      policy,
      month,
      date_local: dateLocal,
      as_of: asOfISO,
    }),
  }, async (lock) => {
    lockRef = lock?.ref || null;
    return null;
  });
  if (lockOutcome) return lockOutcome;

  return withExecutionResultMarking({
    markSuccess: async (result) => {
      if (lockRef) {
        await markCronLockSuccess({
          ref: lockRef,
          admin,
          extra: { month, date_local: dateLocal, media_id: result?.media_id || null },
        });
      }
    },
    markFailed: async (e) => {
      if (lockRef) {
        await markCronLockFailed({ ref: lockRef, admin, error: e?.message || String(e) });
      }
    },
  }, async () => {
    const templatePath = env2.IG_MONTHLY_TEMPLATE_PATH
      || path.resolve(process.cwd(), "src/content/templates/instagram/monthly_overview.v1.json");

    const exportPayload = await buildMonthlyExport({ month, dict, templatePath, storyDay: opts.storyDay || 15 });
    const carousel = buildMonthlyCarousel({ payload: exportPayload });
    const useAi = opts.useAi !== false;
    const forceAi = opts.forceAi === true;
    const aiRes = useAi
      ? await generateIgMonthlyCaptionText({
          month,
          reference: exportPayload.reference,
          dict,
          forceAi,
          openai: {
            apiKey: env2.OPENAI_API_KEY,
            baseUrl: env2.OPENAI_BASE_URL,
            model: env2.OPENAI_MODEL,
          },
        })
      : { ok: false, error: "ai_disabled" };
    if (useAi && forceAi && !aiRes.ok) {
      throw new Error(`monthly_caption_ai_failed:${aiRes.reason || aiRes.error || "unknown"}`);
    }
    const captionBody = aiRes.ok
      ? aiRes.text
      : buildCaptionFallback({ month, reference: exportPayload.reference, dict });
    const caption = formatMonthlyCaption({ month, body: captionBody });

    if (localOnly) {
      const buffers = await renderInstagramCarousel({ ...carousel, backgroundCache });
      const localPaths = writeLocalCarousel({ buffers, outDir: localOutDir, prefix: "monthly" });
      const jsonPath = writeLocalJson({
        data: {
          ok: true,
          dry_run: true,
          local_only: true,
          month,
          date_local: dateLocal,
          as_of: asOfISO,
          caption,
          caption_length: Array.from(String(caption || "")).length,
          ai: aiRes,
          carousel,
          export: exportPayload,
        },
        outDir: localOutDir,
        filename: "ig_monthly.json",
      });
      return {
        ok: true,
        dry_run: true,
        local_only: true,
        policy,
        month,
        date_local: dateLocal,
        as_of: asOfISO,
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
    const upload = await renderAndUploadCarouselSlides({
      storage: storageClient,
      bucketName,
      dateLocal,
      carousel,
      expiresDays: env2.IG_IMAGE_URL_EXPIRES_DAYS,
      backgroundCache,
      normalize: env2.IG_MEDIA_NORMALIZE
        ? { format: env2.IG_MEDIA_FORMAT || "png", flatten: env2.IG_MEDIA_FLATTEN, flattenBg: env2.IG_MEDIA_FLATTEN_BG || "#000000" }
        : null,
    });

    const proxyBase = String(env2.IG_PROXY_BASE_URL || env2.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
    const useProxy = toBool(env2.IG_PROXY_ENABLED, false) && !!proxyBase;
    const imageUrls = useProxy
      ? upload.paths.map((p) => `${proxyBase}/ig/proxy?path=${encodeURIComponent(p)}`)
      : upload.urls;

    const mediaRetryCount = Number.isFinite(Number(env2.IG_MEDIA_RETRY_COUNT)) ? Number(env2.IG_MEDIA_RETRY_COUNT) : 2;
    const mediaRetryDelayMs = Number.isFinite(Number(env2.IG_MEDIA_RETRY_DELAY_MS)) ? Number(env2.IG_MEDIA_RETRY_DELAY_MS) : 1500;
    const waitTimeoutMs = Number.isFinite(Number(env2.IG_CONTAINER_TIMEOUT_MS))
      ? Number(env2.IG_CONTAINER_TIMEOUT_MS)
      : 240000;

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

    const result = {
      ok: true,
      policy,
      month,
      date_local: dateLocal,
      as_of: asOfISO,
      caption,
      image_urls: upload.urls,
      gcs_paths: upload.paths,
      carousel_container_id: creationId,
      media_id: published?.id || null,
      child_container_ids: childIds,
    };

    return result;
  });
}

module.exports = { runIgMonthlyPost };
