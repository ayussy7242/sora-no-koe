"use strict";

const { createWpClient } = require("../engine/blog/wp_client");
const { generateDailyDraft, buildDailyTitle, markdownToHtml, escapeHtml } = require("../engine/blog/daily");

function requiredEnv(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function runDailyBlog({ env, storyService }, { dateLocal, asOfISO, dryRun = false }) {
  requiredEnv("OPENAI_API_KEY", env.OPENAI_API_KEY);
  requiredEnv("WP_BASE_URL", env.WP_BASE_URL);
  requiredEnv("WP_USER", env.WP_USER);
  requiredEnv("WP_APP_PASSWORD", env.WP_APP_PASSWORD);
  requiredEnv("WP_CATEGORY_DAILY", env.WP_CATEGORY_DAILY);

  const story = await storyService.buildStoryForUser({
    appUserId: "public",
    dateLocal,
    asOfISO,
    mode: "public",
  });

  let content = await generateDailyDraft({
    story,
    dateLocal,
    openai: {
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL,
    },
  });

  const slug = String(dateLocal);
  const title = buildDailyTitle(story, dateLocal);
  const hasHtmlHeadings = /<h[23][\s>]/i.test(String(content || ""));
  content = hasHtmlHeadings
    ? content
    : markdownToHtml(content, { h1: "" });

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      slug,
      title,
      content,
    };
  }

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
    return { ok: true, updated: true, id: updated.id, link: updated.link };
  }

  const created = await wp.createPost(payload);
  return { ok: true, created: true, id: created.id, link: created.link };
}

module.exports = { runDailyBlog };
