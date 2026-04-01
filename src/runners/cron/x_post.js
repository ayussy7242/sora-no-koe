"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { toDateLocalJST, isYYYYMMDD } = require("../../utils/time_utils");
const { countChars, trimTrailingHashtagsToMaxChars } = require("../../utils/hashtag_utils");
const { SPEC } = require("../../config/sora_spec");
const { generateXSoraAiText } = require("../../usecases/channels/x/ai/generate_x_sora");
const { generateXNightAiText } = require("../../usecases/channels/x/ai/generate_x_night");
const { generateXResonanceAiText } = require("../../usecases/channels/x/ai/generate_x_resonance");
const { pickPrimaryResonanceAspect } = require("../../domain/resonance");
const { generateXMoonEventAiText, detectMoonEvent } = require("../../usecases/channels/x/ai/generate_x_moon_event");
const { buildNextMoonEvents, orderedMoonEvents, formatMoonEventDisplay } = require("../../domain/moon_info");
const { generateXNext30DaysAiText, buildNext30DaysContext } = require("../../usecases/channels/x/ai/generate_x_next_30_days");
const { postTweet, uploadMedia } = require("../../integrations/x/x_api");
const { DEFAULT_X_CANVAS, renderXMorningWheelPng } = require("../../engine/renderers/x/morning_wheel");
const { buildPublicStorySnapshot } = require("../../usecases/story/store");

const X_POST_LOCK_TTL_MS = 35 * 60 * 1000;

function nowIso(ms = Date.now()) {
  return new Date(ms).toISOString();
}

function writeLocalPosts({ posts = [], outDir, prefix = "x_post" } = {}) {
  if (!outDir) return [];
  fs.mkdirSync(outDir, { recursive: true });
  const paths = [];
  posts.forEach((post, idx) => {
    const slot = post?.slot || `slot${idx + 1}`;
    const file = path.join(outDir, `${prefix}_${slot}_${idx + 1}.txt`);
    fs.writeFileSync(file, String(post?.text || ""), "utf8");
    paths.push(file);
  });
  return paths;
}

async function acquireXPostLock(db, kind, dateLocal, { force = false } = {}) {
  if (!db) return { ok: true, skipped: true, reason: "db_missing" };
  const runId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const ref = db.collection("cronLocks").doc(`x_post_${kind}_${dateLocal}`);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data() || {};
      const status = String(data.status || "");
      const startedAtMs = Number(data.startedAtMs || 0);
      const isStale = startedAtMs > 0 && (now - startedAtMs) > X_POST_LOCK_TTL_MS;
      if (status === "done" && !force) {
        return { ok: false, reason: "done", data };
      }
      if (status === "running" && !isStale) {
        return { ok: false, reason: "running", data };
      }
    }

    tx.set(ref, {
      status: "running",
      kind,
      date_local: dateLocal,
      runId,
      startedAtMs: now,
      startedAt: nowIso(now),
    }, { merge: true });

    return { ok: true, runId };
  });
}

async function markXPostLock(db, kind, dateLocal, patch) {
  if (!db) return;
  const ref = db.collection("cronLocks").doc(`x_post_${kind}_${dateLocal}`);
  const now = Date.now();
  await ref.set({
    ...patch,
    finishedAtMs: now,
    finishedAt: nowIso(now),
  }, { merge: true });
}

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

function pickPreviewMoonEvent({ dict, asOfISO }) {
  const events = buildNextMoonEvents(asOfISO, dict);
  const ordered = orderedMoonEvents(events);
  const next = ordered[0];
  if (!next) return null;
  const display = formatMoonEventDisplay(next);
  return display ? { ...next, ...display } : next;
}

