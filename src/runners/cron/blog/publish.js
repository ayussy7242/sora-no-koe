"use strict";

const { createWpClient } = require("../../../integrations/wordpress/client");
const { renderBlogEyecatchJpeg } = require("../../../engine/renderers/blog/blog_eyecatch");
const { buildDailyEyecatchLines } = require("../../../usecases/channels/blog/daily");

async function publishDailyPost({ env, plan, publish, mark = () => {} } = {}) {
  if (!plan) throw new Error("plan missing");
  const { story, title, content, slug } = plan;

  mark("wp_before");
  const wp = createWpClient({
    baseUrl: env?.WP_BASE_URL,
    user: env?.WP_USER,
    appPassword: env?.WP_APP_PASSWORD,
  });

  const shouldPublish = publish === undefined
    ? !!env?.BLOG_AUTO_PUBLISH
    : !!publish;
  const payload = {
    title,
    slug,
    status: shouldPublish ? "publish" : "draft",
    content,
    categories: [Number(env?.WP_CATEGORY_DAILY)],
  };

  mark("wp_get_post_before");
  const existing = await wp.getPostBySlug(slug);
  mark("wp_get_post_after", { found: !!existing?.id });
  let featuredMediaId = existing?.featured_media || null;
  if (featuredMediaId && env?.BLOG_EYECATCH_FORCE) {
    featuredMediaId = null;
    console.log("[cron/blog/daily] eyecatch force: will overwrite existing featured_media");
  }

  if (!featuredMediaId && env?.BLOG_EYECATCH_ENABLED) {
    const { line1, line2, line3 } = buildDailyEyecatchLines(story, slug);
    const dateLabel = String(slug || "").trim().replace(/-/g, ".");
    const rendered = await renderBlogEyecatchJpeg({
      bgPath: env?.BLOG_EYECATCH_BG_PATH,
      bgMode: env?.BLOG_EYECATCH_BG_MODE || "image",
      story,
      dateLabel,
      line1,
      line2,
      line3,
      preset: env?.BLOG_EYECATCH_PRESET || "C",
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
  } else if (!env?.BLOG_EYECATCH_ENABLED) {
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
    return { ok: true, updated: true, id: updated.id, link: updated.link };
  }

  try {
    mark("wp_create_post_before");
    const created = await wp.createPost(payload);
    mark("wp_create_post_after", { id: created?.id });
    mark("wp_after", { created: true, id: created?.id });
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
        return { ok: true, updated: true, id: updated.id, link: updated.link, fallback: true };
      }
    } catch (fallbackErr) {
      console.error("[cron/blog/daily] wp_create_fallback_failed:", fallbackErr?.message || String(fallbackErr));
      if (fallbackErr?.stack) console.error(fallbackErr.stack);
    }
    throw e;
  }
}

module.exports = {
  publishDailyPost,
};
