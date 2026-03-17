"use strict";

function buildSectionText({ title, body, sticker }) {
  const lines = [`【${title}】`];
  if (body) lines.push(String(body));
  if (sticker) lines.push(sticker);
  return lines.join("\n");
}

function formatIgStoryLinePayload({ dateLocal, images = {}, storyTexts = {} } = {}) {
  const header = `🌌 IG Story素材｜${dateLocal}`;

  const today = storyTexts?.today || {};
  const resonance = storyTexts?.resonance || {};
  const tomorrow = storyTexts?.tomorrow || {};

  const messages = [{ type: "text", text: header }];

  if (images.today) {
    messages.push({ type: "image", originalContentUrl: images.today, previewImageUrl: images.today });
  }
  messages.push({
    type: "text",
    text: buildSectionText({
      title: today.title || "今日の空",
      body: today.body || "",
      sticker: today.sticker_type === "poll"
        ? "スタンプ: 投票（何か感じた / 静かな日）"
        : "",
    }),
  });

  if (images.resonance) {
    messages.push({ type: "image", originalContentUrl: images.resonance, previewImageUrl: images.resonance });
  }
  messages.push({
    type: "text",
    text: buildSectionText({
      title: resonance.title || "今日の共鳴",
      body: resonance.body || "",
      sticker: resonance.sticker_type === "slider"
        ? "スタンプ: スライダー（✨）"
        : "",
    }),
  });

  if (images.tomorrow) {
    messages.push({ type: "image", originalContentUrl: images.tomorrow, previewImageUrl: images.tomorrow });
  }
  messages.push({
    type: "text",
    text: buildSectionText({
      title: tomorrow.title || "明日の空",
      body: tomorrow.body || "",
      sticker: "",
    }),
  });

  return { header, messages };
}

module.exports = { formatIgStoryLinePayload };