function truncateForX(text, maxChars) {
  const raw = String(text || "");
  if (!Number.isFinite(Number(maxChars)) || maxChars <= 0) {
    return { text: raw, truncated: false };
  }
  const withTrimmedTags = trimTrailingHashtagsToMaxChars(raw, maxChars);
  if (countChars(withTrimmedTags) <= maxChars) {
    return { text: withTrimmedTags, truncated: withTrimmedTags !== raw };
  }
  const chars = Array.from(withTrimmedTags);
  const trimmed = chars.slice(0, Math.max(0, maxChars)).join("");
  return { text: trimmed, truncated: true };
}

const X_HARD_MAX_CHARS = 180;

function resolveXMaxChars(value, fallback = X_HARD_MAX_CHARS) {
  const resolved = Number.isFinite(Number(value)) ? Number(value) : fallback;
  return Math.min(resolved, X_HARD_MAX_CHARS);
}

function safePreview(text, maxLen = 80) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const chars = Array.from(raw);
  if (chars.length <= maxLen) return raw;
  return chars.slice(0, Math.max(0, maxLen - 1)).join("") + "…";
}

function normalizeXError(err) {
  return {
    message: err?.message || String(err),
    status: err?.status || null,
    code: err?.code || null,
    body: err?.body || null,
    name: err?.name || null,
  };
}

function ensureXMeta(story) {
  story.meta = story.meta && typeof story.meta === "object" ? story.meta : {};
  story.meta.x_ai = story.meta.x_ai && typeof story.meta.x_ai === "object" ? story.meta.x_ai : {};
  story.meta.x_source = story.meta.x_source && typeof story.meta.x_source === "object" ? story.meta.x_source : {};
  return story.meta;
}

