"use strict";

const fs = require("fs");
const path = require("path");
const { toDateLocalJST, isYYYYMMDD } = require("../../../utils/time");
const { countChars } = require("../../../utils/text/hashtag");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");
const { SPEC } = require("../../../config/sora_spec");
const { uploadMedia } = require("../../../integrations/x/x_api");
const {
  DEFAULT_X_CANVAS,
  renderXMorningWheelPng,
} = require("../../../engine/renderers/x/morning_wheel");
const { buildCosmicSpaceConfig } = require("../../../engine/shared/space_background");
const { buildPublicStorySnapshot } = require("../../../usecases/story/store");
const { buildObservationMeta } = require("../../../usecases/story/observation_meta");
const { acquireXPostLock, markXPostLock } = require("./locks");
const { buildMorningPosts } = require("./planning");
const { truncateForX, resolveXMaxChars } = require("./utils");
const { writeLocalPosts, saveXPostFailure, notifyXPostFailure } = require("./io");
const { postThreadToX } = require("./publish");
const { withCronExecution } = require("../shared/execution");
const { resolveXExecutionPolicy } = require("../shared/policy/execution");
const { withExecutionLock } = require("../shared/lock");
const { persistExecutionFailure } = require("../shared/failure");
const {
  resolveLockSkippedPolicy,
  resolveFailedPolicy,
  resolvePublishOutcomePolicy,
  RESULT_REASON,
} = require("../shared/policy/x_result");
const { resolveXMorningOptions } = require("./options");

