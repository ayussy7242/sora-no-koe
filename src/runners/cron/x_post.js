"use strict";

const { toDateLocalJST, isYYYYMMDD } = require("../../utils/time_utils");
const { normalizeStoryArgs } = require("../../usecases/story/story_args");
const { SPEC } = require("../../config/sora_spec");
const { generateXSoraAiText } = require("../../usecases/channels/x/generate_x_sora_ai");
const { generateXNightAiText } = require("../../usecases/channels/x/generate_x_night_ai");
const { generateXResonanceAiText, pickPrimaryResonanceAspect } = require("../../usecases/channels/x/generate_x_resonance_ai");
const { generateXMoonEventAiText, detectMoonEvent } = require("../../usecases/channels/x/generate_x_moon_event_ai");
const { generateXNext30DaysAiText, buildNext30DaysContext } = require("../../usecases/channels/x/generate_x_next_30_days_ai");
const { postTweet, uploadMedia } = require("../../integrations/x/x_api");
const { DEFAULT_X_CANVAS, renderXMorningWheelPng } = require("../../engine/renderers/x/morning_wheel");

function toBool(v, fallback = false) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v !== "string") return fallback;
  const t = v.trim().toLowerCase();
  if (!t) return fallback;
  return ["1", "true", "yes", "on"].includes(t);
}

function parseJsonSafe(raw) {
  try {
    return JSON.parse(String(raw || ""));
  } catch (_) {
    return null;
  }
}

