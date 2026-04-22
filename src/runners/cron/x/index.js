"use strict";

const path = require("path");
const { toDateLocalJST, isYYYYMMDD } = require("../../../utils/time");
const { countChars } = require("../../../utils/text/hashtag");
const { toBool } = require("../../../utils/data/bool");
const { resolveEnv } = require("../../../utils/env");
const { generateXMoonEventAiText, detectMoonEvent } = require("../../../usecases/channels/x/ai/moon_event");
const { generateXNext30DaysAiText, buildNext30DaysContext } = require("../../../usecases/channels/x/ai/next_30_days");
const { buildPublicStorySnapshot } = require("../../../usecases/story/store");
const { parseJsonSafe, addDaysToDateLocalJST, pickPreviewMoonEvent, truncateForX, resolveXMaxChars, ensureXMeta } = require("./utils");
const { writeLocalPosts } = require("./io");
const { postThreadToX, postSingleToX } = require("./publish");
const { runXMorningPost } = require("./morning");
const { runXResonancePost } = require("./resonance");
const { runXNightPost } = require("./night");

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
