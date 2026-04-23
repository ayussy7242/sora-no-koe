"use strict";

const fs = require("fs");
const path = require("path");
const { toDateLocalJST, isYYYYMMDD } = require("../../../utils/time");
const { countChars } = require("../../../utils/text/hashtag");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");
const { generateXNightAiText } = require("../../../usecases/channels/x/ai/night");
const { uploadMedia } = require("../../../integrations/x/x_api");
const { DEFAULT_X_CANVAS } = require("../../../engine/renderers/x/morning_wheel");
const { renderXNightMoonPng } = require("../../../engine/renderers/x/night_moon");
const { buildCosmicSpaceConfig } = require("../../../engine/shared/space_background");
const { buildPublicStorySnapshot } = require("../../../usecases/story/store");
const { CRON_STATUS } = require("../../../domain/lifecycle/enums");
const { acquireXPostLock, markXPostLock } = require("./locks");
const { buildNightPosts } = require("./planning");
const { truncateForX, resolveXMaxChars, ensureXMeta } = require("./utils");
const { writeLocalPosts } = require("./io");
const { postSingleToX } = require("./publish");
const { withCronExecution } = require("../shared/execution");
const { resolveXExecutionPolicy } = require("../shared/policy/execution");
const { withExecutionLock } = require("../shared/lock");
const {
  resolveLockSkippedPolicy,
  resolveFailedPolicy,
  resolvePublishOutcomePolicy,
  RESULT_REASON,
} = require("../shared/policy/x_result");
const { resolveXNightOptions } = require("./options");