async function runXMorningPost(deps, opts = {}) {
  const { env, storyService, renderers, dict, db } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXMorningMain || !renderers?.renderXMorningLog || !renderers?.renderXResonance) {
    throw new Error("renderers.renderXMorningMain/renderXMorningLog/renderXResonance missing");
  }

  const runOpts = resolveXMorningOptions({ env, opts });
  const { env2, dryRun, useAi, localOnly, force, asOfISO, dateLocal, localOutDir, resonanceOrbMax } = runOpts;
  const includeResonance = false;

  if (useAi && !String(env2.OPENAI_API_KEY || "").trim()) {
    throw new Error("OPENAI_API_KEY missing");
  }

  let lockInfo = null;
  const policy = resolveXExecutionPolicy({ runner: "morning", dateLocal, dryRun, localOnly, force });
  const lockOutcome = await withExecutionLock({
    policy,
    acquire: () => acquireXPostLock(db, "morning", dateLocal, { force }),
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
    label: "[cron/x/morning]",
    meta: (phase, result) => {
      if (phase === "start") return { date_local: dateLocal, as_of: asOfISO, dry_run: dryRun, local_only: localOnly, use_ai: useAi };
      if (phase === "done") return { ok: result?.ok, partial: result?.partial, date_local: dateLocal, policy };
      return { date_local: dateLocal, as_of: asOfISO, dry_run: dryRun, local_only: localOnly, policy };
    },
    onError: async (err) => {
      if (!dryRun && !localOnly) {
        await markXPostLock(db, "morning", dateLocal, {
          status: "failed",
          reason: err?.message || String(err),
          runId: lockInfo?.runId || null,
        }).catch(() => {});
      }
    },
  }, async () => {
    const story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;
    const observationMeta = buildObservationMeta({ story, dict, asOfISO, dateLocal });

    const openai = {
      apiKey: env2.OPENAI_API_KEY,
      baseUrl: env2.OPENAI_BASE_URL,
      model: env2.OPENAI_MODEL,
    };

    const maxMainChars = resolveXMaxChars(env2.X_POST_MAIN_MAX_CHARS);
    const maxLogChars = resolveXMaxChars(
      Number.isFinite(Number(env2.X_POST_LOG_MAX_CHARS)) ? Number(env2.X_POST_LOG_MAX_CHARS) : env2.X_POST_MAX_CHARS
    );
    const maxResonanceChars = resolveXMaxChars(
      Number.isFinite(Number(env2.X_POST_RESONANCE_MAX_CHARS)) ? Number(env2.X_POST_RESONANCE_MAX_CHARS) : env2.X_POST_MAX_CHARS
    );

    const maxOrb = Number.isFinite(Number(resonanceOrbMax))
      ? Number(resonanceOrbMax)
      : Number.isFinite(Number(env2.X_RESONANCE_ORB_MAX))
        ? Number(env2.X_RESONANCE_ORB_MAX)
        : Number(SPEC?.orb?.free ?? 1.5);
    const aiMaxRetries = Number.isFinite(Number(env2.X_POST_AI_MAX_RETRIES))
      ? Number(env2.X_POST_AI_MAX_RETRIES)
      : (Number.isFinite(Number(env2.X_AI_MAX_RETRIES)) ? Number(env2.X_AI_MAX_RETRIES) : 8);

    const { posts, hasResonance, errors: buildErrors } = await buildMorningPosts({
      story,
      dict,
      renderers,
      openai,
      useAi,
      maxOrbDeg: maxOrb,
      maxMainChars,
      includeResonance,
      aiMaxRetries,
    });

    if (Array.isArray(posts) && posts.length === 0 && useAi) {
      const resultPolicy = resolveFailedPolicy(RESULT_REASON.AI_GENERATION_FAILED);
      console.error("[x:post] ai_generation_failed", {
        date_local: dateLocal,
        as_of: asOfISO,
        errors: buildErrors,
      });
      await persistExecutionFailure({
        policy,
        resultPolicy,
        payload: {
          db,
          dateLocal,
          asOfISO,
          kind: "morning",
          posts: [],
          results: [],
          errors: buildErrors,
          meta: { reason: "ai_generation_failed", has_resonance: hasResonance },
        },
        persist: (failurePayload) =>
          saveXPostFailure(failurePayload).catch((err) => console.error("[x:outbox] save failed", err?.message || String(err))),
      });
      await notifyXPostFailure({ env: env2, dateLocal, kind: "morning", errors: buildErrors });

      const result = {
        ok: false,
        dry_run: dryRun,
        date_local: dateLocal,
        as_of: asOfISO,
        error: "ai_generation_failed",
        result_policy: resultPolicy,
        details: Array.isArray(buildErrors) ? buildErrors : [],
      };
      if (!dryRun && !localOnly) {
        await markXPostLock(db, "morning", dateLocal, {
          status: resultPolicy.markAsSuccess ? "done" : "failed",
          reason: resultPolicy.reason,
          runId: lockInfo?.runId || null,
        }).catch(() => {});
      }
      return result;
    }

    const trimmed = posts.map((post) => {
      const limit = post.slot === "main"
        ? maxMainChars
        : post.slot === "resonance"
          ? maxResonanceChars
          : maxLogChars;
      const res = truncateForX(post.text, limit);
      return {
        ...post,
        text: res.text,
        truncated: res.truncated,
        text_len: countChars(res.text),
      };
    });

    if (localOnly) {
      const localPaths = writeLocalPosts({ posts: trimmed, outDir: localOutDir, prefix: "x_morning" });
      let imagePath = null;
      const imageEnabled = opts.image === undefined
        ? toBool(env2.X_POST_IMAGE_ENABLED ?? env2.X_POST_IMAGE, false)
        : toBool(opts.image, false);
      if (imageEnabled) {
        const imageWidth = Number.isFinite(Number(env2.X_POST_IMAGE_WIDTH))
          ? Number(env2.X_POST_IMAGE_WIDTH)
          : DEFAULT_X_CANVAS.width;
        const imageHeight = Number.isFinite(Number(env2.X_POST_IMAGE_HEIGHT))
          ? Number(env2.X_POST_IMAGE_HEIGHT)
          : DEFAULT_X_CANVAS.height;
        const imageVariant = String(env2.X_POST_IMAGE_VARIANT || "story_today").trim() || "story_today";
        const spaceConfig = buildCosmicSpaceConfig("cosmic_soft");
        const png = await renderXMorningWheelPng({
          story,
          dateLabel: dateLocal,
          width: imageWidth,
          height: imageHeight,
          variant: imageVariant,
          spaceConfig,
        });
        fs.mkdirSync(localOutDir, { recursive: true });
        imagePath = path.join(localOutDir, `x_morning_${imageWidth}x${imageHeight}.png`);
        fs.writeFileSync(imagePath, png);
      }
      return {
        ok: true,
        dry_run: true,
        local_only: true,
        date_local: dateLocal,
        as_of: asOfISO,
        posts: trimmed,
        has_resonance: hasResonance,
        local_dir: localOutDir,
        local_paths: localPaths,
        local_image: imagePath,
        observation_meta: observationMeta,
      };
    }

    const imageEnabled = opts.image === undefined
      ? toBool(env2.X_IMAGE_ENABLED ?? env2.X_POST_IMAGE_ENABLED ?? env2.X_POST_IMAGE, false)
      : toBool(opts.image, false);
    const imageWidth = Number.isFinite(Number(env2.X_POST_IMAGE_WIDTH))
      ? Number(env2.X_POST_IMAGE_WIDTH)
      : DEFAULT_X_CANVAS.width;
    const imageHeight = Number.isFinite(Number(env2.X_POST_IMAGE_HEIGHT))
      ? Number(env2.X_POST_IMAGE_HEIGHT)
      : DEFAULT_X_CANVAS.height;
    const imageVariant = String(env2.X_POST_IMAGE_VARIANT || "story_today").trim() || "story_today";

    let mediaId = null;
    let imageInfo = null;
    if (imageEnabled) {
      imageInfo = {
        enabled: true,
        width: imageWidth,
        height: imageHeight,
        variant: imageVariant,
      };
      if (!dryRun) {
        try {
          const png = await renderXMorningWheelPng({
            story,
            dateLabel: dateLocal,
            width: imageWidth,
            height: imageHeight,
            variant: imageVariant,
            spaceConfig: buildCosmicSpaceConfig("cosmic_soft"),
          });
          const uploaded = await uploadMedia({ buffer: png, mediaType: "image/png", env: env2 });
          mediaId = uploaded?.id || "";
          imageInfo.media_id = mediaId || null;
        } catch (err) {
          imageInfo.error = err?.message || "image_upload_failed";
        }
      }
    }

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        date_local: dateLocal,
        as_of: asOfISO,
        posts: trimmed,
        has_resonance: hasResonance,
        image: imageInfo,
        result_policy: resolvePublishOutcomePolicy({ okCount: 1, errorCount: 0 }),
        observation_meta: observationMeta,
      };
    }

    const payloads = trimmed
      .map((p, idx) => ({
        text: p.text,
        slot: p.slot,
        mediaIds: idx === 0 && mediaId ? [mediaId] : null,
        truncated: p.truncated,
        text_len: p.text_len,
      }))
      .filter((p) => String(p.text || "").trim());

    const postRes = await postThreadToX({ posts: payloads, env: env2 });
    const postErrors = postRes.errors || [];
    const okCount = (postRes.results || []).filter((r) => r.ok).length;

    if (postErrors.length) {
      const resultPolicy = resolvePublishOutcomePolicy({ okCount, errorCount: postErrors.length });
      await persistExecutionFailure({
        policy,
        resultPolicy,
        payload: {
          db,
          dateLocal,
          asOfISO,
          kind: "morning",
          posts: payloads,
          results: postRes.results,
          errors: postErrors,
          image: imageInfo,
          meta: {
            has_resonance: hasResonance,
            max_chars: { main: maxMainChars, log: maxLogChars, resonance: maxResonanceChars },
          },
        },
        persist: (failurePayload) =>
          saveXPostFailure(failurePayload).catch((err) => console.error("[x:outbox] save failed", err?.message || String(err))),
      });

      await notifyXPostFailure({
        env: env2,
        dateLocal,
        kind: "morning",
        errors: postErrors,
        results: postRes.results,
      });
    }

    const resultPolicy = resolvePublishOutcomePolicy({ okCount, errorCount: postErrors.length });
    if (!dryRun && !localOnly) {
      await markXPostLock(db, "morning", dateLocal, {
        status: resultPolicy.markAsSuccess ? "done" : "failed",
        runId: lockInfo?.runId || null,
        tweet_ids: postRes.ids || [],
        ok_count: okCount,
        error_count: postErrors.length,
        partial: postErrors.length > 0,
      }).catch(() => {});
    }

    return {
      ok: okCount > 0,
      partial: postErrors.length > 0,
      dry_run: false,
      date_local: dateLocal,
      as_of: asOfISO,
      posts: trimmed,
      tweet_ids: postRes.ids || [],
      post_results: postRes.results || [],
      has_resonance: hasResonance,
      image: imageInfo,
      errors: postErrors,
      result_policy: resultPolicy,
    };
  });
}

module.exports = { runXMorningPost };
