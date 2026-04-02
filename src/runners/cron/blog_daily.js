"use strict";

const path = require("path");
const sharp = require("sharp");
const { createWpClient } = require("../../integrations/wordpress/client");
const { buildSoraWheelSvg } = require("../../engine/graphics/sora_wheel");
const {
  generateDailyDraft,
  buildDailyTitle,
  buildDailyEyecatchLines,
  markdownToHtml,
  escapeHtml,
} = require("../../usecases/channels/blog/daily");
const { renderBlogEyecatchJpeg } = require("../../engine/renderers/blog/blog_eyecatch");
const { buildPublicStorySnapshot } = require("../../usecases/story/store");
const { toBool } = require("../../utils/data/bool");
const { ensureDir } = require("../../utils/infra/fs");
const { acquireCronLock, markCronLock } = require("./shared/locks");
const { writeTextFile, writeJsonFile } = require("./shared/io");

function requiredEnv(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function writeLocalBlogOutput({ outDir, dateLocal, title, content }) {
  const dir = outDir || path.join(process.cwd(), "tmp", "blog", "daily", dateLocal || "unknown");
  ensureDir(dir);
  const htmlPath = writeTextFile({
    outDir: dir,
    filename: `daily_${dateLocal || "unknown"}.html`,
    content: content || "",
    encoding: "utf8",
  });
  const jsonPath = writeJsonFile({
    outDir: dir,
    filename: `daily_${dateLocal || "unknown"}.json`,
    data: { date_local: dateLocal || null, title: title || "", content: content || "" },
    space: 2,
  });
  return { dir, html_path: htmlPath, json_path: jsonPath };
}

const BLOG_LOCK_TTL_MS = 20 * 60 * 1000;
const WHEEL_MARKER = "<!--SORA_WHEEL_MEDIA-->";

async function runDailyBlog(
  { env, storyService, db },
  {
    dateLocal,
    asOfISO,
    dryRun = false,
    publish = undefined,
    force = false,
    local = false,
    local_only = false,
    localOnly = false,
    local_out_dir = null,
    localOutDir: localOutDirOpt = null,
  }
) {
  const t0 = Date.now();
  const mark = (label, meta = null) => {
    const ms = Date.now() - t0;
    if (meta) {
      console.log(`[cron/blog/daily] ${label} +${ms}ms`, meta);
    } else {
      console.log(`[cron/blog/daily] ${label} +${ms}ms`);
    }
  };

  const env2 = { ...(env || {}), ...(process.env || {}) };
  const localOnlyFlag = toBool(local ?? local_only ?? localOnly ?? env2.BLOG_DAILY_LOCAL_ONLY, false);
  const localOutDir = String(
    localOutDirOpt ||
    local_out_dir ||
    env2.BLOG_DAILY_LOCAL_OUT_DIR ||
    path.join(process.cwd(), "tmp", "blog", "daily", dateLocal || "unknown")
  );
  const runDry = !!dryRun || localOnlyFlag;

  mark("start", { dateLocal, dryRun: !!dryRun, force: !!force });
  mark("eyecatch_config", {
    enabled: !!env2.BLOG_EYECATCH_ENABLED,
    mode: env2.BLOG_EYECATCH_BG_MODE || "image",
    preset: env2.BLOG_EYECATCH_PRESET || "C",
    force: !!env2.BLOG_EYECATCH_FORCE,
    bgPath: env2.BLOG_EYECATCH_BG_PATH || null,
  });

  requiredEnv("OPENAI_API_KEY", env2.OPENAI_API_KEY);
  if (!localOnlyFlag) {
    requiredEnv("WP_BASE_URL", env2.WP_BASE_URL);
    requiredEnv("WP_USER", env2.WP_USER);
    requiredEnv("WP_APP_PASSWORD", env2.WP_APP_PASSWORD);
    requiredEnv("WP_CATEGORY_DAILY", env2.WP_CATEGORY_DAILY);
  }

  if (!db && !localOnlyFlag) throw new Error("db is required for blog daily lock");

  const slug = String(dateLocal);

  let lockId = null;
  let lockRunId = null;
  if (!runDry) {
    const id = `blog_daily_${slug}`;
    const lock = await acquireCronLock(db, id, {
      force,
      ttlMs: BLOG_LOCK_TTL_MS,
      meta: { slug },
    });
    if (!lock.ok) {
      mark("lock_skip", { reason: lock.reason, slug });
      mark("end", { ok: true, skipped: true, reason: lock.reason, slug });
      return { ok: true, skipped: true, reason: lock.reason, slug };
    }
    lockRunId = lock.runId;
    lockId = id;
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
      apiKey: env2.OPENAI_API_KEY,
      baseUrl: env2.OPENAI_BASE_URL,
      model: env2.OPENAI_MODEL_BLOG || env2.OPENAI_MODEL,
      modelBlog: env2.OPENAI_MODEL_BLOG || env2.OPENAI_MODEL,
      modelBlogParts: env2.OPENAI_MODEL_BLOG_PARTS || null,
      mode: env2.BLOG_GEN_MODE || "single",
    },
  });
  mark("openai_after");

  const title = buildDailyTitle(story, dateLocal);
  const hasHtmlHeadings = /<h[23][\s>]/i.test(String(content || ""));
  content = hasHtmlHeadings
    ? content
    : markdownToHtml(content, { h1: "" });

  const wheelMode = String(env2.BLOG_WHEEL_MODE || process.env.BLOG_WHEEL_MODE || "media").toLowerCase();
  if (wheelMode === "media" && content.includes(WHEEL_MARKER)) {
    if (runDry) {
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

  if (runDry) {
    mark("end", { ok: true, dryRun: true, slug });
    if (localOnlyFlag) {
      const local = writeLocalBlogOutput({ outDir: localOutDir, dateLocal, title, content });
      return {
        ok: true,
        dryRun: true,
        local_only: true,
        slug,
        title,
        content,
        local_dir: local.dir,
        local_html_path: local.html_path,
        local_json_path: local.json_path,
      };
    }
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
    baseUrl: env2.WP_BASE_URL,
    user: env2.WP_USER,
    appPassword: env2.WP_APP_PASSWORD,
  });

  const shouldPublish = publish === undefined
    ? !!env2.BLOG_AUTO_PUBLISH
    : !!publish;
  const payload = {
    title,
    slug,
    status: shouldPublish ? "publish" : "draft",
    content,
    categories: [Number(env2.WP_CATEGORY_DAILY)],
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
      if (lockId) await markCronLock(db, lockId, { status: "done", runId: lockRunId, wpPostId: updated?.id });
      mark("end", { ok: true, updated: true, id: updated?.id });
      return { ok: true, updated: true, id: updated.id, link: updated.link };
    }

    try {
      mark("wp_create_post_before");
      const created = await wp.createPost(payload);
      mark("wp_create_post_after", { id: created?.id });
      mark("wp_after", { created: true, id: created?.id });
      if (lockId) await markCronLock(db, lockId, { status: "done", runId: lockRunId, wpPostId: created?.id });
      mark("end", { ok: true, created: true, id: created?.id });
      return { ok: true, created: true, id: created.id, link: created.link };
    } catch (e) {
      mark("wp_create_post_error", {
        message: e?.message || String(e),
        status: e?.status,
        wpCode: e?.response?.code,
      });
      // Fallback: WP sometimes returns 500 even though the post was created.
      try {
        mark("wp_create_post_fallback_get_before");
        const existingAfter = await wp.getPostBySlug(slug);
        mark("wp_create_post_fallback_get_after", { found: !!existingAfter?.id });
        if (existingAfter?.id) {
          mark("wp_update_post_before", { id: existingAfter.id, fallback: true });
          const updated = await wp.updatePost(existingAfter.id, payload);
          mark("wp_update_post_after", { id: updated?.id, fallback: true });
          mark("wp_after", { updated: true, id: updated?.id, fallback: true });
          if (lockId) await markCronLock(db, lockId, { status: "done", runId: lockRunId, wpPostId: updated?.id });
          mark("end", { ok: true, updated: true, id: updated?.id, fallback: true });
          return { ok: true, updated: true, id: updated.id, link: updated.link, fallback: true };
        }
      } catch (fallbackErr) {
        console.error("[cron/blog/daily] wp_create_fallback_failed:", fallbackErr?.message || String(fallbackErr));
        if (fallbackErr?.stack) console.error(fallbackErr.stack);
      }
      throw e;
    }
  } catch (e) {
    console.error("[cron/blog/daily] failed:", e?.message || String(e));
    if (e?.stack) console.error(e.stack);
    if (lockId) {
      await markCronLock(db, lockId, { status: "failed", runId: lockRunId, error: e?.message || String(e) });
    }
    throw e;
  }
}

module.exports = { runDailyBlog };
