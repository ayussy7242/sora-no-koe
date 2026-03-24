"use strict";

const crypto = require("crypto");
const { createWpClient } = require("../../integrations/wordpress/wp_client");
const { normalizeStoryArgs } = require("../../usecases/story/story_args");
const {
  generateDailyDraft,
  buildDailyTitle,
  buildDailyEyecatchLines,
  buildAioseoMeta,
  markdownToHtml,
  escapeHtml,
} = require("../../usecases/channels/blog/blog_daily");
const { renderBlogEyecatchJpeg } = require("../../engine/channels/blog/blog_eyecatch");

function requiredEnv(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const BLOG_LOCK_TTL_MS = 20 * 60 * 1000;

function nowIso(ms = Date.now()) {
  return new Date(ms).toISOString();
}

async function acquireBlogLock(db, slug, { force = false } = {}) {
  const runId = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

  const ref = db.collection("cronLocks").doc(`blog_daily_${slug}`);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data() || {};
      const status = String(data.status || "");
      const startedAtMs = Number(data.startedAtMs || 0);
      const isStale = startedAtMs > 0 && (now - startedAtMs) > BLOG_LOCK_TTL_MS;

      if (status === "done" && !force) {
        return { ok: false, reason: "done", data };
      }
      if (status === "running" && !isStale) {
        return { ok: false, reason: "running", data };
      }
    }

    tx.set(ref, {
      status: "running",
      slug,
      runId,
      startedAtMs: now,
      startedAt: nowIso(now),
    }, { merge: true });

    return { ok: true, runId };
  });
}

async function markBlogLock(ref, patch) {
  const now = Date.now();
  await ref.set({
    ...patch,
    finishedAtMs: now,
    finishedAt: nowIso(now),
  }, { merge: true });
}

async function runDailyBlog({ env, storyService, db }, { dateLocal, asOfISO, dryRun = false, publish = undefined, force = false }) {
  const t0 = Date.now();
  const mark = (label, meta = null) => {
    const ms = Date.now() - t0;
    if (meta) {
      console.log(`[cron/blog/daily] ${label} +${ms}ms`, meta);
    } else {
      console.log(`[cron/blog/daily] ${label} +${ms}ms`);
    }
  };

  mark("start", { dateLocal, dryRun: !!dryRun, force: !!force });

  requiredEnv("OPENAI_API_KEY", env.OPENAI_API_KEY);
  requiredEnv("WP_BASE_URL", env.WP_BASE_URL);
  requiredEnv("WP_USER", env.WP_USER);
  requiredEnv("WP_APP_PASSWORD", env.WP_APP_PASSWORD);
  requiredEnv("WP_CATEGORY_DAILY", env.WP_CATEGORY_DAILY);

  if (!db) throw new Error("db is required for blog daily lock");

  const slug = String(dateLocal);

  let lockRef = null;
  let lockRunId = null;
  if (!dryRun) {
    const lock = await acquireBlogLock(db, slug, { force });
    if (!lock.ok) {
      mark("lock_skip", { reason: lock.reason, slug });
      mark("end", { ok: true, skipped: true, reason: lock.reason, slug });
      return { ok: true, skipped: true, reason: lock.reason, slug };
    }
    lockRunId = lock.runId;
    lockRef = db.collection("cronLocks").doc(`blog_daily_${slug}`);
    mark("lock_acquired", { slug, runId: lockRunId });
  }

  mark("story_before");
  const story = await storyService.buildStoryForUser(
    normalizeStoryArgs({
      appUserId: "public",
      dateLocal,
      asOfISO,
      mode: "public",
    })
  );
  mark("story_after");

  mark("openai_before");
  let content = await generateDailyDraft({
    story,
    dateLocal,
    openai: {
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL_BLOG || env.OPENAI_MODEL,
      modelBlog: env.OPENAI_MODEL_BLOG || env.OPENAI_MODEL,
      modelBlogParts: env.OPENAI_MODEL_BLOG_PARTS || null,
      mode: env.BLOG_GEN_MODE || "single",
    },
  });
  mark("openai_after");

  const title = buildDailyTitle(story, dateLocal);
  const hasHtmlHeadings = /<h[23][\s>]/i.test(String(content || ""));
  content = hasHtmlHeadings
    ? content
    : markdownToHtml(content, { h1: "" });

  if (dryRun) {
    mark("end", { ok: true, dryRun: true, slug });
    return {
      ok: true,
      dryRun: true,
      slug,
      title,
      content,
    };
  }

  mark("wp_before");
  const wp = createWpClient({
    baseUrl: env.WP_BASE_URL,
    user: env.WP_USER,
    appPassword: env.WP_APP_PASSWORD,
  });

  const shouldPublish = publish === undefined
    ? !!env.BLOG_AUTO_PUBLISH
    : !!publish;
  const payload = {
    title,
    slug,
    status: shouldPublish ? "publish" : "draft",
    content,
    categories: [Number(env.WP_CATEGORY_DAILY)],
  };

  const aioseoMeta = buildAioseoMeta({ story, dateLocal, title });
  if (aioseoMeta && Object.values(aioseoMeta).some((v) => String(v || "").trim())) {
    payload.meta = { ...(payload.meta || {}), ...aioseoMeta };
  }

  try {
    const existing = await wp.getPostBySlug(slug);
    let featuredMediaId = existing?.featured_media || null;

    if (!featuredMediaId && env.BLOG_EYECATCH_ENABLED) {
      const { line1, line2, line3 } = buildDailyEyecatchLines(story, dateLocal);
      const dateLabel = String(dateLocal || "").trim().replace(/-/g, ".");
      const rendered = await renderBlogEyecatchJpeg({
        bgPath: env.BLOG_EYECATCH_BG_PATH,
        bgMode: env.BLOG_EYECATCH_BG_MODE || "image",
        story,
        dateLabel,
        line1,
        line2,
        line3,
        preset: env.BLOG_EYECATCH_PRESET || "C",
      });
      if (rendered?.ok && rendered.buffer) {
        const filename = `sora-eyecatch-${slug}.jpg`;
        const media = await wp.uploadMedia({
          filename,
          buffer: rendered.buffer,
          mimeType: "image/jpeg",
        });
        featuredMediaId = media?.id || null;
        if (featuredMediaId) {
          const altText = [line1, line2].filter(Boolean).join("｜");
          if (altText) {
            await wp.updateMedia(featuredMediaId, { alt_text: altText, title: altText });
          }
        }
      } else if (env.BLOG_EYECATCH_ENABLED) {
        console.log("[cron/blog/daily] eyecatch skipped: bg_missing");
      }
    }

    if (featuredMediaId) {
      payload.featured_media = featuredMediaId;
    }

    if (existing?.id) {
      const updated = await wp.updatePost(existing.id, payload);
      mark("wp_after", { updated: true, id: updated?.id });
      if (lockRef) await markBlogLock(lockRef, { status: "done", runId: lockRunId, wpPostId: updated?.id });
      mark("end", { ok: true, updated: true, id: updated?.id });
      return { ok: true, updated: true, id: updated.id, link: updated.link };
    }

    const created = await wp.createPost(payload);
    mark("wp_after", { created: true, id: created?.id });
    if (lockRef) await markBlogLock(lockRef, { status: "done", runId: lockRunId, wpPostId: created?.id });
    mark("end", { ok: true, created: true, id: created?.id });
    return { ok: true, created: true, id: created.id, link: created.link };
  } catch (e) {
    if (lockRef) {
      await markBlogLock(lockRef, { status: "failed", runId: lockRunId, error: e?.message || String(e) });
    }
    throw e;
  }
}

module.exports = { runDailyBlog };
