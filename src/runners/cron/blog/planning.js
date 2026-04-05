"use strict";

const sharp = require("sharp");
const { createWpClient } = require("../../../integrations/wordpress/client");
const { buildSoraWheelSvg } = require("../../../engine/graphics/sora_wheel");
const {
  generateDailyDraft,
  buildDailyTitle,
  markdownToHtml,
} = require("../../../usecases/channels/blog/daily");
const { buildPublicStorySnapshot } = require("../../../usecases/story/store");

const WHEEL_MARKER = "<!--SORA_WHEEL_MEDIA-->";

async function buildDailyPlan({ env, storyService, dateLocal, asOfISO, runDry = false, mark = () => {} } = {}) {
  if (!storyService) throw new Error("storyService is required");

  mark("story_before");
  const story = (await buildPublicStorySnapshot({ storyService, dateLocal, asOfISO, save: false })).story;
  mark("story_after");

  mark("openai_before");
  let content = await generateDailyDraft({
    story,
    dateLocal,
    openai: {
      apiKey: env?.OPENAI_API_KEY,
      baseUrl: env?.OPENAI_BASE_URL,
      model: env?.OPENAI_MODEL_BLOG || env?.OPENAI_MODEL,
      modelBlog: env?.OPENAI_MODEL_BLOG || env?.OPENAI_MODEL,
      modelBlogParts: env?.OPENAI_MODEL_BLOG_PARTS || null,
      mode: env?.BLOG_GEN_MODE || "single",
    },
  });
  mark("openai_after");

  const title = buildDailyTitle(story, dateLocal);
  const hasHtmlHeadings = /<h[23][\s>]/i.test(String(content || ""));
  content = hasHtmlHeadings ? content : markdownToHtml(content, { h1: "" });

  const wheelMode = String(env?.BLOG_WHEEL_MODE || process.env.BLOG_WHEEL_MODE || "media").trim().toLowerCase();
  const hasWheelMarker = content.includes(WHEEL_MARKER);
  if (hasWheelMarker) {
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
          baseUrl: env?.WP_BASE_URL,
          user: env?.WP_USER,
          appPassword: env?.WP_APP_PASSWORD,
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

  return {
    story,
    title,
    content,
    slug: String(dateLocal || ""),
  };
}

module.exports = {
  buildDailyPlan,
};