function addDaysToDateLocalJST(dateLocal, offsetDays) {
  if (!isYYYYMMDD(dateLocal)) return dateLocal;
  const base = new Date(`${dateLocal}T00:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return dateLocal;
  const shiftMs = Number(offsetDays) * 86400000;
  if (!Number.isFinite(shiftMs) || shiftMs === 0) return dateLocal;
  const shifted = new Date(base.getTime() + shiftMs);
  return toDateLocalJST(shifted);
}

function truncateForX(text, maxChars) {
  const chars = Array.from(String(text || ""));
  if (!Number.isFinite(Number(maxChars)) || maxChars <= 0) {
    return { text: String(text || ""), truncated: false };
  }
  if (chars.length <= maxChars) return { text: chars.join(""), truncated: false };
  const trimmed = chars.slice(0, Math.max(0, maxChars - 3)).join("") + "...";
  return { text: trimmed, truncated: true };
}

function ensureXMeta(story) {
  story.meta = story.meta && typeof story.meta === "object" ? story.meta : {};
  story.meta.x_ai = story.meta.x_ai && typeof story.meta.x_ai === "object" ? story.meta.x_ai : {};
  story.meta.x_source = story.meta.x_source && typeof story.meta.x_source === "object" ? story.meta.x_source : {};
  return story.meta;
}

async function buildMorningPosts({ story, dict, renderers, openai, useAi, maxOrbDeg }) {
  const meta = ensureXMeta(story);
  const errors = [];

  if (useAi) {
    const res = await generateXSoraAiText({ story, dict, openai });
    if (res?.ok && res.text) {
      meta.x_ai.morning = res.text;
    } else {
      errors.push({ slot: "morning", error: res?.error || "unknown", reason: res?.reason || "" });
    }
  }

  const picked = pickPrimaryResonanceAspect({ story, dict, maxOrbDeg });
  if (picked?.raw) meta.x_source.resonance_aspect = picked.raw;

  if (useAi && picked) {
    const res = await generateXResonanceAiText({ story, dict, openai, aspect: picked });
    if (res?.ok && res.text) {
      meta.x_ai.resonance = res.text;
    } else {
      errors.push({ slot: "resonance", error: res?.error || "unknown", reason: res?.reason || "" });
    }
  }

  if (errors.length && useAi) {
    return { posts: [], hasResonance: !!picked, errors };
  }

  const morningText = await renderers.renderXMorningMain(story);
  const logText = await renderers.renderXMorningLog(story);
  const resonanceText = await renderers.renderXResonance(story);

  const posts = [
    { text: morningText, slot: "main" },
    { text: logText, slot: "log" },
    { text: resonanceText, slot: "resonance" },
  ]
    .map((it) => ({ ...it, text: String(it.text || "").trim() }))
    .filter((it) => it.text);

  return {
    posts,
    hasResonance: !!(resonanceText && String(resonanceText).trim()),
    errors,
  };
}

async function buildNightPosts({ story, dict, renderers, openai, useAi }) {
  const meta = ensureXMeta(story);

  if (useAi) {
    const res = await generateXNightAiText({ story, dict, openai });
    if (res?.ok && res.text) meta.x_ai.night = res.text;
  }

  const text = await renderers.renderXNight(story);
  return { posts: [String(text || "").trim()].filter(Boolean) };
}

async function postThreadToX({ posts, env }) {
  const ids = [];
  let replyTo = null;
  for (const item of posts) {
    const text = typeof item === "string" ? item : item?.text;
    const mediaIds = typeof item === "string" ? null : item?.mediaIds;
    const res = await postTweet({ text, replyToId: replyTo, mediaIds, env });
    const id = res?.id || "";
    ids.push(id);
    replyTo = id || replyTo;
  }
  return ids;
}

async function runXMorningPost(deps, opts = {}) {
  const { env, storyService, renderers, dict } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXMorningMain || !renderers?.renderXMorningLog || !renderers?.renderXResonance) {
    throw new Error("renderers.renderXMorningMain/renderXMorningLog/renderXResonance missing");
  }

  const env2 = { ...(env || {}), ...(process.env || {}) };
  const dryRun = toBool(opts.dryRun ?? opts.dry_run ?? env2.X_POST_DRY_RUN, false);
  const useAi = opts.useAi === undefined ? true : toBool(opts.useAi, true);

  const asOfISO = String(opts.asOfISO || opts.as_of || "").trim() || new Date().toISOString();
  const dateLocal = isYYYYMMDD(opts.dateLocal)
    ? String(opts.dateLocal)
    : toDateLocalJST(new Date(asOfISO));

  const orbMaxDeg = Number.isFinite(Number(opts.orbMaxDeg)) ? Number(opts.orbMaxDeg) : 6;
  const precisionDeg = Number.isFinite(Number(opts.precisionDeg)) ? Number(opts.precisionDeg) : 0.01;

  if (useAi && !String(env2.OPENAI_API_KEY || "").trim()) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const story = await storyService.buildStoryForUser(
    normalizeStoryArgs({
      appUserId: "public",
      mode: "public",
      dateLocal,
      asOfISO,
      orbMaxDeg,
      precisionDeg,
    })
  );

  const openai = {
    apiKey: env2.OPENAI_API_KEY,
    baseUrl: env2.OPENAI_BASE_URL,
    model: env2.OPENAI_MODEL,
  };

  const maxOrb = Number.isFinite(Number(opts.resonanceOrbMax))
    ? Number(opts.resonanceOrbMax)
    : Number.isFinite(Number(env2.X_RESONANCE_ORB_MAX))
      ? Number(env2.X_RESONANCE_ORB_MAX)
      : Number(SPEC?.orb?.free ?? 1.5);

  const { posts, hasResonance, errors } = await buildMorningPosts({
    story,
    dict,
    renderers,
    openai,
    useAi,
    maxOrbDeg: maxOrb,
  });

  if (Array.isArray(posts) && posts.length === 0 && useAi) {
    return {
      ok: false,
      dry_run: dryRun,
      date_local: dateLocal,
      as_of: asOfISO,
      error: "ai_generation_failed",
      details: Array.isArray(errors) ? errors : [],
    };
  }

  const maxMainChars = Number.isFinite(Number(env2.X_POST_MAIN_MAX_CHARS))
    ? Number(env2.X_POST_MAIN_MAX_CHARS)
    : 180;
  const maxLogChars = Number.isFinite(Number(env2.X_POST_LOG_MAX_CHARS))
    ? Number(env2.X_POST_LOG_MAX_CHARS)
    : (Number.isFinite(Number(env2.X_POST_MAX_CHARS)) ? Number(env2.X_POST_MAX_CHARS) : 270);
  const maxResonanceChars = Number.isFinite(Number(env2.X_POST_RESONANCE_MAX_CHARS))
    ? Number(env2.X_POST_RESONANCE_MAX_CHARS)
    : (Number.isFinite(Number(env2.X_POST_MAX_CHARS)) ? Number(env2.X_POST_MAX_CHARS) : 270);

  const trimmed = posts.map((post) => {
    const limit = post.slot === "main"
      ? maxMainChars
      : post.slot === "resonance"
        ? maxResonanceChars
        : maxLogChars;
    const res = truncateForX(post.text, limit);
    return { text: res.text, truncated: res.truncated };
  });

  const imageEnabled = opts.image === undefined
    ? toBool(env2.X_POST_IMAGE_ENABLED ?? env2.X_POST_IMAGE, false)
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
      mediaIds: idx === 0 && mediaId ? [mediaId] : null,
    }))
    .filter((p) => String(p.text || "").trim());
  const tweetIds = await postThreadToX({ posts: payloads, env: env2 });

  return {
    ok: true,
    dry_run: false,
    date_local: dateLocal,
    as_of: asOfISO,
    posts: trimmed,
    tweet_ids: tweetIds,
    has_resonance: hasResonance,
    image: imageInfo,
  };
}

async function runXNightPost(deps, opts = {}) {
  const { env, storyService, renderers, dict } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXNight) throw new Error("renderers.renderXNight missing");

  const env2 = { ...(env || {}), ...(process.env || {}) };
  const dryRun = toBool(opts.dryRun ?? opts.dry_run ?? env2.X_POST_DRY_RUN, false);
  const useAi = opts.useAi === undefined ? true : toBool(opts.useAi, true);

  const asOfISO = String(opts.asOfISO || opts.as_of || "").trim() || new Date().toISOString();
  const dateLocal = isYYYYMMDD(opts.dateLocal)
    ? String(opts.dateLocal)
    : toDateLocalJST(new Date(asOfISO));

  const orbMaxDeg = Number.isFinite(Number(opts.orbMaxDeg)) ? Number(opts.orbMaxDeg) : 6;
  const precisionDeg = Number.isFinite(Number(opts.precisionDeg)) ? Number(opts.precisionDeg) : 0.01;

  if (useAi && !String(env2.OPENAI_API_KEY || "").trim()) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const story = await storyService.buildStoryForUser(
    normalizeStoryArgs({
      appUserId: "public",
      mode: "public",
      dateLocal,
      asOfISO,
      orbMaxDeg,
      precisionDeg,
    })
  );

  const openai = {
    apiKey: env2.OPENAI_API_KEY,
    baseUrl: env2.OPENAI_BASE_URL,
    model: env2.OPENAI_MODEL,
  };

  const meta = ensureXMeta(story);
  if (useAi) {
    const res = await generateXNightAiText({ story, dict, openai });
    if (res?.ok && res.text) {
      meta.x_ai.night = res.text;
    } else {
      return {
        ok: false,
        dry_run: dryRun,
        date_local: dateLocal,
        as_of: asOfISO,
        error: "ai_generation_failed",
        details: [{ slot: "night", error: res?.error || "unknown", reason: res?.reason || "" }],
      };
    }
  }

  const { posts } = await buildNightPosts({ story, dict, renderers, openai, useAi: false });

  const maxChars = Number.isFinite(Number(env2.X_POST_MAX_CHARS))
    ? Number(env2.X_POST_MAX_CHARS)
    : 270;

  const trimmed = posts.map((post) => {
    const res = truncateForX(post, maxChars);
    return { text: res.text, truncated: res.truncated };
  });

  const nightImageEnabled = opts.image === undefined
    ? toBool(env2.X_NIGHT_IMAGE_ENABLED ?? env2.X_POST_IMAGE_ENABLED ?? env2.X_POST_IMAGE, false)
    : toBool(opts.image, false);
  const nightImageWidth = Number.isFinite(Number(env2.X_NIGHT_IMAGE_WIDTH))
    ? Number(env2.X_NIGHT_IMAGE_WIDTH)
    : (Number.isFinite(Number(env2.X_POST_IMAGE_WIDTH)) ? Number(env2.X_POST_IMAGE_WIDTH) : DEFAULT_X_CANVAS.width);
  const nightImageHeight = Number.isFinite(Number(env2.X_NIGHT_IMAGE_HEIGHT))
    ? Number(env2.X_NIGHT_IMAGE_HEIGHT)
    : (Number.isFinite(Number(env2.X_POST_IMAGE_HEIGHT)) ? Number(env2.X_POST_IMAGE_HEIGHT) : DEFAULT_X_CANVAS.height);
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
        const png = await renderXMorningWheelPng({
          story,
          dateLabel: dateLocal,
          width: nightImageWidth,
          height: nightImageHeight,
          variant: nightImageVariant,
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
  const res = await postTweet({ text, mediaIds: nightMediaId ? [nightMediaId] : null, env: env2 });

  return {
    ok: true,
    dry_run: false,
    date_local: dateLocal,
    as_of: asOfISO,
    posts: trimmed,
    tweet_ids: [res?.id || ""],
    image: nightImageInfo,
  };
}

async function runXMoonEventPost(deps, opts = {}) {
  const { env, storyService, renderers, dict } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXMoonEvent) throw new Error("renderers.renderXMoonEvent missing");

  const env2 = { ...(env || {}), ...(process.env || {}) };
  const dryRun = toBool(opts.dryRun ?? opts.dry_run ?? env2.X_POST_DRY_RUN, false);
  const useAi = opts.useAi === undefined ? true : toBool(opts.useAi, true);

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

  const story = await storyService.buildStoryForUser(
    normalizeStoryArgs({
      appUserId: "public",
      mode: "public",
      dateLocal,
      asOfISO,
    })
  );

  const event = detectMoonEvent({ story, dict, asOfISO });
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
        const res = await generateXMoonEventAiText({
          story,
          dict,
          event,
          openai: { apiKey, baseUrl: env2.OPENAI_BASE_URL, model: env2.OPENAI_MODEL },
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

  const maxChars = Number.isFinite(Number(env2.X_POST_MOON_EVENT_MAX_CHARS))
    ? Number(env2.X_POST_MOON_EVENT_MAX_CHARS)
    : (Number.isFinite(Number(env2.X_POST_MAX_CHARS)) ? Number(env2.X_POST_MAX_CHARS) : 270);
  const trimmed = truncateForX(textTrimmed, maxChars);

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

  const res = await postTweet({ text: trimmed.text, env: env2 });
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

  const env2 = { ...(env || {}), ...(process.env || {}) };
  const dryRun = toBool(opts.dryRun ?? opts.dry_run ?? env2.X_POST_DRY_RUN, false);
  const useAi = opts.useAi === undefined ? true : toBool(opts.useAi, true);

  const asOfISO = String(opts.asOfISO || opts.as_of || "").trim() || new Date().toISOString();
  const dateLocal = isYYYYMMDD(opts.dateLocal)
    ? String(opts.dateLocal)
    : toDateLocalJST(new Date(asOfISO));

  if (useAi && !String(env2.OPENAI_API_KEY || "").trim()) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const story = await storyService.buildStoryForUser(
    normalizeStoryArgs({
      appUserId: "public",
      mode: "public",
      dateLocal,
      asOfISO,
    })
  );

  if (useAi) {
    const res = await generateXNext30DaysAiText({
      story,
      dict,
      openai: { apiKey: env2.OPENAI_API_KEY, baseUrl: env2.OPENAI_BASE_URL, model: env2.OPENAI_MODEL },
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

  const maxChars = Number.isFinite(Number(env2.X_POST_MONTHLY_MAX_CHARS))
    ? Number(env2.X_POST_MONTHLY_MAX_CHARS)
    : (Number.isFinite(Number(env2.X_POST_MAX_CHARS)) ? Number(env2.X_POST_MAX_CHARS) : 270);
  const mainTrim = truncateForX(mainTrimmed, maxChars);

  const flowRaw = await renderers.renderXNext30DaysFlow(story);
  const flowTrimmed = String(flowRaw || "").trim();
  const flowTrim = flowTrimmed ? truncateForX(flowTrimmed, maxChars) : null;

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
    : [await postTweet({ text: mainTrim.text, env: env2 })];
  return {
    ok: true,
    dry_run: false,
    date_local: dateLocal,
    as_of: asOfISO,
    posts: flowTrim ? [mainTrim, flowTrim] : [mainTrim],
    tweet_ids: Array.isArray(res) ? res : [res?.id || ""],
  };
}

module.exports = {
  runXMorningPost,
  runXNightPost,
  runXMoonEventPost,
  runXNext30DaysPost,
};
