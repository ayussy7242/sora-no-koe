"use strict";

const crypto = require("crypto");
const sharp = require("sharp");
const { createWpClient } = require("../../integrations/wordpress/wp_client");
const { buildSoraWheelSvg } = require("../../engine/graphics/sora_wheel");
const {
  generateDailyDraft,
  buildDailyTitle,
  buildDailyEyecatchLines,
  markdownToHtml,
  escapeHtml,
} = require("../../usecases/channels/blog/blog_daily");
const { renderBlogEyecatchJpeg } = require("../../engine/renderers/blog/blog_eyecatch");
const { buildPublicStorySnapshot } = require("../../usecases/story/store");

function requiredEnv(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const BLOG_LOCK_TTL_MS = 20 * 60 * 1000;
const WHEEL_MARKER = "<!--SORA_WHEEL_MEDIA-->";

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
  mark("eyecatch_config", {
    enabled: !!env.BLOG_EYECATCH_ENABLED,
    mode: env.BLOG_EYECATCH_BG_MODE || "image",
    preset: env.BLOG_EYECATCH_PRESET || "C",
    force: !!env.BLOG_EYECATCH_FORCE,
    bgPath: env.BLOG_EYECATCH_BG_PATH || null,
  });

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
  const story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;
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

  const wheelMode = String(env.BLOG_WHEEL_MODE || process.env.BLOG_WHEEL_MODE || "media").toLowerCase();
  if (wheelMode === "media" && content.includes(WHEEL_MARKER)) {
    if (dryRun) {
      content = content.replace(WHEEL_MARKER, "");
    } else {
      try {
        mark("wheel_render_before");
        const dateLabel = String(dateLocal || story?.meta?.date_local || story?.public?.date_local || "")
          .trim()
          .replace(/-/g, ".");
        const svg = buildSoraWheelSvg({ story, dateLabel, size: 1200 });
        const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
        const filename = `sora-wheel-${dateLocal || dateLabel || Date.now()}.png`;
        mark("wheel_upload_before");
        const wp = createWpClient({
          baseUrl: env.WP_BASE_URL,
          user: env.WP_USER,
          appPassword: env.WP_APP_PASSWORD,
        });
        const media = await wp.uploadMedia({
          filename,
          buffer: pngBuffer,
          mimeType: "image/png",
        });
        const url = media?.source_url || media?.guid?.rendered || null;
        mark("wheel_upload_after", { id: media?.id || null });
        if (url) {
          const wheelHtml = [
            "<div style=\"max-width:720px;margin:28px auto 40px;\">",
            `<img src="${url}" alt="今日のソラ" style="width:100%;height:auto;display:block;" />`,
            "</div>",
          ].join("\n");
          content = content.replace(WHEEL_MARKER, wheelHtml);
        } else {
          content = content.replace(WHEEL_MARKER, "");
        }
      } catch (e) {
        console.error("[cron/blog/daily] wheel render/upload failed:", e?.message || String(e));
        if (e?.stack) console.error(e.stack);
        content = content.replace(WHEEL_MARKER, "");
      }
    }
  }

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


  try {
    mark("wp_get_post_before");
    const existing = await wp.getPostBySlug(slug);
    mark("wp_get_post_after", { found: !!existing?.id });
    let featuredMediaId = existing?.featured_media || null;
    if (featuredMediaId && env.BLOG_EYECATCH_FORCE) {
      featuredMediaId = null;
      console.log("[cron/blog/daily] eyecatch force: will overwrite existing featured_media");
    }

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
        mark("wp_media_upload_before");
        const media = await wp.uploadMedia({
          filename,
          buffer: rendered.buffer,
          mimeType: "image/jpeg",
        });
        mark("wp_media_upload_after", { id: media?.id || null });
        featuredMediaId = media?.id || null;
        if (featuredMediaId) {
          const altText = [line1, line2].filter(Boolean).join("｜");
          if (altText) {
            mark("wp_media_update_before");
            await wp.updateMedia(featuredMediaId, { alt_text: altText, title: altText });
            mark("wp_media_update_after", { id: featuredMediaId });
          }
        }
      } else {
        console.log("[cron/blog/daily] eyecatch failed:", rendered?.error || "unknown");
      }
    } else if (!env.BLOG_EYECATCH_ENABLED) {
      console.log("[cron/blog/daily] eyecatch skipped: disabled");
    }

    if (featuredMediaId) {
      payload.featured_media = featuredMediaId;
    }

    if (existing?.id) {
      mark("wp_update_post_before", { id: existing.id });
      const updated = await wp.updatePost(existing.id, payload);
      mark("wp_update_post_after", { id: updated?.id });
      mark("wp_after", { updated: true, id: updated?.id });
      if (lockRef) await markBlogLock(lockRef, { status: "done", runId: lockRunId, wpPostId: updated?.id });
      mark("end", { ok: true, updated: true, id: updated?.id });
      return { ok: true, updated: true, id: updated.id, link: updated.link };
    }

    mark("wp_create_post_before");
    const created = await wp.createPost(payload);
    mark("wp_create_post_after", { id: created?.id });
    mark("wp_after", { created: true, id: created?.id });
    if (lockRef) await markBlogLock(lockRef, { status: "done", runId: lockRunId, wpPostId: created?.id });
    mark("end", { ok: true, created: true, id: created?.id });
    return { ok: true, created: true, id: created.id, link: created.link };
  } catch (e) {
    console.error("[cron/blog/daily] failed:", e?.message || String(e));
    if (e?.stack) console.error(e.stack);
    if (lockRef) {
      await markBlogLock(lockRef, { status: "failed", runId: lockRunId, error: e?.message || String(e) });
    }
    throw e;
  }
}

module.exports = { runDailyBlog };
