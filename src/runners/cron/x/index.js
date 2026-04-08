"use strict";

const fs = require("fs");
const path = require("path");
const { toDateLocalJST, isYYYYMMDD } = require("../../../utils/time");
const { countChars } = require("../../../utils/text/hashtag");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");
const { SPEC } = require("../../../config/sora_spec");
const { generateXMoonEventAiText, detectMoonEvent } = require("../../../usecases/channels/x/ai/moon_event");
const { generateXNightAiText } = require("../../../usecases/channels/x/ai/night");
const { generateXNext30DaysAiText, buildNext30DaysContext } = require("../../../usecases/channels/x/ai/next_30_days");
const { uploadMedia } = require("../../../integrations/x/x_api");
const {
  DEFAULT_X_CANVAS,
  renderXMorningWheelPng,
  renderXResonanceWheelPng,
} = require("../../../engine/renderers/x/morning_wheel");
const { renderXNightMoonPng } = require("../../../engine/renderers/x/night_moon");
const { buildPublicStorySnapshot } = require("../../../usecases/story/store");
const {
  acquireXPostLock,
  markXPostLock,
  getXResonanceRecentKeys,
  pushXResonanceRecentKey,
} = require("./locks");
const { buildMorningPosts, buildResonancePost, buildNightPosts } = require("./planning");
const {
  parseJsonSafe,
  addDaysToDateLocalJST,
  pickPreviewMoonEvent,
  truncateForX,
  resolveXMaxChars,
  ensureXMeta,
} = require("./utils");
const {
  writeLocalPosts,
  saveXPostFailure,
  notifyXPostFailure,
} = require("./io");
const { postThreadToX, postSingleToX } = require("./publish");