async function runXNightPost(deps, opts = {}) {
  const { env, storyService, renderers, dict, db } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXNight) throw new Error("renderers.renderXNight missing");

  const runOpts = resolveXNightOptions({ env, opts });
  const { env2, dryRun, useAi, localOnly, force, asOfISO, dateLocal, localOutDir } = runOpts;

  if (useAi && !String(env2.OPENAI_API_KEY || "").trim()) {
    throw new Error("OPENAI_API_KEY missing");
  }

  let lockInfo = null;
  const policy = resolveXExecutionPolicy({ runner: "night", dateLocal, dryRun, localOnly, force });
  const lockOutcome = await withExecutionLock({
    policy,
    acquire: () => acquireXPostLock(db, "night", dateLocal, { force }),
    onSkip: (lock) => ({
      ok: true,
      skipped: true,
      reason: lock.reason,
      result_policy: resolveLockSkippedPolicy(),
      date_local: dateLocal,
      as_of: asOfISO,
    }),
  }, async (lock) => {
    lockInfo = lock;
    return null;
  });
  if (lockOutcome) return lockOutcome;

  return withCronExecution({
    label: "[cron/x/night]",
    meta: (phase, result) => {
      if (phase === "start") return { date_local: dateLocal, as_of: asOfISO, dry_run: dryRun, local_only: localOnly, use_ai: useAi };
      if (phase === "done") return { ok: result?.ok, date_local: dateLocal, policy };
      return { date_local: dateLocal, as_of: asOfISO, dry_run: dryRun, local_only: localOnly, policy };
    },
    onError: async (err) => {
      if (!dryRun && !localOnly) {
        await markXPostLock(db, "night", dateLocal, {
          status: "failed",
          reason: err?.message || String(err),
          runId: lockInfo?.runId || null,
        }).catch(() => {});
      }
    },
  }, async () => {
    const story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;

    const openai = {
      apiKey: env2.OPENAI_API_KEY,
      baseUrl: env2.OPENAI_BASE_URL,
      model: env2.OPENAI_MODEL,
    };

    const meta = ensureXMeta(story);
    const maxChars = resolveXMaxChars(env2.X_POST_MAX_CHARS);
    let nightAiMax = null;
    if (useAi && Number.isFinite(Number(maxChars))) {
      const prev = meta.x_ai.night;
      meta.x_ai.night = "";
      const headerText = await renderers.renderXNight(story);
      meta.x_ai.night = prev;
      const headerLen = countChars(headerText);
      const budget = Math.max(0, Number(maxChars) - headerLen - 2);
      if (budget > 0) nightAiMax = budget;
    }

    const aiMaxRetries = Number.isFinite(Number(env2.X_POST_AI_MAX_RETRIES))
      ? Number(env2.X_POST_AI_MAX_RETRIES)
      : (Number.isFinite(Number(env2.X_AI_MAX_RETRIES)) ? Number(env2.X_AI_MAX_RETRIES) : 8);

    if (useAi) {
      const res = await generateXNightAiText({
        story,
        dict,
        openai,
        maxChars: nightAiMax ?? undefined,
        maxRetries: aiMaxRetries,
      });
      if (res?.ok && res.text) {
        meta.x_ai.night = res.text;
      } else {
        const resultPolicy = resolveFailedPolicy(RESULT_REASON.AI_GENERATION_FAILED);
        const result = {
          ok: false,
          dry_run: dryRun,
          date_local: dateLocal,
          as_of: asOfISO,
          error: "ai_generation_failed",
          result_policy: resultPolicy,
          details: [{ slot: "night", error: res?.error || "unknown", reason: res?.reason || "" }],
        };
        if (!dryRun && !localOnly) {
          await markXPostLock(db, "night", dateLocal, {
            status: resultPolicy.markAsSuccess ? CRON_STATUS.SUCCESS : "failed",
            reason: resultPolicy.reason,
            runId: lockInfo?.runId || null,
          }).catch(() => {});
        }
        return result;
      }
    }

    const { posts } = await buildNightPosts({ story, dict, renderers, openai, useAi: false });

    const trimmed = posts.map((post) => {
      const res = truncateForX(post, maxChars);
      return { text: res.text, truncated: res.truncated };
    });

    if (localOnly) {
      const localPaths = writeLocalPosts({
        posts: trimmed.map((p) => ({ text: p.text, slot: "night" })),
        outDir: localOutDir,
        prefix: "x_night",
      });
      let imagePath = null;
      const nightImageEnabled = opts.image === undefined
        ? toBool(env2.X_NIGHT_IMAGE_ENABLED ?? env2.X_POST_IMAGE_ENABLED ?? env2.X_POST_IMAGE, false)
        : toBool(opts.image, false);
      if (nightImageEnabled) {
        const nightImageWidth = Number.isFinite(Number(env2.X_NIGHT_IMAGE_WIDTH))
          ? Number(env2.X_NIGHT_IMAGE_WIDTH)
          : (Number.isFinite(Number(env2.X_POST_IMAGE_WIDTH)) ? Number(env2.X_POST_IMAGE_WIDTH) : DEFAULT_X_CANVAS.width);
        const nightImageHeight = Number.isFinite(Number(env2.X_NIGHT_IMAGE_HEIGHT))
          ? Number(env2.X_NIGHT_IMAGE_HEIGHT)
          : (Number.isFinite(Number(env2.X_POST_IMAGE_HEIGHT)) ? Number(env2.X_POST_IMAGE_HEIGHT) : DEFAULT_X_CANVAS.height);
        const nightImageSupersample = Number.isFinite(Number(env2.X_NIGHT_IMAGE_SUPERSAMPLE))
          ? Number(env2.X_NIGHT_IMAGE_SUPERSAMPLE)
          : (Number.isFinite(Number(env2.X_POST_IMAGE_SUPERSAMPLE)) ? Number(env2.X_POST_IMAGE_SUPERSAMPLE) : 2);
        const nightImageVariant = String(env2.X_NIGHT_IMAGE_VARIANT || env2.X_POST_IMAGE_VARIANT || "story_tomorrow").trim()
          || "story_tomorrow";
        const png = await renderXNightMoonPng({
          story,
          dateLabel: dateLocal,
          width: nightImageWidth,
          height: nightImageHeight,
          variant: nightImageVariant,
          dict,
          asOfISO,
          supersample: nightImageSupersample,
          spaceConfig: buildCosmicSpaceConfig("cosmic_vivid"),
        });
        fs.mkdirSync(localOutDir, { recursive: true });
        imagePath = path.join(localOutDir, `x_night_${nightImageWidth}x${nightImageHeight}.png`);
        fs.writeFileSync(imagePath, png);
      }
      return {
        ok: true,
        dry_run: true,
        local_only: true,
        date_local: dateLocal,
        as_of: asOfISO,
        posts: trimmed,
        local_dir: localOutDir,
        local_paths: localPaths,
        local_image: imagePath,
      };
    }

    const nightImageEnabled = opts.image === undefined
      ? toBool(
        env2.X_NIGHT_IMAGE_ENABLED ?? env2.X_IMAGE_ENABLED ?? env2.X_POST_IMAGE_ENABLED ?? env2.X_POST_IMAGE,
        false
      )
      : toBool(opts.image, false);
    const nightImageWidth = Number.isFinite(Number(env2.X_NIGHT_IMAGE_WIDTH))
      ? Number(env2.X_NIGHT_IMAGE_WIDTH)
      : (Number.isFinite(Number(env2.X_POST_IMAGE_WIDTH)) ? Number(env2.X_POST_IMAGE_WIDTH) : DEFAULT_X_CANVAS.width);
    const nightImageHeight = Number.isFinite(Number(env2.X_NIGHT_IMAGE_HEIGHT))
      ? Number(env2.X_NIGHT_IMAGE_HEIGHT)
      : (Number.isFinite(Number(env2.X_POST_IMAGE_HEIGHT)) ? Number(env2.X_POST_IMAGE_HEIGHT) : DEFAULT_X_CANVAS.height);
    const nightImageSupersample = Number.isFinite(Number(env2.X_NIGHT_IMAGE_SUPERSAMPLE))
      ? Number(env2.X_NIGHT_IMAGE_SUPERSAMPLE)
      : (Number.isFinite(Number(env2.X_POST_IMAGE_SUPERSAMPLE)) ? Number(env2.X_POST_IMAGE_SUPERSAMPLE) : 2);
    const nightImageVariant = String(env2.X_NIGHT_IMAGE_VARIANT || env2.X_POST_IMAGE_VARIANT || "story_tomorrow").trim()
      || "story_tomorrow";

    let nightMediaId = null;
    let nightImageInfo = null;
    if (nightImageEnabled) {
      nightImageInfo = {
        enabled: true,
        width: nightImageWidth,
        height: nightImageHeight,
        variant: nightImageVariant,
      };
      if (!dryRun) {
        try {
          const png = await renderXNightMoonPng({
            story,
            dateLabel: dateLocal,
            width: nightImageWidth,
            height: nightImageHeight,
            variant: nightImageVariant,
            dict,
            asOfISO,
            supersample: nightImageSupersample,
            spaceConfig: buildCosmicSpaceConfig("cosmic_vivid"),
          });
          const uploaded = await uploadMedia({ buffer: png, mediaType: "image/png", env: env2 });
          nightMediaId = uploaded?.id || "";
          nightImageInfo.media_id = nightMediaId || null;
        } catch (err) {
          nightImageInfo.error = err?.message || "image_upload_failed";
        }
      }
    }

    if (dryRun) {
      const resultPolicy = resolvePublishOutcomePolicy({ okCount: 1, errorCount: 0 });
      return {
        ok: true,
        dry_run: true,
        date_local: dateLocal,
        as_of: asOfISO,
        posts: trimmed,
        image: nightImageInfo,
        result_policy: resultPolicy,
      };
    }

    const text = trimmed[0]?.text || "";
    const res = await postSingleToX({ text, mediaIds: nightMediaId ? [nightMediaId] : null, env: env2 });
    const resultPolicy = resolvePublishOutcomePolicy({ okCount: res?.id ? 1 : 0, errorCount: 0 });

    if (!dryRun && !localOnly) {
      await markXPostLock(db, "night", dateLocal, {
        status: resultPolicy.markAsSuccess ? CRON_STATUS.SUCCESS : "failed",
        runId: lockInfo?.runId || null,
        tweet_ids: [res?.id || ""],
      }).catch(() => {});
    }

    return {
      ok: true,
      dry_run: false,
      date_local: dateLocal,
      as_of: asOfISO,
      posts: trimmed,
      tweet_ids: [res?.id || ""],
      image: nightImageInfo,
      result_policy: resultPolicy,
    };
  });
}

module.exports = { runXNightPost };