async function buildMorningPosts({ story, dict, renderers, openai, useAi, maxOrbDeg, maxMainChars }) {
  const meta = ensureXMeta(story);
  const errors = [];
  let mainAiMax = null;

  if (useAi && Number.isFinite(Number(maxMainChars))) {
    const prev = meta.x_ai.morning;
    meta.x_ai.morning = "";
    const headerText = await renderers.renderXMorningMain(story);
    meta.x_ai.morning = prev;
    const headerLen = countChars(headerText);
    const budget = Math.max(0, Number(maxMainChars) - headerLen - 2);
    if (budget > 0) mainAiMax = budget;
  }

  if (useAi) {
    const res = await generateXSoraAiText({
      story,
      dict,
      openai,
      maxChars: mainAiMax ?? undefined,
    });
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
  const results = [];
  let replyTo = null;
  for (let idx = 0; idx < posts.length; idx += 1) {
    const item = posts[idx];
    const text = typeof item === "string" ? item : item?.text;
    const mediaIds = typeof item === "string" ? null : item?.mediaIds;
    const slot = typeof item === "string" ? `post_${idx + 1}` : (item?.slot || `post_${idx + 1}`);
    const textLen = countChars(text);

    try {
      const res = await postTweet({ text, replyToId: replyTo, mediaIds, env });
      const id = res?.id || "";
      if (!id) {
        const err = new Error("X post missing id");
        err.code = "X_POST_ID_MISSING";
        throw err;
      }
      ids.push(id);
      results.push({
        ok: true,
        slot,
        id,
        reply_to: replyTo,
        text_len: textLen,
      });
      replyTo = id;
    } catch (err) {
      const info = normalizeXError(err);
      results.push({
        ok: false,
        slot,
        error: info,
        reply_to: replyTo,
        text_len: textLen,
        text_preview: safePreview(text),
      });
      console.error("[x:post] failed", {
        slot,
        reply_to: replyTo,
        text_len: textLen,
        text_preview: safePreview(text),
        ...info,
      });
      // continue: keep replyTo as last successful
    }
  }
  return {
    ids,
    results,
    errors: results.filter((r) => !r.ok),
  };
}

async function saveXPostFailure({ db, dateLocal, asOfISO, kind, posts, results, errors, image, meta } = {}) {
  if (!db) return { ok: false, skipped: true, reason: "db_missing" };
  const outboxRoot = db.collection("posts_x_outbox").doc(dateLocal).collection("items");
  const ref = outboxRoot.doc();
  const payload = {
    kind: kind || "x",
    date_local: dateLocal,
    as_of: asOfISO,
    created_at: new Date().toISOString(),
    posts: Array.isArray(posts) ? posts : [],
    results: Array.isArray(results) ? results : [],
    errors: Array.isArray(errors) ? errors : [],
    image: image || null,
    meta: meta || null,
  };
  await ref.set(payload, { merge: true });
  return { ok: true, id: ref.id };
}

async function notifyXPostFailure({ env, dateLocal, kind, errors, results } = {}) {
  try {
    const env2 = { ...(env || {}), ...(process.env || {}) };
    const lineEnabled = toBool(env2.LINE_ENABLED, false);
    const accessToken = env2.LINE_CHANNEL_ACCESS_TOKEN;
    const ownerLineUserId = env2.OWNER_LINE_USER_ID;
    if (!lineEnabled || !accessToken || !ownerLineUserId) {
      return { ok: false, skipped: true, reason: "line_disabled_or_missing" };
    }

    const { createLineApi } = require("../../integrations/line/api");
    const { pushLineMessage } = require("../../integrations/line/messaging");

    const lineApiClient = createLineApi({ accessToken });
    const failedSlots = (Array.isArray(errors) ? errors : [])
      .map((e) => e?.slot)
      .filter(Boolean)
      .join(", ") || "unknown";
    const message = [
      "【X投稿エラー】",
      `種別: ${kind || "x"}`,
      `日付: ${dateLocal || "-"}`,
      `失敗: ${failedSlots}`,
      `件数: 成功${(Array.isArray(results) ? results.filter((r) => r.ok).length : 0)} / 失敗${Array.isArray(errors) ? errors.length : 0}`,
    ].join("\n");

    return await pushLineMessage({
      lineApiClient,
      to: ownerLineUserId,
      payload: message,
      meta: { kind, dateLocal },
    });
  } catch (err) {
    console.error("[x:notify] failed", err?.message || String(err));
    return { ok: false, error: err };
  }
}

async function runXMorningPost(deps, opts = {}) {
  const { env, storyService, renderers, dict, db } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXMorningMain || !renderers?.renderXMorningLog || !renderers?.renderXResonance) {
    throw new Error("renderers.renderXMorningMain/renderXMorningLog/renderXResonance missing");
  }

  const env2 = { ...(env || {}), ...(process.env || {}) };
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

  const { posts, hasResonance, errors: buildErrors } = await buildMorningPosts({
    story,
    dict,
    renderers,
    openai,
    useAi,
    maxOrbDeg: maxOrb,
    maxMainChars,
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
    if (toBool(env2.X_POST_IMAGE_ENABLED ?? env2.X_POST_IMAGE, false)) {
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

async function runXNightPost(deps, opts = {}) {
  const { env, storyService, renderers, dict, db } = deps || {};
  if (!env) throw new Error("env required");
  if (!storyService?.buildStoryForUser) throw new Error("storyService.buildStoryForUser missing");
  if (!renderers?.renderXNight) throw new Error("renderers.renderXNight missing");

  const env2 = { ...(env || {}), ...(process.env || {}) };
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

  if (useAi) {
    const res = await generateXNightAiText({
      story,
      dict,
      openai,
      maxChars: nightAiMax ?? undefined,
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
      const nightImageVariant = String(env2.X_NIGHT_IMAGE_VARIANT || env2.X_POST_IMAGE_VARIANT || "story_tomorrow").trim()
        || "story_tomorrow";
      const png = await renderXMorningWheelPng({
        story,
        dateLabel: dateLocal,
        width: nightImageWidth,
        height: nightImageHeight,
        variant: nightImageVariant,
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

  const env2 = { ...(env || {}), ...(process.env || {}) };
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
