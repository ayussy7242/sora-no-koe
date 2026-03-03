"use strict";

const { createWpClient } = require("../../integrations/wordpress/wp_client");
const { normalizeStoryArgs } = require("../../usecases/story/story_args");
const { generateDailyDraft, buildDailyTitle, markdownToHtml, escapeHtml } = require("../../usecases/daily/blog_daily");

function requiredEnv(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function runDailyBlog({ env, storyService }, { dateLocal, asOfISO, dryRun = false }) {
  const t0 = Date.now();
  const mark = (label, meta = null) => {
    const ms = Date.now() - t0;
    if (meta) {
      console.log(`[cron/blog/daily] ${label} +${ms}ms`, meta);
    } else {
      console.log(`[cron/blog/daily] ${label} +${ms}ms`);
    }
  };

  mark("start", { dateLocal, dryRun: !!dryRun });

  requiredEnv("OPENAI_API_KEY", env.OPENAI_API_KEY);
  requiredEnv("WP_BASE_URL", env.WP_BASE_URL);
  requiredEnv("WP_USER", env.WP_USER);
  requiredEnv("WP_APP_PASSWORD", env.WP_APP_PASSWORD);
  requiredEnv("WP_CATEGORY_DAILY", env.WP_CATEGORY_DAILY);

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

  const slug = String(dateLocal);
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

  const payload = {
    title,
    slug,
    status: "draft",
    content,
    categories: [Number(env.WP_CATEGORY_DAILY)],
  };

  const existing = await wp.getPostBySlug(slug);
  if (existing?.id) {
    const updated = await wp.updatePost(existing.id, payload);
    mark("wp_after", { updated: true, id: updated?.id });
    mark("end", { ok: true, updated: true, id: updated?.id });
    return { ok: true, updated: true, id: updated.id, link: updated.link };
  }

  const created = await wp.createPost(payload);
  mark("wp_after", { created: true, id: created?.id });
  mark("end", { ok: true, created: true, id: created?.id });
  return { ok: true, created: true, id: created.id, link: created.link };
}

module.exports = { runDailyBlog };