async function runXMorningPost(deps, opts = {}) {
  const { env, storyService, renderers, dict, db } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXMorningMain || !renderers?.renderXMorningLog || !renderers?.renderXResonance) {
    throw new Error("renderers.renderXMorningMain/renderXMorningLog/renderXResonance missing");
  }

  const env2 = resolveEnv(env);
  const dryRun = toBool(opts.dryRun ?? opts.dry_run ?? env2.X_POST_DRY_RUN, false);
  const useAi = opts.useAi === undefined ? true : toBool(opts.useAi, true);
  const localOnly = toBool(
    opts.local ?? opts.localOnly ?? opts.local_only ?? env2.X_POST_LOCAL_ONLY,
    false
  );
  const includeResonance = false;

  const asOfISO = String(opts.asOfISO || opts.as_of || "").trim() || new Date().toISOString();
  const dateLocal = isYYYYMMDD(opts.dateLocal)
    ? String(opts.dateLocal)
    : toDateLocalJST(new Date(asOfISO));
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.X_POST_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "x", "morning", dateLocal || "unknown")
  );

  if (useAi && !String(env2.OPENAI_API_KEY || "").trim()) {
    throw new Error("OPENAI_API_KEY missing");
  }

  let lockInfo = null;
  if (!dryRun && !localOnly) {
    lockInfo = await acquireXPostLock(db, "morning", dateLocal, { force: !!opts.force });
    if (!lockInfo.ok) {
      return {
        ok: true,
        skipped: true,
        reason: lockInfo.reason,
        date_local: dateLocal,
        as_of: asOfISO,
      };
    }
  }

  try {
    const story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;

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

  const maxOrb = Number.isFinite(Number(opts.resonanceOrbMax))
    ? Number(opts.resonanceOrbMax)
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
    console.error("[x:post] ai_generation_failed", {
      date_local: dateLocal,
      as_of: asOfISO,
      errors: buildErrors,
    });
    await saveXPostFailure({
      db,
      dateLocal,
      asOfISO,
      kind: "morning",
      posts: [],
      results: [],
      errors: buildErrors,
      meta: { reason: "ai_generation_failed", has_resonance: hasResonance },
    }).catch((err) => console.error("[x:outbox] save failed", err?.message || String(err)));
    await notifyXPostFailure({ env: env2, dateLocal, kind: "morning", errors: buildErrors });

    const result = {
      ok: false,
      dry_run: dryRun,
      date_local: dateLocal,
      as_of: asOfISO,
      error: "ai_generation_failed",
      details: Array.isArray(buildErrors) ? buildErrors : [],
    };
    if (!dryRun && !localOnly) {
      await markXPostLock(db, "morning", dateLocal, {
        status: "failed",
        reason: "ai_generation_failed",
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
      const png = await renderXMorningWheelPng({
        story,
        dateLabel: dateLocal,
        width: imageWidth,
        height: imageHeight,
        variant: imageVariant,
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
    await saveXPostFailure({
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
    }).catch((err) => console.error("[x:outbox] save failed", err?.message || String(err)));

    await notifyXPostFailure({
      env: env2,
      dateLocal,
      kind: "morning",
      errors: postErrors,
      results: postRes.results,
    });
  }

  if (!dryRun && !localOnly) {
    await markXPostLock(db, "morning", dateLocal, {
      status: okCount > 0 ? "done" : "failed",
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
    };
  } catch (err) {
    if (!dryRun && !localOnly) {
      await markXPostLock(db, "morning", dateLocal, {
        status: "failed",
        reason: err?.message || String(err),
        runId: lockInfo?.runId || null,
      }).catch(() => {});
    }
    throw err;
  }
}

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
  if (!dryRun && !localOnly) {
    lockInfo = await acquireXPostLock(db, "resonance", dateLocal, { force: !!opts.force });
    if (!lockInfo.ok) {
      return {
        ok: true,
        skipped: true,
        reason: lockInfo.reason,
        date_local: dateLocal,
        as_of: asOfISO,
      };
    }
  }

  try {
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

    if (!post && useAi && Array.isArray(buildErrors) && buildErrors.length) {
      console.error("[x:post] ai_generation_failed", {
        date_local: dateLocal,
        as_of: asOfISO,
        errors: buildErrors,
      });
      await saveXPostFailure({
        db,
        dateLocal,
        asOfISO,
        kind: "resonance",
        posts: [],
        results: [],
        errors: buildErrors,
        meta: { reason: "ai_generation_failed", has_resonance: hasResonance },
      }).catch((err) => console.error("[x:outbox] save failed", err?.message || String(err)));
      await notifyXPostFailure({ env: env2, dateLocal, kind: "resonance", errors: buildErrors });

      const result = {
        ok: false,
        dry_run: dryRun,
        date_local: dateLocal,
        as_of: asOfISO,
        error: "ai_generation_failed",
        details: Array.isArray(buildErrors) ? buildErrors : [],
      };
      if (!dryRun && !localOnly) {
        await markXPostLock(db, "resonance", dateLocal, {
          status: "failed",
          reason: "ai_generation_failed",
          runId: lockInfo?.runId || null,
        }).catch(() => {});
      }
      return result;
    }

    if (!post || !String(post.text || "").trim()) {
      const reason = skipReason || "no_resonance";
      if (!dryRun && !localOnly) {
        await markXPostLock(db, "resonance", dateLocal, {
          status: "skipped",
          reason,
          runId: lockInfo?.runId || null,
          meta: skipMeta || null,
        }).catch(() => {});
      }
      return {
        ok: true,
        skipped: true,
        reason,
        meta: skipMeta || null,
        dry_run: dryRun,
        date_local: dateLocal,
        as_of: asOfISO,
      };
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
      return {
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
      };
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
      return {
        ok: true,
        dry_run: true,
        date_local: dateLocal,
        as_of: asOfISO,
        post: trimmed,
        image: resonanceImageInfo,
      };
    }

    const res = await postSingleToX({
      text: trimmed.text,
      mediaIds: resonanceMediaId ? [resonanceMediaId] : null,
      env: env2,
    });
    if (!dryRun && !localOnly) {
      await markXPostLock(db, "resonance", dateLocal, {
        status: "done",
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
    return {
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
    };
  } catch (err) {
    if (!dryRun && !localOnly) {
      await markXPostLock(db, "resonance", dateLocal, {
        status: "failed",
        reason: err?.message || String(err),
        runId: lockInfo?.runId || null,
      }).catch(() => {});
    }
    throw err;
  }
}

async function runXNightPost(deps, opts = {}) {
  const { env, storyService, renderers, dict, db } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXNight) throw new Error("renderers.renderXNight missing");

  const env2 = resolveEnv(env);
  const dryRun = toBool(opts.dryRun ?? opts.dry_run ?? env2.X_POST_DRY_RUN, false);
  const useAi = opts.useAi === undefined ? true : toBool(opts.useAi, true);
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
    path.join(process.cwd(), "tmp", "x", "night", dateLocal || "unknown")
  );

  if (useAi && !String(env2.OPENAI_API_KEY || "").trim()) {
    throw new Error("OPENAI_API_KEY missing");
  }

  let lockInfo = null;
  if (!dryRun && !localOnly) {
    lockInfo = await acquireXPostLock(db, "night", dateLocal, { force: !!opts.force });
    if (!lockInfo.ok) {
      return {
        ok: true,
        skipped: true,
        reason: lockInfo.reason,
        date_local: dateLocal,
        as_of: asOfISO,
      };
    }
  }

  try {
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
      const result = {
        ok: false,
        dry_run: dryRun,
        date_local: dateLocal,
        as_of: asOfISO,
        error: "ai_generation_failed",
        details: [{ slot: "night", error: res?.error || "unknown", reason: res?.reason || "" }],
      };
      if (!dryRun && !localOnly) {
        await markXPostLock(db, "night", dateLocal, {
          status: "failed",
          reason: "ai_generation_failed",
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
    return {
      ok: true,
      dry_run: true,
      date_local: dateLocal,
      as_of: asOfISO,
      posts: trimmed,
      image: nightImageInfo,
    };
  }

  const text = trimmed[0]?.text || "";
  const res = await postSingleToX({ text, mediaIds: nightMediaId ? [nightMediaId] : null, env: env2 });

  if (!dryRun && !localOnly) {
    await markXPostLock(db, "night", dateLocal, {
      status: "done",
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
  };
  } catch (err) {
    if (!dryRun && !localOnly) {
      await markXPostLock(db, "night", dateLocal, {
        status: "failed",
        reason: err?.message || String(err),
        runId: lockInfo?.runId || null,
      }).catch(() => {});
    }
    throw err;
  }
}

async function runXMoonEventPost(deps, opts = {}) {
  const { env, storyService, renderers, dict } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXMoonEvent) throw new Error("renderers.renderXMoonEvent missing");

  const env2 = resolveEnv(env);
  const dryRun = toBool(opts.dryRun ?? opts.dry_run ?? env2.X_POST_DRY_RUN, false);
  const useAi = opts.useAi === undefined ? true : toBool(opts.useAi, true);
  const localOnly = toBool(
    opts.local ?? opts.localOnly ?? opts.local_only ?? env2.X_POST_LOCAL_ONLY,
    false
  );
  const previewRaw = opts.previewOnMissing ?? opts.preview_on_missing ?? env2.X_MOON_EVENT_PREVIEW_ON_MISSING;
  const previewOnMissing = previewRaw === undefined ? (dryRun || localOnly) : toBool(previewRaw, false);

  const asOfISO = String(opts.asOfISO || opts.as_of || "").trim() || new Date().toISOString();
  const baseDateLocal = isYYYYMMDD(opts.dateLocal)
    ? String(opts.dateLocal)
    : toDateLocalJST(new Date(asOfISO));

  const offsetRaw = opts.dateOffsetDays ?? opts.date_offset_days ?? opts.dateOffset ?? opts.date_offset;
  const offsetDays = Number.isFinite(Number(offsetRaw))
    ? Number(offsetRaw)
    : Number.isFinite(Number(env2.X_MOON_EVENT_DATE_OFFSET_DAYS))
      ? Number(env2.X_MOON_EVENT_DATE_OFFSET_DAYS)
      : 1;

  const dateLocal = addDaysToDateLocalJST(baseDateLocal, offsetDays);
  const localOutDir = String(
    opts.localOutDir ||
    opts.local_out_dir ||
    env2.X_POST_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "x", "moon_event", dateLocal || "unknown")
  );

  const story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;
  const meta = ensureXMeta(story);

  let event = detectMoonEvent({ story, dict, asOfISO });
  if (!event && previewOnMissing && (dryRun || localOnly)) {
    event = pickPreviewMoonEvent({ dict, asOfISO });
    if (event) {
      meta.x_source.moon_event = event;
      meta.x_moon_event_preview = true;
      meta.x_moon_event_preview_reason = "moon_event_missing";
    }
  }
  if (!event) {
    return {
      ok: true,
      dry_run: dryRun,
      date_local: dateLocal,
      as_of: asOfISO,
      skipped: true,
      reason: "moon_event_missing",
      date_offset_days: offsetDays,
    };
  }

    if (useAi) {
      const apiKey = String(env2.OPENAI_API_KEY || "").trim();
      if (apiKey) {
        try {
          const maxChars = resolveXMaxChars(
            Number.isFinite(Number(env2.X_POST_MOON_EVENT_MAX_CHARS)) ? Number(env2.X_POST_MOON_EVENT_MAX_CHARS) : env2.X_POST_MAX_CHARS
          );
          let moonEventAiMax = null;
          if (Number.isFinite(Number(maxChars))) {
            story.meta = story.meta && typeof story.meta === "object" ? story.meta : {};
            story.meta.x_ai = story.meta.x_ai && typeof story.meta.x_ai === "object" ? story.meta.x_ai : {};
            const prev = story.meta.x_ai.moon_event;
            story.meta.x_ai.moon_event = "";
            const headerText = await renderers.renderXMoonEvent(story);
            story.meta.x_ai.moon_event = prev;
            const headerLen = countChars(headerText || "");
            const budget = Math.max(0, Number(maxChars) - headerLen - 2);
            if (budget > 0) moonEventAiMax = budget;
          }
          const aiMaxRetries = Number.isFinite(Number(env2.X_POST_AI_MAX_RETRIES))
            ? Number(env2.X_POST_AI_MAX_RETRIES)
            : (Number.isFinite(Number(env2.X_AI_MAX_RETRIES)) ? Number(env2.X_AI_MAX_RETRIES) : 8);
          const res = await generateXMoonEventAiText({
            story,
            dict,
            event,
            openai: { apiKey, baseUrl: env2.OPENAI_BASE_URL, model: env2.OPENAI_MODEL },
            maxChars: moonEventAiMax ?? undefined,
            maxRetries: aiMaxRetries,
          });
        if (res?.ok && res.text) {
          story.meta = story.meta && typeof story.meta === "object" ? story.meta : {};
          story.meta.x_ai = story.meta.x_ai && typeof story.meta.x_ai === "object" ? story.meta.x_ai : {};
          story.meta.x_ai.moon_event = res.text;
        } else if (story?.meta) {
          story.meta.x_moon_event_ai_error = res?.error || "unknown";
          if (res?.reason) story.meta.x_moon_event_ai_error_reason = res.reason;
        }
      } catch (err) {
        if (story?.meta) story.meta.x_moon_event_ai_error = err?.message || "unknown";
      }
    } else if (story?.meta) {
      story.meta.x_moon_event_ai_error = "OPENAI_API_KEY missing";
    }
  }

  const textRaw = await renderers.renderXMoonEvent(story);
  const textTrimmed = String(textRaw || "").trim();
  if (!textTrimmed) {
    return {
      ok: true,
      dry_run: dryRun,
      date_local: dateLocal,
      as_of: asOfISO,
      skipped: true,
      reason: "moon_event_text_empty",
      date_offset_days: offsetDays,
    };
  }

  const maxChars = resolveXMaxChars(
    Number.isFinite(Number(env2.X_POST_MOON_EVENT_MAX_CHARS)) ? Number(env2.X_POST_MOON_EVENT_MAX_CHARS) : env2.X_POST_MAX_CHARS
  );
  const trimmed = truncateForX(textTrimmed, maxChars);

  if (localOnly) {
    const localPaths = writeLocalPosts({
      posts: [{ text: trimmed.text, slot: "moon_event" }],
      outDir: localOutDir,
      prefix: "x_moon_event",
    });
    return {
      ok: true,
      dry_run: true,
      local_only: true,
      date_local: dateLocal,
      as_of: asOfISO,
      event,
      post: trimmed,
      date_offset_days: offsetDays,
      local_dir: localOutDir,
      local_paths: localPaths,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      date_local: dateLocal,
      as_of: asOfISO,
      event,
      post: trimmed,
      date_offset_days: offsetDays,
    };
  }

  const res = await postSingleToX({ text: trimmed.text, env: env2 });
  return {
    ok: true,
    dry_run: false,
    date_local: dateLocal,
    as_of: asOfISO,
    event,
    post: trimmed,
    tweet_ids: [res?.id || ""],
    date_offset_days: offsetDays,
  };
}

async function runXNext30DaysPost(deps, opts = {}) {
  const { env, storyService, renderers, dict } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXNext30Days) throw new Error("renderers.renderXNext30Days missing");
  if (!renderers?.renderXNext30DaysFlow) throw new Error("renderers.renderXNext30DaysFlow missing");

  const env2 = resolveEnv(env);
  const dryRun = toBool(opts.dryRun ?? opts.dry_run ?? env2.X_POST_DRY_RUN, false);
  const useAi = opts.useAi === undefined ? true : toBool(opts.useAi, true);
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
    path.join(process.cwd(), "tmp", "x", "next_30_days", dateLocal || "unknown")
  );

  if (useAi && !String(env2.OPENAI_API_KEY || "").trim()) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;

  if (useAi) {
    const aiMaxRetries = Number.isFinite(Number(env2.X_POST_AI_MAX_RETRIES))
      ? Number(env2.X_POST_AI_MAX_RETRIES)
      : (Number.isFinite(Number(env2.X_AI_MAX_RETRIES)) ? Number(env2.X_AI_MAX_RETRIES) : 8);
    const maxChars = resolveXMaxChars(
      Number.isFinite(Number(env2.X_POST_MONTHLY_MAX_CHARS)) ? Number(env2.X_POST_MONTHLY_MAX_CHARS) : env2.X_POST_MAX_CHARS
    );
    let next30AiMax = null;
    if (Number.isFinite(Number(maxChars))) {
      story.meta = story.meta && typeof story.meta === "object" ? story.meta : {};
      story.meta.x_ai = story.meta.x_ai && typeof story.meta.x_ai === "object" ? story.meta.x_ai : {};
      const prev = story.meta.x_ai.next_30_days;
      story.meta.x_ai.next_30_days = "";
      const headerText = await renderers.renderXNext30Days(story);
      story.meta.x_ai.next_30_days = prev;
      const headerLen = countChars(headerText || "");
      const budget = Math.max(0, Number(maxChars) - headerLen - 2);
      if (budget > 0) next30AiMax = budget;
    }
    const res = await generateXNext30DaysAiText({
      story,
      dict,
      openai: { apiKey: env2.OPENAI_API_KEY, baseUrl: env2.OPENAI_BASE_URL, model: env2.OPENAI_MODEL },
      maxChars: next30AiMax ?? undefined,
      maxRetries: aiMaxRetries,
    });
    if (res?.ok && res.text) {
      story.meta = story.meta && typeof story.meta === "object" ? story.meta : {};
      story.meta.x_ai = story.meta.x_ai && typeof story.meta.x_ai === "object" ? story.meta.x_ai : {};
      story.meta.x_ai.next_30_days = res.text;
      story.meta.x_source = story.meta.x_source && typeof story.meta.x_source === "object" ? story.meta.x_source : {};
      story.meta.x_source.next_30_days_context = res.context || buildNext30DaysContext({ story, dict, asOfISO });
    } else {
      story.meta = story.meta && typeof story.meta === "object" ? story.meta : {};
      story.meta.x_next_30_days_ai_error = res?.error || "unknown";
      if (res?.reason) story.meta.x_next_30_days_ai_error_reason = res.reason;
    }
  }

  const mainRaw = await renderers.renderXNext30Days(story);
  const mainTrimmed = String(mainRaw || "").trim();
  if (!mainTrimmed) {
    return {
      ok: false,
      dry_run: dryRun,
      date_local: dateLocal,
      as_of: asOfISO,
      error: "next_30_days_text_empty",
    };
  }

  const maxChars = resolveXMaxChars(
    Number.isFinite(Number(env2.X_POST_MONTHLY_MAX_CHARS)) ? Number(env2.X_POST_MONTHLY_MAX_CHARS) : env2.X_POST_MAX_CHARS
  );
  const mainTrim = truncateForX(mainTrimmed, maxChars);

  const flowRaw = await renderers.renderXNext30DaysFlow(story);
  const flowTrimmed = String(flowRaw || "").trim();
  const flowTrim = flowTrimmed ? truncateForX(flowTrimmed, maxChars) : null;

  if (localOnly) {
    const posts = flowTrim ? [mainTrim, flowTrim] : [mainTrim];
    const localPaths = writeLocalPosts({
      posts: posts.map((p, idx) => ({ text: p.text, slot: `next_30_days_${idx + 1}` })),
      outDir: localOutDir,
      prefix: "x_next_30_days",
    });
    return {
      ok: true,
      dry_run: true,
      local_only: true,
      date_local: dateLocal,
      as_of: asOfISO,
      posts,
      local_dir: localOutDir,
      local_paths: localPaths,
    };
  }

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      date_local: dateLocal,
      as_of: asOfISO,
      posts: flowTrim ? [mainTrim, flowTrim] : [mainTrim],
    };
  }

  const res = flowTrim
    ? await postThreadToX({ posts: [mainTrim, flowTrim], env: env2 })
    : await postSingleToX({ text: mainTrim.text, env: env2 });
  return {
    ok: true,
    dry_run: false,
    date_local: dateLocal,
    as_of: asOfISO,
    posts: flowTrim ? [mainTrim, flowTrim] : [mainTrim],
    tweet_ids: flowTrim ? res.ids : [res?.id || ""],
  };
}

module.exports = {
  runXMorningPost,
  runXResonancePost,
  runXNightPost,
  runXMoonEventPost,
  runXNext30DaysPost,
};
