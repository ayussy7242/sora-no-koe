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
  renderXResonanceWheelPng,
} = require("../../../engine/renderers/x/morning_wheel");
const { buildCosmicSpaceConfig } = require("../../../engine/shared/space_background");
const { buildPublicStorySnapshot } = require("../../../usecases/story/store");
const { CRON_STATUS } = require("../../../domain/lifecycle/enums");
const {
  acquireXPostLock,
  markXPostLock,
  getXResonanceRecentKeys,
  pushXResonanceRecentKey,
} = require("./locks");
const { buildResonancePost } = require("./planning");
const { truncateForX, resolveXMaxChars, classifyXError } = require("./utils");
const { writeLocalPosts, saveXPostFailure, notifyXPostFailure } = require("./io");
const { postSingleToX } = require("./publish");
const { withCronExecution } = require("../shared/execution");
const { resolveXExecutionPolicy } = require("../shared/policy/execution");
const { withExecutionLock } = require("../shared/lock");
const { persistExecutionFailure } = require("../shared/failure");
const {
  resolveLockSkippedPolicy,
  resolveDuplicateSkippedPolicy,
  resolveFailedPolicy,
  resolvePublishOutcomePolicy,
  RESULT_REASON,
} = require("../shared/policy/x_result");

async function runXResonancePost(deps, opts = {}) {
  const { env, storyService, renderers, dict, db } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXResonance) {
    throw new Error("renderers.renderXResonance missing");
  }

  const env2 = resolveEnv(env);
  const dryRun = toBool(opts.dryRun ?? opts.dry_run ?? env2.X_POST_DRY_RUN, false);
  const useAi = opts.useAi === undefined ? true : toBool(opts.useAi, true);
  const debugEnabled = toBool(opts.debug ?? opts.debugFlag ?? env2.X_POST_DEBUG, false);
  const localOnly = toBool(
    opts.local ?? opts.localOnly ?? opts.local_only ?? env2.X_POST_LOCAL_ONLY,
    false
  );

  const asOfISO = String(opts.asOfISO || opts.as_of || "").trim() || new Date().toISOString();
  const dateLocal = isYYYYMMDD(opts.dateLocal)
    ? String(opts.dateLocal)
    : toDateLocalJST(new Date(asOfISO));
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.X_POST_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "x", "resonance", dateLocal || "unknown")
  );

  if (useAi && !String(env2.OPENAI_API_KEY || "").trim()) {
    throw new Error("OPENAI_API_KEY missing");
  }

  let lockInfo = null;
  const policy = resolveXExecutionPolicy({ runner: "resonance", dateLocal, dryRun, localOnly, force: !!opts.force });
  const lockOutcome = await withExecutionLock({
    policy,
    acquire: () => acquireXPostLock(db, "resonance", dateLocal, { force: !!opts.force }),
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
    label: "[cron/x/resonance]",
    meta: (phase, result) => {
      if (phase === "start") return { date_local: dateLocal, as_of: asOfISO, dry_run: dryRun, local_only: localOnly, use_ai: useAi };
      if (phase === "done") return { ok: result?.ok, skipped: result?.skipped, date_local: dateLocal, reason: result?.reason || null, policy };
      return { date_local: dateLocal, as_of: asOfISO, dry_run: dryRun, local_only: localOnly, policy };
    },
    onError: async (err) => {
      if (!dryRun && !localOnly) {
        await markXPostLock(db, "resonance", dateLocal, {
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

    const maxResonanceChars = resolveXMaxChars(
      Number.isFinite(Number(env2.X_POST_RESONANCE_MAX_CHARS))
        ? Number(env2.X_POST_RESONANCE_MAX_CHARS)
        : env2.X_POST_MAX_CHARS,
      180
    );

    const maxOrb = Number.isFinite(Number(opts.resonanceOrbMax))
      ? Number(opts.resonanceOrbMax)
      : Number.isFinite(Number(env2.X_RESONANCE_ORB_MAX))
        ? Number(env2.X_RESONANCE_ORB_MAX)
        : Number(SPEC?.orb?.free ?? 1.5);

    const triggerOrbMax = Number.isFinite(Number(opts.resonanceTriggerOrbMax))
      ? Number(opts.resonanceTriggerOrbMax)
      : Number.isFinite(Number(env2.X_RESONANCE_TRIGGER_ORB_MAX))
        ? Number(env2.X_RESONANCE_TRIGGER_ORB_MAX)
        : 0.5;

    const excludeKeys = db ? await getXResonanceRecentKeys(db).catch(() => []) : [];

    const aiMaxRetries = Number.isFinite(Number(env2.X_POST_AI_MAX_RETRIES))
      ? Number(env2.X_POST_AI_MAX_RETRIES)
      : (Number.isFinite(Number(env2.X_AI_MAX_RETRIES)) ? Number(env2.X_AI_MAX_RETRIES) : 8);

    const {
      post,
      hasResonance,
      errors: buildErrors,
      skipReason,
      skipMeta,
      picked,
      pickedKey,
      debug: resonanceDebug,
    } = await buildResonancePost({
      story,
      dict,
      renderers,
      openai,
      useAi,
      maxOrbDeg: maxOrb,
      triggerOrbMax,
      excludeKeys,
      maxTotalChars: maxResonanceChars,
      aiMaxRetries,
    });

    const attachDebug = (payload) => {
      if (debugEnabled || dryRun) {
        return { ...payload, resonance_debug: resonanceDebug || null };
      }
      return payload;
    };

    if (!post && useAi && Array.isArray(buildErrors) && buildErrors.length) {
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
          kind: "resonance",
          posts: [],
          results: [],
          errors: buildErrors,
          meta: { reason: "ai_generation_failed", has_resonance: hasResonance },
        },
        persist: (failurePayload) =>
          saveXPostFailure(failurePayload).catch((err) => console.error("[x:outbox] save failed", err?.message || String(err))),
      });
      await notifyXPostFailure({ env: env2, dateLocal, kind: "resonance", errors: buildErrors });

      const result = attachDebug({
        ok: false,
        dry_run: dryRun,
        date_local: dateLocal,
        as_of: asOfISO,
        error: "ai_generation_failed",
        result_policy: resultPolicy,
        details: Array.isArray(buildErrors) ? buildErrors : [],
      });
      if (!dryRun && !localOnly) {
        await markXPostLock(db, "resonance", dateLocal, {
          status: resultPolicy.markAsSuccess ? "done" : "failed",
          reason: resultPolicy.reason,
          runId: lockInfo?.runId || null,
        }).catch(() => {});
      }
      return result;
    }

    if (!post || !String(post.text || "").trim()) {
      const reason = skipReason || RESULT_REASON.NO_CANDIDATE;
      if (!dryRun && !localOnly) {
        await markXPostLock(db, "resonance", dateLocal, {
          status: "skipped",
          reason,
          runId: lockInfo?.runId || null,
          meta: skipMeta || null,
        }).catch(() => {});
      }
      return attachDebug({
        ok: true,
        skipped: true,
        reason,
        meta: skipMeta || null,
        dry_run: dryRun,
        date_local: dateLocal,
        as_of: asOfISO,
      });
    }

    const trimmed = (() => {
      const res = truncateForX(post.text, maxResonanceChars);
      return {
        ...post,
        text: res.text,
        truncated: res.truncated,
        text_len: countChars(res.text),
      };
    })();

    const resonanceImageEnabled = opts.image === undefined
      ? toBool(
        env2.X_RESONANCE_IMAGE_ENABLED ?? env2.X_IMAGE_ENABLED ?? env2.X_POST_IMAGE_ENABLED ?? env2.X_POST_IMAGE,
        false
      )
      : toBool(opts.image, false);
    const resonanceImageWidth = Number.isFinite(Number(env2.X_RESONANCE_IMAGE_WIDTH))
      ? Number(env2.X_RESONANCE_IMAGE_WIDTH)
      : (Number.isFinite(Number(env2.X_POST_IMAGE_WIDTH)) ? Number(env2.X_POST_IMAGE_WIDTH) : DEFAULT_X_CANVAS.width);
    const resonanceImageHeight = Number.isFinite(Number(env2.X_RESONANCE_IMAGE_HEIGHT))
      ? Number(env2.X_RESONANCE_IMAGE_HEIGHT)
      : (Number.isFinite(Number(env2.X_POST_IMAGE_HEIGHT)) ? Number(env2.X_POST_IMAGE_HEIGHT) : DEFAULT_X_CANVAS.height);
    const resonanceImageVariant = String(env2.X_RESONANCE_IMAGE_VARIANT || env2.X_POST_IMAGE_VARIANT || "resonance")
      .trim() || "resonance";

    let resonanceMediaId = null;
    let resonanceImageInfo = null;
    let resonanceImagePath = null;
    if (resonanceImageEnabled) {
      resonanceImageInfo = {
        enabled: true,
        width: resonanceImageWidth,
        height: resonanceImageHeight,
        variant: resonanceImageVariant,
      };
      const resonanceAspect = picked?.raw || story?.meta?.x_source?.resonance_aspect || null;
      if (!resonanceAspect) {
        resonanceImageInfo.error = "resonance_aspect_missing";
      } else if (localOnly) {
        try {
          const png = await renderXResonanceWheelPng({
            story,
            dateLabel: dateLocal,
            width: resonanceImageWidth,
            height: resonanceImageHeight,
            variant: resonanceImageVariant,
            resonanceAspect,
            spaceConfig: buildCosmicSpaceConfig("cosmic_default"),
          });
          fs.mkdirSync(localOutDir, { recursive: true });
          resonanceImagePath = path.join(localOutDir, `x_resonance_wheel_${resonanceImageWidth}x${resonanceImageHeight}.png`);
          fs.writeFileSync(resonanceImagePath, png);
        } catch (err) {
          resonanceImageInfo.error = err?.message || "image_render_failed";
        }
      }
    }

    if (localOnly) {
      const localPaths = writeLocalPosts({ posts: [trimmed], outDir: localOutDir, prefix: "x_resonance" });
      return attachDebug({
        ok: true,
        dry_run: true,
        local_only: true,
        date_local: dateLocal,
        as_of: asOfISO,
        post: trimmed,
        local_dir: localOutDir,
        local_paths: localPaths,
        local_image: resonanceImagePath,
        image: resonanceImageInfo,
      });
    }

    if (resonanceImageEnabled && !dryRun) {
      const resonanceAspect = picked?.raw || story?.meta?.x_source?.resonance_aspect || null;
      if (resonanceAspect) {
        try {
          const png = await renderXResonanceWheelPng({
            story,
            dateLabel: dateLocal,
            width: resonanceImageWidth,
            height: resonanceImageHeight,
            variant: resonanceImageVariant,
            resonanceAspect,
            spaceConfig: buildCosmicSpaceConfig("cosmic_default"),
          });
          const uploaded = await uploadMedia({ buffer: png, mediaType: "image/png", env: env2 });
          resonanceMediaId = uploaded?.id || "";
          if (resonanceImageInfo) resonanceImageInfo.media_id = resonanceMediaId || null;
        } catch (err) {
          if (resonanceImageInfo) resonanceImageInfo.error = err?.message || "image_upload_failed";
        }
      } else if (resonanceImageInfo) {
        resonanceImageInfo.error = "resonance_aspect_missing";
      }
    }

    if (dryRun) {
      return attachDebug({
        ok: true,
        dry_run: true,
        date_local: dateLocal,
        as_of: asOfISO,
        post: trimmed,
        image: resonanceImageInfo,
      });
    }

    let res = null;
    try {
      res = await postSingleToX({
        text: trimmed.text,
        mediaIds: resonanceMediaId ? [resonanceMediaId] : null,
        env: env2,
      });
    } catch (err) {
      const classified = classifyXError(err);
      if (classified.isDuplicateContent) {
        const resultPolicy = resolveDuplicateSkippedPolicy();
        if (!dryRun && !localOnly) {
          await markXPostLock(db, "resonance", dateLocal, {
            status: "skipped",
            reason: resultPolicy.reason || classified.kind,
            runId: lockInfo?.runId || null,
            meta: pickedKey ? { resonance_key: pickedKey } : null,
          }).catch(() => {});
        }
        return attachDebug({
          ok: true,
          skipped: true,
          reason: classified.kind,
          result_policy: resultPolicy,
          dry_run: false,
          date_local: dateLocal,
          as_of: asOfISO,
          post: trimmed,
          has_resonance: hasResonance,
          resonance_key: pickedKey || "",
          resonance: picked || null,
          image: resonanceImageInfo,
          x_error: classified.info,
        });
      }
      throw err;
    }
    const resultPolicy = resolvePublishOutcomePolicy({ okCount: res?.id ? 1 : 0, errorCount: 0 });
    if (!dryRun && !localOnly) {
      await markXPostLock(db, "resonance", dateLocal, {
        status: resultPolicy.markAsSuccess ? CRON_STATUS.SUCCESS : "failed",
        runId: lockInfo?.runId || null,
        tweet_ids: res?.id ? [res.id] : [],
        ok_count: res?.id ? 1 : 0,
        error_count: 0,
        partial: false,
        meta: pickedKey ? { resonance_key: pickedKey } : null,
      }).catch(() => {});
      if (pickedKey) {
        await pushXResonanceRecentKey(db, pickedKey).catch(() => {});
      }
    }
    return attachDebug({
      ok: true,
      dry_run: false,
      date_local: dateLocal,
      as_of: asOfISO,
      post: trimmed,
      tweet_ids: res?.id ? [res.id] : [],
      has_resonance: hasResonance,
      resonance_key: pickedKey || "",
      resonance: picked || null,
      image: resonanceImageInfo,
      result_policy: resultPolicy,
    });
  });
}

module.exports = { runXResonancePost };
